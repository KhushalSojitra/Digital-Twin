-- Ticket-type workflows.
--
-- Every ticket type owns one workflow. The workflow is always built from the mandatory base
-- (To Do -> In Progress -> Done) plus five switches stored in ticket_types.config:
--   pre_approval, post_approval, on_hold, reopen, pass_on
--
-- A ticket picks up the latest version of its type's workflow when it is created and keeps that
-- version afterwards. Changing a type's switches saves a new workflow version, so it only affects
-- tickets created later. Existing tickets are never rewritten.
--
-- Assumes the existing workflow tables and functions:
--   workflow_templates (id, name, description, is_system, created_at)
--   workflow_versions  (id, template_id, version, definition jsonb, is_active, created_at)
--   tickets            (id, type, status, assignee, workflow_version_id, workflow_state, ...)
--   ticket_assignment_history, ticket_state_history, save_workflow_template(...)
-- Run once in the Supabase SQL editor of the project the app is connected to. Safe to re-run.

-- Replaces the old "move one ticket to another workflow" behaviour and the free-form editor RPCs.
drop function if exists public.set_ticket_workflow(text, text, text);
drop function if exists public.create_ticket_type(text, text, jsonb);
drop function if exists public.update_ticket_type(text, text, text);

create table if not exists public.ticket_types (
  key text primary key,
  label text not null,
  description text not null default '',
  is_system boolean not null default false,
  workflow_template_id text,
  config jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- config is null for customer workflows created before configurable ticket types: they stay
-- read-only and keep their own workflow. is_active hides a type from ticket creation only.
alter table public.ticket_types add column if not exists config jsonb;
alter table public.ticket_types add column if not exists is_active boolean not null default true;

alter table public.ticket_types enable row level security;

drop policy if exists "ticket_types_read" on public.ticket_types;
create policy "ticket_types_read" on public.ticket_types for select to anon, authenticated using (true);

-- Writes go through the security definer functions below.
grant select on public.ticket_types to anon, authenticated;

-- The comment typed for an action (for example the Pass On handover comment) is kept with the
-- assignment and state history entries.
alter table public.ticket_assignment_history add column if not exists note text;
alter table public.ticket_state_history add column if not exists note text;

-- Builds the workflow definition for a set of switches.
create or replace function public.build_ticket_type_definition(p_config jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_pre boolean := coalesce((p_config ->> 'pre_approval')::boolean, false);
  v_post boolean := coalesce((p_config ->> 'post_approval')::boolean, false);
  v_hold boolean := coalesce((p_config ->> 'on_hold')::boolean, false);
  v_reopen boolean := coalesce((p_config ->> 'reopen')::boolean, false);
  v_pass boolean := coalesce((p_config ->> 'pass_on')::boolean, false);
  v_states jsonb := '[{"key":"todo","label":"To Do","group":"open"}]'::jsonb;
  v_tr jsonb := '[]'::jsonb;
begin
  if v_pre then
    v_states := v_states || '[{"key":"pending_approval","label":"Pending Approval","group":"open"},{"key":"approved","label":"Approved","group":"open"}]'::jsonb;
    v_tr := v_tr || '[
      {"id":"submit_approval","label":"Submit for Approval","from":["todo"],"to":"pending_approval","assign":"none","requireNote":false},
      {"id":"approve","label":"Approve","from":["pending_approval"],"to":"approved","assign":"none","requireNote":false},
      {"id":"reject","label":"Reject","from":["pending_approval"],"to":"todo","assign":"none","requireNote":true}
    ]'::jsonb;
  end if;

  v_states := v_states || '[{"key":"in_progress","label":"In Progress","group":"in_progress"}]'::jsonb;
  if v_hold then
    v_states := v_states || '[{"key":"on_hold","label":"On Hold","group":"in_progress"}]'::jsonb;
  end if;
  if v_post then
    v_states := v_states || '[{"key":"pending_post_approval","label":"Pending Post-approval","group":"in_progress"}]'::jsonb;
  end if;
  v_states := v_states || '[{"key":"done","label":"Done","group":"done"}]'::jsonb;

  v_tr := v_tr || jsonb_build_array(jsonb_build_object(
    'id', 'start', 'label', 'Start Work',
    'from', jsonb_build_array(case when v_pre then 'approved' else 'todo' end),
    'to', 'in_progress', 'assign', 'pick', 'requireNote', false));

  v_tr := v_tr || jsonb_build_array(jsonb_build_object(
    'id', 'complete', 'label', case when v_post then 'Submit for Approval' else 'Complete Work' end,
    'from', '["in_progress"]'::jsonb,
    'to', case when v_post then 'pending_post_approval' else 'done' end,
    'assign', 'none', 'requireNote', false));

  if v_post then
    v_tr := v_tr || '[
      {"id":"approve_post","label":"Approve","from":["pending_post_approval"],"to":"done","assign":"none","requireNote":false},
      {"id":"reject_post","label":"Reject","from":["pending_post_approval"],"to":"in_progress","assign":"optional","requireNote":true}
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
    v_tr := v_tr || '[{"id":"reopen","label":"Reopen","from":["done"],"to":"in_progress","assign":"pick","requireNote":false}]'::jsonb;
  end if;

  return jsonb_build_object('initial', 'todo', 'states', v_states, 'transitions', v_tr);
end;
$$;

-- Normalises the switches so only the five known flags are ever stored.
create or replace function public.normalize_ticket_type_config(p_config jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'pre_approval', coalesce((p_config ->> 'pre_approval')::boolean, false),
    'post_approval', coalesce((p_config ->> 'post_approval')::boolean, false),
    'on_hold', coalesce((p_config ->> 'on_hold')::boolean, false),
    'reopen', coalesce((p_config ->> 'reopen')::boolean, false),
    'pass_on', coalesce((p_config ->> 'pass_on')::boolean, false)
  );
$$;

-- The three default ticket types, each on its own workflow. Existing rows are only touched the
-- first time (while config is still null), so re-running never resets an edited type.
do $seed$
declare
  r record;
  v_template_id uuid;
begin
  for r in
    select * from (values
      ('standard', 'Standard', 'Base workflow with hold, reopen and pass on.',
        '{"pre_approval":false,"post_approval":false,"on_hold":true,"reopen":true,"pass_on":true}'::jsonb),
      ('financial', 'Financial', 'Pre-approval and post-approval before work is finished.',
        '{"pre_approval":true,"post_approval":true,"on_hold":true,"reopen":true,"pass_on":true}'::jsonb),
      ('maintenance', 'Maintenance', 'Work is approved after it is completed.',
        '{"pre_approval":false,"post_approval":true,"on_hold":true,"reopen":true,"pass_on":true}'::jsonb)
    ) as s(key, label, description, config)
  loop
    if exists (select 1 from public.ticket_types where key = r.key and config is not null) then
      continue;
    end if;

    insert into public.workflow_templates (name, description, is_system)
    values (r.label, r.description, true)
    returning id into v_template_id;

    insert into public.workflow_versions (template_id, version, definition, is_active)
    values (v_template_id, 1, public.build_ticket_type_definition(r.config), false);

    insert into public.ticket_types (key, label, description, is_system, workflow_template_id, config, is_active)
    values (r.key, r.label, r.description, true, v_template_id::text, r.config, true)
    on conflict (key) do update
      set label = excluded.label,
          description = excluded.description,
          is_system = true,
          workflow_template_id = excluded.workflow_template_id,
          config = excluded.config,
          is_active = true;
  end loop;
end;
$seed$;

-- The old built-in types are no longer offered for new tickets. Tickets that already use them keep
-- their type, their workflow version and every history entry.
update public.ticket_types
set is_active = false
where is_system
  and key in ('intrusion', 'loitering', 'tamper', 'camera_fault', 'vehicle', 'crowd');

-- Customer workflows created before ticket types existed stay reachable as read-only custom types.
insert into public.ticket_types (key, label, description, is_system, workflow_template_id)
select
  coalesce(nullif(trim(both '_' from regexp_replace(lower(t.name), '[^a-z0-9]+', '_', 'g')), ''), 'type')
    || '_' || substr(t.id::text, 1, 6),
  t.name,
  coalesce(t.description, ''),
  false,
  t.id::text
from public.workflow_templates t
where not coalesce(t.is_system, false)
  and not exists (select 1 from public.ticket_types tt where tt.workflow_template_id = t.id::text)
on conflict (key) do nothing;

-- Creates a custom ticket type together with its own workflow (version 1).
create or replace function public.create_ticket_type(
  p_label text,
  p_description text,
  p_config jsonb
)
returns public.ticket_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_key text;
  v_n int := 1;
  v_config jsonb := public.normalize_ticket_type_config(p_config);
  v_template_id uuid;
  v_type public.ticket_types%rowtype;
begin
  if coalesce(trim(p_label), '') = '' then
    raise exception 'Give the ticket type a name';
  end if;
  if exists (select 1 from public.ticket_types where lower(label) = lower(trim(p_label))) then
    raise exception 'A ticket type named "%" already exists', trim(p_label);
  end if;

  v_base := coalesce(nullif(trim(both '_' from regexp_replace(lower(p_label), '[^a-z0-9]+', '_', 'g')), ''), 'type');
  v_key := v_base;
  while exists (select 1 from public.ticket_types where key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  end loop;

  insert into public.workflow_templates (name, description, is_system)
  values (trim(p_label), coalesce(p_description, ''), false)
  returning id into v_template_id;

  insert into public.workflow_versions (template_id, version, definition, is_active)
  values (v_template_id, 1, public.build_ticket_type_definition(v_config), false);

  insert into public.ticket_types (key, label, description, is_system, workflow_template_id, config, is_active)
  values (v_key, trim(p_label), coalesce(p_description, ''), false, v_template_id::text, v_config, true)
  returning * into v_type;

  return v_type;
end;
$$;

-- Changes the switches (and name) of a ticket type. The workflow is saved as a new version when
-- tickets already use the current one, so those tickets are not altered.
-- Built-in types keep their name; their switches can be changed.
create or replace function public.update_ticket_type(
  p_key text,
  p_label text,
  p_description text,
  p_config jsonb
)
returns public.ticket_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.ticket_types%rowtype;
  v_config jsonb := public.normalize_ticket_type_config(p_config);
  v_label text;
  v_description text;
begin
  select * into v_type from public.ticket_types where key = p_key;
  if not found then
    raise exception 'Ticket type not found';
  end if;
  if v_type.config is null then
    raise exception 'This ticket type uses a custom workflow and cannot be edited here';
  end if;

  v_label := case when v_type.is_system then v_type.label else trim(coalesce(p_label, '')) end;
  v_description := case when v_type.is_system then v_type.description else coalesce(p_description, '') end;
  if v_label = '' then
    raise exception 'Give the ticket type a name';
  end if;
  if exists (select 1 from public.ticket_types where lower(label) = lower(v_label) and key <> p_key) then
    raise exception 'A ticket type named "%" already exists', v_label;
  end if;

  perform public.save_workflow_template(
    v_type.workflow_template_id::uuid,
    v_label,
    v_description,
    public.build_ticket_type_definition(v_config)
  );

  update public.ticket_types
  set label = v_label, description = v_description, config = v_config
  where key = p_key
  returning * into v_type;

  return v_type;
end;
$$;

-- Deletes a custom ticket type and its workflow. Refused while any ticket still uses either.
create or replace function public.delete_ticket_type(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.ticket_types%rowtype;
begin
  select * into v_type from public.ticket_types where key = p_key;
  if not found then
    raise exception 'Ticket type not found';
  end if;
  if v_type.is_system then
    raise exception 'Built-in ticket types cannot be deleted';
  end if;

  if exists (
    select 1 from public.tickets t
    where coalesce(to_jsonb(t) ->> 'type', to_jsonb(t) -> 'metadata' ->> 'type') = p_key
  ) then
    raise exception 'Tickets of this type exist, so it cannot be deleted';
  end if;

  if v_type.workflow_template_id is not null then
    if exists (
      select 1 from public.tickets t
      where t.workflow_version_id::text in (
        select v.id::text from public.workflow_versions v where v.template_id::text = v_type.workflow_template_id
      )
    ) then
      raise exception 'Tickets use this workflow, so it cannot be deleted';
    end if;
    delete from public.workflow_versions where template_id::text = v_type.workflow_template_id;
    delete from public.workflow_templates where id::text = v_type.workflow_template_id;
  end if;

  delete from public.ticket_types where key = p_key;
end;
$$;

-- Called right after a ticket is created: moves it onto the latest version of its type's workflow.
-- A ticket that has already progressed past its starting state is left alone, and a ticket whose
-- type has no workflow keeps the one it was created with.
create or replace function public.apply_ticket_type_workflow(p_ticket_id text)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_type_key text;
  v_template_id text;
  v_version public.workflow_versions%rowtype;
  v_current_initial text;
  v_initial text;
  v_state jsonb;
  v_group text;
begin
  select * into v_ticket from public.tickets where id::text = p_ticket_id;
  if not found then
    raise exception 'Ticket not found';
  end if;

  v_type_key := coalesce(to_jsonb(v_ticket) ->> 'type', to_jsonb(v_ticket) -> 'metadata' ->> 'type');
  select workflow_template_id into v_template_id from public.ticket_types where key = v_type_key;
  if v_template_id is null then
    return v_ticket;
  end if;

  select * into v_version
  from public.workflow_versions
  where template_id::text = v_template_id
  order by version desc
  limit 1;
  if not found then
    return v_ticket;
  end if;

  if v_ticket.workflow_version_id is not null then
    if v_ticket.workflow_version_id::text = v_version.id::text then
      return v_ticket;
    end if;
    select coalesce(v.definition ->> 'initial', v.definition -> 'states' -> 0 ->> 'key')
    into v_current_initial
    from public.workflow_versions v
    where v.id::text = v_ticket.workflow_version_id::text;
    if v_ticket.workflow_state is distinct from v_current_initial then
      return v_ticket;
    end if;
  end if;

  v_initial := coalesce(v_version.definition ->> 'initial', v_version.definition -> 'states' -> 0 ->> 'key');
  select s into v_state
  from jsonb_array_elements(v_version.definition -> 'states') as s
  where s ->> 'key' = v_initial
  limit 1;
  if v_state is null then
    return v_ticket;
  end if;

  v_group := coalesce(v_state ->> 'group', 'open');

  update public.tickets
  set workflow_version_id = v_version.id,
      workflow_state = v_initial,
      status = public.workflow_group_status(v_group)
  where id::text = p_ticket_id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

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
  elsif v_unassigned and v_new is not null then
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

grant execute on function public.build_ticket_type_definition(jsonb) to anon, authenticated;
grant execute on function public.normalize_ticket_type_config(jsonb) to anon, authenticated;
grant execute on function public.create_ticket_type(text, text, jsonb) to anon, authenticated;
grant execute on function public.update_ticket_type(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_ticket_type(text) to anon, authenticated;
grant execute on function public.apply_ticket_type_workflow(text) to anon, authenticated;
grant execute on function public.apply_workflow_action(text, text, text, text, text) to anon, authenticated;
