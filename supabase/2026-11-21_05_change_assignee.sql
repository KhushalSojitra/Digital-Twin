-- Spec §8 (21 Nov 2026): Pass On is dropped. The Team tab's "Change assignee" replaces it:
--   main ticket: the reporter, or the current assignee's manager;
--   sub-task:    the main ticket's reporter or assignee, the sub-task's creator, or the sub-task assignee's manager.
-- Also: activity texts no longer show ticket ids (the UI shows titles only).

create or replace function public.change_ticket_assignee_secure(
  p_ticket_id text, p_new_assignee text, p_actor text, p_role text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_ticket public.tickets%rowtype;
  v_parent public.tickets%rowtype;
  v_group text;
  v_allowed boolean;
  v_now timestamptz := now();
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if not exists (select 1 from public.app_users where id::text = p_new_assignee and active) then
    raise exception 'Choose an active user as the new assignee';
  end if;
  if v_ticket.assignee = p_new_assignee then
    raise exception 'This person is already the assignee';
  end if;

  select s ->> 'group' into v_group
  from public.workflow_versions w, jsonb_array_elements(w.definition -> 'states') s
  where w.id = v_ticket.workflow_version_id and s ->> 'key' = v_ticket.workflow_state;
  if v_group in ('done', 'accepted', 'failed') then
    raise exception 'A finished ticket cannot be reassigned';
  end if;

  if v_ticket.parent_ticket_id is null then
    v_allowed := v_ticket.reporter = p_actor
      or (coalesce(v_ticket.assignee, 'Unassigned') <> 'Unassigned' and public.is_manager_of(p_actor, v_ticket.assignee));
  else
    select * into v_parent from public.tickets where id = v_ticket.parent_ticket_id;
    v_allowed := v_parent.reporter = p_actor
      or v_parent.assignee = p_actor
      or v_ticket.reporter = p_actor
      or (coalesce(v_ticket.assignee, 'Unassigned') <> 'Unassigned' and public.is_manager_of(p_actor, v_ticket.assignee));
  end if;
  if not coalesce(v_allowed, false) then
    raise exception 'You are not allowed to change the assignee of this ticket';
  end if;

  update public.tickets
  set assignee = p_new_assignee,
      history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at', v_now, 'by', p_actor,
        'text', 'Assignee changed from ' || public.user_label(coalesce(v_ticket.assignee, 'Unassigned'))
                || ' to ' || public.user_label(p_new_assignee)
                || coalesce(': ' || nullif(btrim(p_note), ''), '')))
  where id = p_ticket_id;

  -- The assignment trigger notifies the new assignee and adds them as a watcher.
  insert into public.ticket_assignment_history (ticket_id, from_assignee, to_assignee, changed_by, action_label, note, changed_at)
  values (p_ticket_id, coalesce(v_ticket.assignee, 'Unassigned'), p_new_assignee, p_actor, 'Change assignee',
          left(nullif(btrim(p_note), ''), 300), v_now);
end;
$function$;
revoke all on function public.change_ticket_assignee_secure(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.change_ticket_assignee_secure(text, text, text, text, text) to service_role;

-- Activity lines without ticket ids.
create or replace function public.create_subtask_internal(p_parent public.tickets, p_comment_id text, p_text text, p_assignee text, p_by text)
returns text language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_type public.ticket_types%rowtype;
  v_version public.workflow_versions%rowtype;
  v_n int;
  v_id text;
  v_now timestamptz := now();
  v_additional jsonb := p_parent.ptz_coordinates -> 'metadata' -> 'additional';
begin
  select * into v_type from public.ticket_types where key = 'subtask';
  select * into v_version from public.current_ticket_type_version(v_type.workflow_template_id);
  select count(*) + 1 into v_n from public.tickets where parent_ticket_id = p_parent.id;
  v_id := left(p_parent.id, 100) || '-S' || v_n;
  while exists (select 1 from public.tickets where id = v_id) loop
    v_n := v_n + 1;
    v_id := left(p_parent.id, 100) || '-S' || v_n;
  end loop;

  insert into public.tickets (id, ticket_id, created_at, status, title, description, priority, reporter, assignee,
                              camera_name, ptz_coordinates, history_log, replies, ticket_type_key, workflow_version_id,
                              workflow_state, parent_ticket_id, source_comment_id)
  values (v_id, v_id, v_now, 'to do', 'Sub-task of: ' || p_parent.title, p_text, p_parent.priority, p_by, p_assignee,
          null,
          jsonb_build_object('metadata', jsonb_build_object('type', 'subtask', 'source', 'SUBTASK', 'parentTicketId', p_parent.id,
                             'followers', to_jsonb(array[p_by])) ||
                             case when jsonb_typeof(v_additional) = 'object' then jsonb_build_object('additional', v_additional) else '{}'::jsonb end),
          jsonb_build_array(jsonb_build_object('at', v_now, 'by', p_by, 'text', 'Sub-task created from a comment on the main ticket')),
          '[]'::jsonb, 'subtask', v_version.id, 'todo', p_parent.id, p_comment_id);

  insert into public.ticket_assignment_history (ticket_id, from_assignee, to_assignee, changed_by, action_label, note, changed_at)
  values (v_id, 'Unassigned', p_assignee, p_by, 'Sub-task', left(p_text, 300), v_now);

  update public.tickets
  set history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at', v_now, 'by', p_by, 'text', 'Sub-task created for ' || public.user_label(p_assignee)))
  where id = p_parent.id;
  return v_id;
end;
$function$;
revoke all on function public.create_subtask_internal(public.tickets, text, text, text, text) from public, anon, authenticated;
