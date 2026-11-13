-- Ticket-type workflows.
--
-- Every ticket type owns exactly one workflow template. A ticket picks up the latest version of
-- its type's workflow when it is created and keeps that version afterwards, so editing a type's
-- workflow only affects tickets created later. Existing tickets are never rewritten.
--
-- Assumes the existing workflow tables:
--   workflow_templates (id, name, description, is_system, created_at)
--   workflow_versions  (id, template_id, version, definition jsonb, is_active, created_at)
--   tickets            (id, type, status, workflow_version_id, workflow_state, ...)
-- Run once in the Supabase SQL editor of the project the app is connected to. Safe to re-run.

-- Replaces the old "move one ticket to another workflow" behaviour.
drop function if exists public.set_ticket_workflow(text, text, text);

create table if not exists public.ticket_types (
  key text primary key,
  label text not null,
  description text not null default '',
  is_system boolean not null default false,
  workflow_template_id text,
  created_at timestamptz not null default now()
);

alter table public.ticket_types enable row level security;

drop policy if exists "ticket_types_read" on public.ticket_types;
create policy "ticket_types_read" on public.ticket_types for select to anon, authenticated using (true);

-- Writes go through the security definer functions below.
grant select on public.ticket_types to anon, authenticated;

-- Built-in ticket types start on the workflow new tickets already used (the active version).
insert into public.ticket_types (key, label, is_system, workflow_template_id)
select b.key, b.label, true,
  (select v.template_id::text from public.workflow_versions v where v.is_active order by v.version desc limit 1)
from (values
  ('intrusion', 'Intrusion'),
  ('loitering', 'Loitering'),
  ('tamper', 'Camera tamper'),
  ('camera_fault', 'Camera fault'),
  ('vehicle', 'Vehicle'),
  ('crowd', 'Crowd density'),
  ('maintenance', 'Maintenance')
) as b(key, label)
on conflict (key) do nothing;

-- Customer workflows created before ticket types existed stay reachable as custom ticket types.
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
  p_definition jsonb
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
  v_template_id text;
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
  returning id::text into v_template_id;

  insert into public.workflow_versions (template_id, version, definition, is_active)
  select t.id, 1, p_definition, false
  from public.workflow_templates t
  where t.id::text = v_template_id;

  insert into public.ticket_types (key, label, description, is_system, workflow_template_id)
  values (v_key, trim(p_label), coalesce(p_description, ''), false, v_template_id)
  returning * into v_type;

  return v_type;
end;
$$;

-- Renames a custom ticket type. Its workflow is saved through save_workflow_template.
create or replace function public.update_ticket_type(
  p_key text,
  p_label text,
  p_description text
)
returns public.ticket_types
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
    raise exception 'Built-in ticket types cannot be edited';
  end if;
  if coalesce(trim(p_label), '') = '' then
    raise exception 'Give the ticket type a name';
  end if;
  if exists (select 1 from public.ticket_types where lower(label) = lower(trim(p_label)) and key <> p_key) then
    raise exception 'A ticket type named "%" already exists', trim(p_label);
  end if;

  update public.ticket_types
  set label = trim(p_label), description = coalesce(p_description, '')
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
-- A ticket that has already progressed past its starting state is left alone.
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
  v_status text;
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
  v_status := case v_group
    when 'open' then 'to do'
    when 'in_progress' then 'in progress'
    else v_group
  end;

  update public.tickets
  set workflow_version_id = v_version.id,
      workflow_state = v_initial,
      status = v_status
  where id::text = p_ticket_id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

grant execute on function public.create_ticket_type(text, text, jsonb) to anon, authenticated;
grant execute on function public.update_ticket_type(text, text, text) to anon, authenticated;
grant execute on function public.delete_ticket_type(text) to anon, authenticated;
grant execute on function public.apply_ticket_type_workflow(text) to anon, authenticated;
