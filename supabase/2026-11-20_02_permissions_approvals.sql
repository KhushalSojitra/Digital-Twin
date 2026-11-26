-- Steps 2–3 of Spec-2026-11-19-Hierarchy-Subtasks: permissions, approval states, Pass On off, pre-approver.

-- 1. Ticket type config: pass_on default off, pre_approver (user id; null = top of hierarchy) -------
create or replace function public.normalize_ticket_type_config(p_config jsonb)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'pre_approval', coalesce((p_config ->> 'pre_approval')::boolean, false),
    'post_approval', coalesce((p_config ->> 'post_approval')::boolean, false),
    'on_hold', coalesce((p_config ->> 'on_hold')::boolean, false),
    'reopen', coalesce((p_config ->> 'reopen')::boolean, false),
    'pass_on', coalesce((p_config ->> 'pass_on')::boolean, false),
    'pre_approver', (select u.id::text from public.app_users u where u.id::text = p_config ->> 'pre_approver' and u.active)
  );
$$;

-- 2. Workflow built from a config ---------------------------------------------------------------
-- Pre-approval: the ticket starts in Pending Approval; no work before approval.
--   Approve -> To Do. Reject -> Rejected, handed back to the creator, who can Close it (record kept).
-- Post-approval: Complete -> Pending Post-approval. Approve -> Done. Reject -> In Progress, same assignee.
-- Assign: sets the first assignee while the ticket is To Do (state does not change).
create or replace function public.build_ticket_type_definition(p_config jsonb)
returns jsonb language plpgsql immutable as $function$
declare
  v_pre boolean := coalesce((p_config ->> 'pre_approval')::boolean, false);
  v_post boolean := coalesce((p_config ->> 'post_approval')::boolean, false);
  v_hold boolean := coalesce((p_config ->> 'on_hold')::boolean, false);
  v_reopen boolean := coalesce((p_config ->> 'reopen')::boolean, false);
  v_pass boolean := coalesce((p_config ->> 'pass_on')::boolean, false);
  v_states jsonb := '[]'::jsonb;
  v_tr jsonb := '[]'::jsonb;
begin
  if v_pre then
    v_states := v_states || '[{"key":"pending_approval","label":"Pre-approval","group":"open"}]'::jsonb;
  end if;
  v_states := v_states || '[{"key":"todo","label":"To Do","group":"open"},{"key":"in_progress","label":"In Progress","group":"in_progress"}]'::jsonb;
  if v_hold then
    v_states := v_states || '[{"key":"on_hold","label":"On Hold","group":"in_progress"}]'::jsonb;
  end if;
  if v_post then
    v_states := v_states || '[{"key":"pending_post_approval","label":"Post-approval","group":"in_progress"}]'::jsonb;
  end if;
  v_states := v_states || '[{"key":"done","label":"Done","group":"done"}]'::jsonb;
  if v_pre then
    v_states := v_states || '[{"key":"rejected","label":"Rejected","group":"open"},{"key":"closed","label":"Closed","group":"failed"}]'::jsonb;
    v_tr := v_tr || '[
      {"id":"approve","label":"Approve","from":["pending_approval"],"to":"todo","assign":"none","requireNote":false},
      {"id":"reject","label":"Reject","from":["pending_approval"],"to":"rejected","assign":"reporter","requireNote":true},
      {"id":"close","label":"Close","from":["rejected"],"to":"closed","assign":"none","requireNote":false}
    ]'::jsonb;
  end if;

  v_tr := v_tr || '[
    {"id":"assign","label":"Assign","from":["todo"],"to":"todo","assign":"pick","requireNote":false},
    {"id":"start","label":"Start Work","from":["todo"],"to":"in_progress","assign":"optional","requireNote":false}
  ]'::jsonb;

  v_tr := v_tr || jsonb_build_array(jsonb_build_object(
    'id', 'complete', 'label', case when v_post then 'Submit for Approval' else 'Complete Work' end,
    'from', '["in_progress"]'::jsonb,
    'to', case when v_post then 'pending_post_approval' else 'done' end,
    'assign', 'none', 'requireNote', true));

  if v_post then
    v_tr := v_tr || '[
      {"id":"approve_post","label":"Approve","from":["pending_post_approval"],"to":"done","assign":"none","requireNote":false},
      {"id":"reject_post","label":"Reject","from":["pending_post_approval"],"to":"in_progress","assign":"none","requireNote":true}
    ]'::jsonb;
  end if;

  if v_hold then
    v_tr := v_tr || '[
      {"id":"hold","label":"Put On Hold","from":["in_progress"],"to":"on_hold","assign":"none","requireNote":false},
      {"id":"resume","label":"Resume Work","from":["on_hold"],"to":"in_progress","assign":"optional","requireNote":false}
    ]'::jsonb;
  end if;

  if v_pass then
    v_tr := v_tr || '[{"id":"pass_on","label":"Pass On","from":["in_progress"],"to":"in_progress","assign":"pick","requireNote":true}]'::jsonb;
  end if;

  if v_reopen then
    v_tr := v_tr || '[{"id":"reopen","label":"Reopen","from":["done"],"to":"in_progress","assign":"optional","requireNote":false}]'::jsonb;
  end if;

  return jsonb_build_object('initial', case when v_pre then 'pending_approval' else 'todo' end, 'states', v_states, 'transitions', v_tr);
