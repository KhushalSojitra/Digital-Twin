-- 27 Nov 2026: SLA breach handling (decisions with Khushal, 27 Nov).
-- A ticket (main or sub-task) is breached once its due date + time (India time) has passed while it is
-- not finished. Runs once per deadline (moving the deadline re-arms it). No pause while on hold/approval.
-- Actions (ticket Additional → On Breach):
--   fail               → state "Rejected" (key sla_rejected, group failed); only the reporter can Reopen.
--   escalate_reporter  → notification + email to the reporter.
--   escalate_assignee  → notification + email to the assignee and the assignee's manager.
--   notify_custom      → notification + email to chosen users, and email to extra addresses.
--   none / not set     → only marked as breached.
-- Every breach: tickets.sla_breached_at / sla_breach_deadline set, Activity line "SLA breached".
-- Checked every minute by pg_cron (job "sla-breaches").

-- Demo emails (27 Nov): Ava and General Member 2 only.
update public.app_users set email = 'khushal@digital-twin-solutions.com', email_enabled = true where username = 'ava';
update public.app_users set email = 'khushal@oomnieye.in', email_enabled = true where username = 'general2';

alter table public.tickets add column if not exists sla_breached_at timestamptz;
alter table public.tickets add column if not exists sla_breach_deadline timestamptz;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['mention', 'assignment', 'reply', 'sla_breach']));

-- Deadline in India time from the ticket's Additional data (dueDate YYYY-MM-DD, dueTime HH:MM).
create or replace function public.ticket_sla_deadline(t public.tickets)
returns timestamptz language sql stable set search_path = public, pg_temp as $$
  select case
    when (t.ptz_coordinates -> 'metadata' -> 'additional' ->> 'dueDate') ~ '^\d{4}-\d{2}-\d{2}$' then
      ((t.ptz_coordinates -> 'metadata' -> 'additional' ->> 'dueDate') || ' ' ||
       case when (t.ptz_coordinates -> 'metadata' -> 'additional' ->> 'dueTime') ~ '^\d{2}:\d{2}$'
            then t.ptz_coordinates -> 'metadata' -> 'additional' ->> 'dueTime' else '23:59' end
      )::timestamp at time zone 'Asia/Kolkata'
  end
$$;

