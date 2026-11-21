-- Spec §8.5 (21 Nov 2026): Submit for Approval (post-approval types) goes to an approver the worker chooses.
-- Eligible approvers: the ticket's reporter, the worker's manager, the Director (top user), and on Financial
-- tickets any Finance team member. Never the worker themself (except the Director, who self-approves).
-- The ticket is assigned to the chosen approver (Assigned to Me), the worker is remembered in
-- approval_worker; Approve or Reject hands the ticket back to the worker (Reject → In Progress for rework).
-- Financial pre-approval is unchanged.

alter table public.tickets add column if not exists approval_worker text;

create or replace function public.eligible_approvers(p_ticket_id text, p_worker text)
returns setof text language sql stable security definer set search_path = public, pg_temp as $function$
  with t as (select * from public.tickets where id = p_ticket_id),
  candidates as (
    select nullif(trim(t.reporter), '') as id from t
    union select public.approver_for(p_worker)::text
    union select public.top_user()::text
    union select u.id::text from public.app_users u, t
      where t.ticket_type_key = 'financial' and u.team = 'Finance' and u.active
  )
  select c.id from candidates c
  join public.app_users u on u.id::text = c.id and u.active
  where c.id is not null and (c.id <> p_worker or c.id = public.top_user()::text);
$function$;
revoke all on function public.eligible_approvers(text, text) from public, anon, authenticated;
grant execute on function public.eligible_approvers(text, text) to service_role;

-- Activity text shows names, not ids.
create or replace function public.apply_workflow_action(p_ticket_id text, p_action_id text, p_changed_by text, p_new_assignee text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS tickets
 LANGUAGE plpgsql
AS $function$
declare
  v_ticket public.tickets%rowtype;
  v_definition jsonb;
  v_action jsonb;
  v_to_state jsonb;
  v_from_state jsonb;
  v_now timestamptz := now();
  v_by text := nullif(trim(coalesce(p_changed_by, '')), '');
  v_new text := nullif(trim(coalesce(p_new_assignee, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_previous text;
  v_assignee text;
  v_group text;
  v_assign text;
  v_same_state boolean;
  v_events jsonb := '[]'::jsonb;
  v_text text;
  v_unassigned boolean;
begin
  if v_by is null then
    raise exception 'The person performing the action is required';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_ticket.workflow_version_id is null then
    raise exception 'This ticket has no workflow';
  end if;

  select v.definition into v_definition
  from public.workflow_versions v
  where v.id::text = v_ticket.workflow_version_id::text;
  if v_definition is null then
    raise exception 'The workflow of this ticket could not be found';
  end if;

  select a into v_action
  from jsonb_array_elements(v_definition -> 'transitions') as a
  where a ->> 'id' = p_action_id
  limit 1;
  if v_action is null then
    raise exception 'This action does not exist in the ticket''s workflow';
  end if;
  if not (v_action -> 'from') ? v_ticket.workflow_state then
    raise exception '% is not available while the ticket is in its current state', v_action ->> 'label';
  end if;

  select s into v_to_state from jsonb_array_elements(v_definition -> 'states') as s where s ->> 'key' = v_action ->> 'to' limit 1;
  select s into v_from_state from jsonb_array_elements(v_definition -> 'states') as s where s ->> 'key' = v_ticket.workflow_state limit 1;
  if v_to_state is null then
    raise exception 'The target state of this action is missing from the workflow';
  end if;

  if (coalesce((v_action ->> 'requireNote')::boolean, false) or p_action_id in ('pass_on', 'complete')) and v_note is null then
    raise exception 'A comment is required for %', v_action ->> 'label';
  end if;

  v_previous := coalesce(nullif(trim(v_ticket.assignee), ''), 'Unassigned');
  v_unassigned := v_previous = 'Unassigned';
  v_assignee := v_previous;
  v_assign := coalesce(v_action ->> 'assign', 'none');

  if v_assign = 'pick' then
    if v_new is null then
      raise exception 'Choose who the ticket is assigned to';
    end if;
    if v_new = v_previous and p_action_id in ('pass_on', 'pass', 'reopen') then
      raise exception 'Choose a different person than the current assignee';
    end if;
    v_assignee := v_new;
  elsif v_new is not null then
    v_assignee := v_new;
  elsif v_assign = 'reporter' then
    v_assignee := coalesce(nullif(trim(v_ticket.reporter), ''), v_previous);
  end if;

  v_group := coalesce(v_to_state ->> 'group', 'open');
  if v_group = 'in_progress' and v_assignee = 'Unassigned' then
    raise exception 'A ticket in progress needs one responsible assignee';
  end if;

  v_same_state := (v_action ->> 'to') = v_ticket.workflow_state;

  if not v_same_state then
    v_text := (v_action ->> 'label') || ': ' || coalesce(v_from_state ->> 'label', v_ticket.workflow_state)
      || ' to ' || (v_to_state ->> 'label');
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'at', v_now, 'by', v_by, 'text', v_text, 'comment', v_note));
  end if;

  if v_assignee is distinct from v_previous then
    v_text := case
      when v_unassigned then 'Assigned to ' || public.user_label(v_assignee)
      when p_action_id = 'complete' then 'Sent to ' || public.user_label(v_assignee) || ' for approval'
      when p_action_id in ('approve_post', 'reject_post') then 'Handed back to ' || public.user_label(v_assignee)
      else (v_action ->> 'label') || ': work passed from ' || public.user_label(v_previous) || ' to ' || public.user_label(v_assignee)
    end;
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'at', v_now, 'by', v_by, 'text', v_text, 'from', v_previous, 'to', v_assignee,
      'comment', case when v_same_state then v_note else null end));
    insert into public.ticket_assignment_history (ticket_id, from_assignee, to_assignee, changed_by, action_label, note, changed_at)
    values (v_ticket.id, v_previous, v_assignee, v_by, v_action ->> 'label', v_note, v_now);
  end if;

  if not v_same_state then
    insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at, action_label, note, workflow_version_id)
    values (v_ticket.id, v_ticket.workflow_state, v_action ->> 'to', v_by, v_now, v_action ->> 'label', v_note, v_ticket.workflow_version_id);
  end if;

  update public.tickets
  set workflow_state = v_action ->> 'to',
      status = public.workflow_group_status(v_group),
      assignee = v_assignee,
      completed_at = case when v_group in ('done', 'accepted') then coalesce(completed_at, v_now) else null end,
      history_log = coalesce(history_log, '[]'::jsonb) || v_events
  where id = v_ticket.id
  returning * into v_ticket;

  return v_ticket;
