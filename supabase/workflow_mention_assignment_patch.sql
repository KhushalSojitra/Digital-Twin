-- OominiEye: let any workflow action hand the ticket to an @mentioned person.
--
-- Apply in the Supabase SQL Editor. This replaces one function only. Grants and the
-- apply_workflow_action_secure wrapper (which still enforces who may run an action) are unchanged.
--
-- Change: an action with no assignee rule ("assign": "none", e.g. Complete work, Put on Hold) used to
-- apply a supplied assignee only when the ticket was Unassigned. It now applies it whenever one is
-- supplied. Actions that pick, optionally pick, or return to the reporter behave exactly as before.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

-- Runs one workflow action on a ticket using the workflow version the ticket started on.
-- Not security definer: it runs with the caller's own table permissions (RLS applies).
-- Pass On (and any action that keeps the ticket in the same state) changes only the assignee, so
-- the ticket stays In Progress and nothing is sent to the receiver for acceptance.
create or replace function public.apply_workflow_action(
  p_ticket_id text,
  p_action_id text,
  p_changed_by text,
  p_new_assignee text default null,
  p_note text default null
)
returns public.tickets
language plpgsql
as $$
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

  if (coalesce((v_action ->> 'requireNote')::boolean, false) or p_action_id = 'pass_on') and v_note is null then
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
  elsif v_assign = 'reporter' then
    v_assignee := coalesce(nullif(trim(v_ticket.reporter), ''), v_previous);
  elsif v_assign = 'optional' then
    if v_new is not null then
      v_assignee := v_new;
    end if;
  elsif v_new is not null then
    v_assignee := v_new;
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
      when v_unassigned then 'Assigned to ' || v_assignee
      else (v_action ->> 'label') || ': work passed from ' || v_previous || ' to ' || v_assignee
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
$$;

commit;