-- Workflow: every flow gets the SLA "Rejected" state and a reporter-only Reopen from it.
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.build_ticket_type_definition'::regproc);
  d := replace(d, $q$  return jsonb_build_object('initial'$q$, $q$  -- SLA breach "Mark ticket as Failed" moves the ticket here; only the reporter can reopen it.
  v_states := v_states || '[{"key":"sla_rejected","label":"Rejected","group":"failed"}]'::jsonb;
  v_tr := v_tr || '[{"id":"reopen_breached","label":"Reopen","from":["sla_rejected"],"to":"todo","assign":"none","requireNote":false}]'::jsonb;

  return jsonb_build_object('initial'$q$);
  execute d;
end $mig$;

alter table public.workflow_versions disable trigger guard_workflow_versions;
alter table public.workflow_versions disable trigger workflow_versions_protect;
update public.workflow_versions v
set definition = public.build_ticket_type_definition(t.config)
from public.ticket_types t
where v.template_id::text = t.workflow_template_id::text and t.key <> 'subtask';
-- Sub-task flow is hand-built: add the same state and reopen.
update public.workflow_versions v
set definition = jsonb_set(jsonb_set(v.definition, '{states}', (v.definition -> 'states') ||
      '[{"key":"sla_rejected","label":"Rejected","group":"failed"}]'::jsonb),
      '{transitions}', (v.definition -> 'transitions') ||
      '[{"id":"reopen_breached","label":"Reopen","from":["sla_rejected"],"to":"todo","assign":"none","requireNote":false}]'::jsonb)
from public.ticket_types t
where v.template_id::text = t.workflow_template_id::text and t.key = 'subtask'
  and not (v.definition -> 'states') @> '[{"key":"sla_rejected"}]'::jsonb;
alter table public.workflow_versions enable trigger guard_workflow_versions;
alter table public.workflow_versions enable trigger workflow_versions_protect;

-- Reopen after an SLA rejection: reporter only (main tickets and sub-tasks).
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.apply_workflow_action_secure'::regproc);
  d := replace(d, $q$  if v_ticket.parent_ticket_id is not null then
    select (v_actor$q$, $q$  if p_action_id = 'reopen_breached' then
    if not v_is_reporter then
      raise exception 'Only the reporter can reopen a ticket rejected for missing its deadline';
    end if;
    return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, null, p_note);
  end if;

  if v_ticket.parent_ticket_id is not null then
    select (v_actor$q$);
  execute d;
end $mig$;

create or replace function public.process_sla_breaches()
returns integer language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  r record;
  v_add jsonb;
  v_action text;
  v_deadline timestamptz;
  v_now timestamptz := now();
  v_msg text;
  v_recipients text[];
  v_emails text[];
  v_def jsonb;
  v_from_label text;
  v_count int := 0;
begin
  for r in
    select t.*, public.ticket_sla_deadline(t) as deadline
    from public.tickets t
    where public.ticket_sla_deadline(t) <= v_now
      and t.sla_breach_deadline is distinct from public.ticket_sla_deadline(t)
      and coalesce(t.status, '') not in ('done', 'accepted', 'failed')
    for update skip locked
  loop
    v_add := r.ptz_coordinates -> 'metadata' -> 'additional';
    v_action := coalesce(nullif(v_add ->> 'onBreach', ''), 'none');
    v_deadline := r.deadline;
    v_msg := 'Deadline ' || to_char(v_deadline at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || ' was missed';

    update public.tickets
    set sla_breached_at = v_now, sla_breach_deadline = v_deadline,
        history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'at', v_now, 'by', 'System', 'text', 'SLA breached: ' || v_msg))
    where id = r.id;

    if v_action = 'fail' then
      select definition into v_def from public.workflow_versions where id::text = r.workflow_version_id::text;
      if v_def -> 'states' @> '[{"key":"sla_rejected"}]'::jsonb then
        select s ->> 'label' into v_from_label from jsonb_array_elements(v_def -> 'states') s where s ->> 'key' = r.workflow_state;
        update public.tickets
        set workflow_state = 'sla_rejected', status = public.workflow_group_status('failed'),
            history_log = history_log || jsonb_build_array(jsonb_build_object(
              'at', v_now, 'by', 'System', 'text', 'SLA breach: ' || coalesce(v_from_label, r.workflow_state) || ' to Rejected'))
        where id = r.id;
        insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at, action_label, note, workflow_version_id)
        values (r.id, r.workflow_state, 'sla_rejected', 'System', v_now, 'SLA breach', v_msg, r.workflow_version_id);
      end if;
      v_recipients := array[r.reporter];
    elsif v_action = 'escalate_reporter' then
      v_recipients := array[r.reporter];
    elsif v_action = 'escalate_assignee' then
      if coalesce(nullif(trim(r.assignee), ''), 'Unassigned') = 'Unassigned' then
        v_recipients := array[r.reporter];
      else
        v_recipients := array[r.assignee, public.approver_for(r.assignee)::text];
      end if;
    elsif v_action = 'notify_custom' then
      v_recipients := array(select jsonb_array_elements_text(coalesce(v_add -> 'notifyUsers', '[]'::jsonb)));
      v_emails := array(select lower(trim(e)) from jsonb_array_elements_text(coalesce(v_add -> 'notifyEmails', '[]'::jsonb)) e
                        where trim(e) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
    else
      v_recipients := array[]::text[];
    end if;

    -- One notification per person (emailed by the notifications trigger when the user has email on).
    insert into public.notifications (for_user, from_user, ticket_id, ticket_title, type, message)
    select distinct u.id::text, null, r.id, r.title, 'sla_breach', v_msg
    from unnest(coalesce(v_recipients, array[]::text[])) x
    join public.app_users u on u.id::text = x and u.active;

    -- Extra addresses (not users): email only.
    insert into public.notifications (for_user, from_user, ticket_id, ticket_title, type, message)
    select distinct 'email:' || e, null, r.id, r.title, 'sla_breach', v_msg
    from unnest(coalesce(v_emails, array[]::text[])) e;

    v_recipients := null;
    v_emails := null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.process_sla_breaches() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('sla-breaches', '* * * * *', 'select public.process_sla_breaches()');