end;
$function$;

create or replace function public.apply_workflow_action_secure(p_ticket_id text, p_action_id text, p_actor text, p_role text, p_new_assignee text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ticket public.tickets%rowtype;
  v_actor text := nullif(trim(coalesce(p_actor, '')), '');
  v_new text := nullif(trim(coalesce(p_new_assignee, '')), '');
  v_assignee text;
  v_unassigned boolean;
  v_is_assignee boolean;
  v_is_reporter boolean;
  v_is_manager boolean;
  v_allowed boolean;
  v_reassign boolean;
  v_post_approval boolean;
  v_submits boolean;
  v_worker text;
  v_result public.tickets%rowtype;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);
  if v_actor is null or not exists (select 1 from public.app_users where id::text = v_actor and active) then
    raise exception 'Unknown user';
  end if;
  if v_new is not null and lower(v_new) = 'unassigned' then
    raise exception 'Choose a person, not Unassigned';
  end if;
  if v_new is not null and not exists (select 1 from public.app_users where id::text = v_new and active) then
    raise exception 'Choose an active user';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  v_assignee := coalesce(nullif(trim(v_ticket.assignee), ''), 'Unassigned');
  v_unassigned := v_assignee = 'Unassigned';
  v_is_assignee := not v_unassigned and v_actor = v_assignee;
  v_is_reporter := v_actor = trim(coalesce(v_ticket.reporter, ''));
  v_is_manager := public.is_manager_of(v_actor, case when v_unassigned then v_ticket.reporter else v_assignee end);
  v_reassign := v_new is not null and not v_unassigned and v_new <> v_assignee;
  select coalesce((t.config ->> 'post_approval')::boolean, false) into v_post_approval from public.ticket_types t where t.key = v_ticket.ticket_type_key;

  if v_ticket.parent_ticket_id is not null then
    select (v_actor = trim(coalesce(p.reporter, '')) or v_actor = trim(coalesce(p.assignee, '')))
      into v_allowed from public.tickets p where p.id = v_ticket.parent_ticket_id;
    v_allowed := coalesce(v_allowed, false) or public.is_manager_of(v_actor, v_assignee)
      or (p_action_id in ('start', 'complete') and v_is_assignee);
    if not v_allowed then
      raise exception 'You are not allowed to do this on this sub-task';
    end if;
    return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
  end if;

  -- Submit for Approval: the worker (assignee) chooses an eligible approver; the ticket moves to them.
  v_submits := p_action_id = 'complete' and v_post_approval;
  if v_submits then
    if not v_is_assignee then
      raise exception 'Only the assignee can submit the work for approval';
    end if;
    if v_new is null then
      raise exception 'Choose who should approve this work';
    end if;
    if not exists (select 1 from public.eligible_approvers(v_ticket.id, v_assignee) e where e = v_new) then
      raise exception '% cannot approve this work. Choose the reporter, %''s manager, the Director%.',
        public.user_label(v_new), public.user_label(v_assignee),
        case when v_ticket.ticket_type_key = 'financial' then ' or a Finance team member' else '' end;
    end if;
    perform 1 from public.tickets s where s.parent_ticket_id = v_ticket.id and s.workflow_state not in ('done', 'discarded');
    if found then
      raise exception 'Mark every open sub-task complete or discard it before submitting for approval';
    end if;
    v_result := public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
    update public.tickets set approval_worker = v_actor where id = v_ticket.id returning * into v_result;
    return v_result;
  end if;

  -- Approve / Reject: the chosen approver (now the assignee); older tickets fall back to the worker's manager.
  if p_action_id in ('approve_post', 'reject_post') then
    v_worker := nullif(trim(coalesce(v_ticket.approval_worker, '')), '');
    if v_worker is not null then
      v_allowed := v_is_assignee;
    else
      v_allowed := not v_unassigned and v_actor = public.approver_for(v_assignee)::text;
    end if;
    if not coalesce(v_allowed, false) then
      raise exception 'Only the chosen approver can approve or reject this work';
    end if;
    if p_action_id = 'approve_post' and exists (select 1 from public.tickets s where s.parent_ticket_id = v_ticket.id and s.workflow_state not in ('done', 'discarded')) then
      raise exception 'Mark every open sub-task complete or discard it before closing this ticket';
    end if;
    -- Approve or Reject hands the ticket back to the worker (Reject: In Progress for rework).
    v_result := public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_worker, p_note);
    update public.tickets set approval_worker = null where id = v_ticket.id returning * into v_result;
    return v_result;
  end if;

  v_allowed := case p_action_id
    when 'approve' then v_actor = public.ticket_pre_approver(v_ticket)
    when 'reject' then v_actor = public.ticket_pre_approver(v_ticket)
    when 'close' then v_is_reporter
    when 'assign' then (v_unassigned and (v_is_reporter or v_is_manager)) or (not v_unassigned and v_is_manager)
    when 'start' then v_is_assignee or (v_unassigned and v_new is not null and (v_is_reporter or v_is_manager)) or v_is_manager
    when 'complete' then v_is_assignee or (v_is_reporter and not v_post_approval)
    when 'hold' then v_is_manager
    when 'resume' then v_is_manager or v_is_assignee
    when 'reopen' then v_is_reporter or v_is_manager
    else v_is_assignee or v_is_reporter
  end;

  if v_allowed and v_reassign and not v_is_manager then
    v_allowed := false;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'You are not allowed to do this on this ticket';
  end if;

  if exists (
       select 1 from jsonb_array_elements((select definition from public.workflow_versions where id = v_ticket.workflow_version_id) -> 'transitions') a
       where a ->> 'id' = p_action_id and public.workflow_state_group((select definition from public.workflow_versions where id = v_ticket.workflow_version_id), a ->> 'to') in ('done', 'accepted'))
     and exists (select 1 from public.tickets s where s.parent_ticket_id = v_ticket.id and s.workflow_state not in ('done', 'discarded')) then
    raise exception 'Mark every open sub-task complete or discard it before closing this ticket';
  end if;

  return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
end;
$function$;
