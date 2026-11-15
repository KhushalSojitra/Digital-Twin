-- OominiEye: ticket type hardening, authorization and type changes after creation.
--
-- NOT APPLIED AUTOMATICALLY. Review, then run once in the SQL editor of the Supabase project that owns
-- public.tickets (the one behind VITE_SUPABASE_URL). Run supabase/ticket_workflow.sql first; this file
-- builds on it, is idempotent, and never drops or recreates a table or rewrites a ticket's data.
--
-- What it does
--   1. tickets.ticket_type_key: the workflow Ticket Type, stored separately from the camera origin that
--      lives in ptz_coordinates (which is never modified by the type columns and is only read here).
--   2. ticket_type_changes: the audit trail of every type change (old/new type, old/new state, who, when, why).
--   3. System ticket types (Standard, Financial, Maintenance) become immutable at the database level.
--   4. Every write goes through *_secure functions that only the service role can execute. The API server
--      derives the actor and role from the signed session and passes them in; browsers can no longer call
--      create/update/delete/apply with a client-supplied identity.

-- 1. Workflow Ticket Type on the ticket ------------------------------------------------------------------
alter table public.tickets add column if not exists ticket_type_key text;

-- Existing tickets keep the type they were created with. Only values that match a real ticket type are copied.
update public.tickets t
set ticket_type_key = coalesce(to_jsonb(t) ->> 'type', to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type')
where t.ticket_type_key is null
  and exists (
    select 1 from public.ticket_types tt
    where tt.key = coalesce(to_jsonb(t) ->> 'type', to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type')
  );

-- 2. Audit trail -------------------------------------------------------------------------------------------
create table if not exists public.ticket_type_changes (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null,
  from_type text,
  to_type text not null,
  from_state text,
  to_state text,
  from_version_id text,
  to_version_id text,
  reason text not null,
  changed_by text not null,
  changed_role text not null,
  changed_at timestamptz not null default now()
);
create index if not exists ticket_type_changes_ticket_idx on public.ticket_type_changes (ticket_id, changed_at desc);

alter table public.ticket_type_changes enable row level security;
drop policy if exists "ticket_type_changes_read" on public.ticket_type_changes;
create policy "ticket_type_changes_read" on public.ticket_type_changes for select to anon, authenticated using (true);
revoke all on public.ticket_type_changes from anon, authenticated;
grant select on public.ticket_type_changes to anon, authenticated;

-- 3. System ticket types are immutable --------------------------------------------------------------------
-- Only the is_active flag may still change (older scripts retire legacy built-ins that way).
create or replace function public.protect_system_ticket_types()
returns trigger
language plpgsql
as $$
begin
  if old.is_system then
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'is_active') = (to_jsonb(old) - 'is_active') then
      return new;
    end if;
    raise exception 'System ticket types cannot be edited or deleted';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_system_ticket_types on public.ticket_types;
create trigger protect_system_ticket_types
  before update or delete on public.ticket_types
  for each row execute function public.protect_system_ticket_types();

-- Ticket types are read-only for browsers; writes only happen inside the security definer functions below.
revoke insert, update, delete on public.ticket_types from anon, authenticated;

-- Idempotent re-seed of the three defaults (no-op when they already exist and are configured).
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
    if exists (select 1 from public.ticket_types where key = r.key and config is not null and workflow_template_id is not null) then
      continue;
    end if;

    insert into public.workflow_templates (name, description, is_system)
    values (r.label, r.description, true)
    returning id into v_template_id;

    insert into public.workflow_versions (template_id, version, definition, is_active)
    values (v_template_id, 1, public.build_ticket_type_definition(r.config), false);

    insert into public.ticket_types (key, label, description, is_system, workflow_template_id, config, is_active)
    values (r.key, r.label, r.description, true, v_template_id::text, r.config, true)
    on conflict (key) do nothing;
  end loop;
end;
$seed$;

-- 4. Authorization ---------------------------------------------------------------------------------------
create or replace function public.assert_ticket_type_actor(p_actor text, p_role text, p_allowed text[])
returns void
language plpgsql
immutable
as $$
begin
  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception 'The person performing the action is required';
  end if;
  if p_role is null or not (p_role = any (p_allowed)) then
    raise exception 'Your role is not allowed to do this';
  end if;
end;
$$;

-- Latest workflow version of a template that is structurally valid (has an initial state, states and transitions).
create or replace function public.current_ticket_type_version(p_template_id text)
returns public.workflow_versions
language sql
stable
as $$
  select v.*
  from public.workflow_versions v
  where v.template_id::text = p_template_id
    and jsonb_typeof(v.definition -> 'states') = 'array'
    and jsonb_array_length(v.definition -> 'states') > 0
    and jsonb_typeof(v.definition -> 'transitions') = 'array'
    and coalesce(v.definition ->> 'initial', '') <> ''
  order by v.version desc
  limit 1;
$$;

-- Manage custom types: Administrator and Operator. System defaults are never editable.
create or replace function public.create_ticket_type_secure(
  p_label text, p_description text, p_config jsonb, p_actor text, p_role text
)
returns public.ticket_types
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  return public.create_ticket_type(p_label, p_description, p_config);
end;
$$;

create or replace function public.update_ticket_type_secure(
  p_key text, p_label text, p_description text, p_config jsonb, p_actor text, p_role text
)
returns public.ticket_types
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  if exists (select 1 from public.ticket_types where key = p_key and is_system) then
    raise exception 'System ticket types cannot be edited';
  end if;
  -- update_ticket_type saves a new workflow version, so tickets already created keep theirs.
  return public.update_ticket_type(p_key, p_label, p_description, p_config);
end;
$$;

create or replace function public.delete_ticket_type_secure(p_key text, p_actor text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  if exists (select 1 from public.ticket_types where key = p_key and is_system) then
    raise exception 'System ticket types cannot be deleted';
  end if;
  if exists (select 1 from public.tickets where ticket_type_key = p_key) then
    raise exception 'Tickets of this type exist, so it cannot be deleted';
  end if;
  perform public.delete_ticket_type(p_key);
end;
$$;

-- Applies the chosen type to a ticket that was just created: stores the type reference and pins the
-- exact, currently valid workflow version. Runs once per ticket (while no type is stored yet).
create or replace function public.apply_ticket_type_secure(
  p_ticket_id text, p_type_key text, p_actor text, p_role text
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_type public.ticket_types%rowtype;
  v_version public.workflow_versions%rowtype;
  v_initial text;
  v_group text;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_ticket.ticket_type_key is not null then
    raise exception 'This ticket already has a ticket type';
  end if;

  select * into v_type from public.ticket_types where key = p_type_key and is_active;
  if not found or v_type.workflow_template_id is null then
    raise exception 'Choose an active ticket type';
  end if;

  select * into v_version from public.current_ticket_type_version(v_type.workflow_template_id);
  if v_version.id is null then
    raise exception 'This ticket type has no valid workflow';
  end if;

  v_initial := v_version.definition ->> 'initial';
  select coalesce(s ->> 'group', 'open') into v_group
  from jsonb_array_elements(v_version.definition -> 'states') as s
  where s ->> 'key' = v_initial
  limit 1;

  update public.tickets
  set ticket_type_key = v_type.key,
      workflow_version_id = v_version.id,
      workflow_state = v_initial,
      status = public.workflow_group_status(coalesce(v_group, 'open'))
  where id::text = p_ticket_id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

-- Changes the Ticket Type of an existing ticket in any state and reconciles it with the new workflow.
--   * The ticket moves onto the latest valid version of the new type.
--   * A state that does not exist in the new workflow is mapped to the nearest earlier stage:
--       pending approval / approved  -> To Do      (approval stages are never skipped or auto-approved)
--       on hold / pending post-approval -> In Progress
--   * A Done ticket whose new workflow requires post-approval is reopened to In Progress, so it must pass
--     the newly required stage again before it can be Done.
--   * Assignee, comments and every earlier history entry are preserved; the change is appended.
create or replace function public.change_ticket_type_secure(
  p_ticket_id text, p_new_type text, p_reason text, p_actor text, p_role text
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_type public.ticket_types%rowtype;
  v_version public.workflow_versions%rowtype;
  v_old_version public.workflow_versions%rowtype;
  v_def jsonb;
  v_now timestamptz := now();
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_old_type text;
  v_old_state text;
  v_target text;
  v_group text;
  v_assignee text;
  v_has_post boolean;
  v_text text;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  if v_reason is null then
    raise exception 'Give a reason for changing the ticket type';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  select * into v_type from public.ticket_types where key = p_new_type and is_active;
  if not found or v_type.workflow_template_id is null then
    raise exception 'Choose an active ticket type';
  end if;

  v_old_type := coalesce(v_ticket.ticket_type_key, to_jsonb(v_ticket) -> 'ptz_coordinates' -> 'metadata' ->> 'type');
  if v_old_type is not distinct from v_type.key then
    raise exception 'The ticket already has this ticket type';
  end if;

  select * into v_version from public.current_ticket_type_version(v_type.workflow_template_id);
  if v_version.id is null then
    raise exception 'This ticket type has no valid workflow';
  end if;
  v_def := v_version.definition;

  v_old_state := coalesce(v_ticket.workflow_state, v_def ->> 'initial');

  if exists (select 1 from jsonb_array_elements(v_def -> 'states') s where s ->> 'key' = v_old_state) then
    v_target := v_old_state;
  elsif v_old_state in ('pending_approval', 'approved') then
    v_target := 'todo';
  elsif v_old_state in ('on_hold', 'pending_post_approval') then
    v_target := 'in_progress';
  else
    v_target := v_def ->> 'initial';
  end if;

  -- A finished ticket must go through a post-approval stage that its new workflow now requires.
  v_has_post := exists (select 1 from jsonb_array_elements(v_def -> 'states') s where s ->> 'key' = 'pending_post_approval');
  if v_target = 'done' and v_has_post and v_ticket.workflow_version_id is not null then
    select * into v_old_version from public.workflow_versions where id::text = v_ticket.workflow_version_id::text;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_old_version.definition -> 'states', '[]'::jsonb)) s
      where s ->> 'key' = 'pending_post_approval'
    ) then
      v_target := 'in_progress';
    end if;
  end if;

  select coalesce(s ->> 'group', 'open') into v_group
  from jsonb_array_elements(v_def -> 'states') as s
  where s ->> 'key' = v_target
  limit 1;
  if v_group is null then
    raise exception 'The new workflow has no matching state for this ticket';
  end if;

  v_assignee := coalesce(nullif(trim(v_ticket.assignee), ''), 'Unassigned');
  if v_group = 'in_progress' and v_assignee = 'Unassigned' then
    raise exception 'Assign the ticket to someone before moving it back into progress';
  end if;

  v_text := 'Ticket type changed from ' || coalesce(v_old_type, 'unknown') || ' to ' || v_type.label
    || case when v_target is distinct from v_old_state then ' (state ' || coalesce(v_old_state, 'none') || ' to ' || v_target || ')' else '' end;

  if v_target is distinct from v_old_state then
    insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at, action_label, note, workflow_version_id)
    values (v_ticket.id, v_old_state, v_target, v_by, v_now, 'Ticket type changed', v_reason, v_version.id);
  end if;

  insert into public.ticket_type_changes (ticket_id, from_type, to_type, from_state, to_state, from_version_id, to_version_id, reason, changed_by, changed_role, changed_at)
  values (v_ticket.id::text, v_old_type, v_type.key, v_old_state, v_target, v_ticket.workflow_version_id::text, v_version.id::text, v_reason, v_by, p_role, v_now);

  update public.tickets
  set ticket_type_key = v_type.key,
      workflow_version_id = v_version.id,
      workflow_state = v_target,
      status = public.workflow_group_status(v_group),
      completed_at = case when v_group in ('done', 'accepted') then coalesce(completed_at, v_now) else null end,
      history_log = coalesce(history_log, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', v_now, 'by', v_by, 'text', v_text, 'comment', v_reason))
  where id = v_ticket.id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

-- 5. Grants: browsers may no longer run any mutating ticket-type function -----------------------------------
revoke execute on function public.create_ticket_type(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.update_ticket_type(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_ticket_type(text) from public, anon, authenticated;
revoke execute on function public.apply_ticket_type_workflow(text) from public, anon, authenticated;

revoke execute on function public.create_ticket_type_secure(text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.update_ticket_type_secure(text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.delete_ticket_type_secure(text, text, text) from public, anon, authenticated;
revoke execute on function public.apply_ticket_type_secure(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.change_ticket_type_secure(text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.create_ticket_type_secure(text, text, jsonb, text, text) to service_role;
grant execute on function public.update_ticket_type_secure(text, text, text, jsonb, text, text) to service_role;
grant execute on function public.delete_ticket_type_secure(text, text, text) to service_role;
grant execute on function public.apply_ticket_type_secure(text, text, text, text) to service_role;
grant execute on function public.change_ticket_type_secure(text, text, text, text, text) to service_role;