end;
$function$;

-- 3. Apply to every ticket type: Pass On off by default, workflows rebuilt (no tickets exist yet) ---
alter table public.ticket_types disable trigger protect_system_ticket_types;
alter table public.workflow_versions disable trigger user;
update public.ticket_types set config = public.normalize_ticket_type_config(config - 'pass_on') where config is not null;
update public.workflow_versions v
set definition = public.build_ticket_type_definition(t.config)
from public.ticket_types t
where t.config is not null and v.template_id::text = t.workflow_template_id;
alter table public.workflow_versions enable trigger user;
alter table public.ticket_types enable trigger protect_system_ticket_types;

-- 4. Who may run which action ----------------------------------------------------------------------
create or replace function public.ticket_pre_approver(p_ticket public.tickets)
returns text language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select u.id::text from public.ticket_types t join public.app_users u on u.id::text = t.config ->> 'pre_approver' and u.active
     where t.key = p_ticket.ticket_type_key),
    public.top_user()::text);
$$;

create or replace function public.apply_workflow_action_secure(
  p_ticket_id text, p_action_id text, p_actor text, p_role text, p_new_assignee text default null, p_note text default null)
returns public.tickets language plpgsql security definer set search_path = public, pg_temp as $function$
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
  v_type_pass_on boolean;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);
  if v_actor is null or not exists (select 1 from public.app_users where id::text = v_actor and active) then
    raise exception 'Unknown user' using errcode = '42501';
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
  -- "Manager" = the assignee's manager (top of hierarchy if none). With no assignee: the reporter's manager.
  v_is_manager := public.is_manager_of(v_actor, case when v_unassigned then v_ticket.reporter else v_assignee end);
  v_reassign := v_new is not null and not v_unassigned and v_new <> v_assignee;
  select coalesce((t.config ->> 'pass_on')::boolean, false) into v_type_pass_on from public.ticket_types t where t.key = v_ticket.ticket_type_key;

  v_allowed := case p_action_id
    when 'approve' then v_actor = public.ticket_pre_approver(v_ticket)
    when 'reject' then v_actor = public.ticket_pre_approver(v_ticket)
    when 'close' then v_is_reporter
    when 'assign' then (v_unassigned and (v_is_reporter or v_is_manager)) or (not v_unassigned and v_is_manager)
    when 'start' then v_is_assignee or (v_unassigned and v_new is not null and (v_is_reporter or v_is_manager)) or v_is_manager
    when 'complete' then v_is_assignee
    when 'approve_post' then not v_unassigned and v_actor = public.approver_for(v_assignee)::text
    when 'reject_post' then not v_unassigned and v_actor = public.approver_for(v_assignee)::text
    when 'hold' then v_is_manager
    when 'resume' then v_is_manager or v_is_assignee
    when 'pass_on' then v_type_pass_on and (v_is_assignee or v_is_reporter)
    when 'reopen' then v_is_reporter or v_is_manager
    else v_is_assignee or v_is_reporter
  end;

  -- Changing who does the work is the manager's call, except Pass On (when the type allows it).
  if v_allowed and v_reassign and p_action_id <> 'pass_on' and not v_is_manager then
    v_allowed := false;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'You are not allowed to do this on this ticket' using errcode = '42501';
  end if;

  return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
end;
$function$;

-- Standard (no post-approval): the reporter may also close (Complete Work). Applied as a patch:
--   when 'complete' then v_is_assignee or (v_is_reporter and not <type has post_approval>)
-- Errors use the default errcode so the API shows the message to the user.
