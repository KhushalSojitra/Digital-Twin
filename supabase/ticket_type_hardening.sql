-- OominiEye: ticket type hardening (revision 3).
--
-- NOT APPLIED AUTOMATICALLY. Run it once, as a single script, in the SQL editor of the Supabase project
-- okkgnwiqcupflocoobes (the project behind VITE_SUPABASE_URL). Check the project ref in the browser URL
-- of the SQL editor first. NEVER run it on krrmktwszdijoqmigkif.
--
-- Prerequisites
--   * supabase/ticket_workflow.sql has been run (this script builds on its tables and functions).
--   * The deployed API has APP_SUPABASE_URL / APP_SUPABASE_SERVICE_ROLE_KEY set (see the deployment notes).
--
-- Safety
--   * The whole script is ONE transaction. A preflight block refuses to run on the wrong database and a
--     postflight block asserts the final privileges; any failure rolls everything back.
--   * Idempotent: safe to run again. The "before" privileges are captured once in
--     public.ticket_type_migration_backup so supabase/ticket_type_hardening_rollback.sql can restore them.
--   * No table is dropped or recreated. The only ticket rows changed are legacy tickets that have NO workflow
--     at all (workflow_version_id and workflow_state both NULL, e.g. created before workflows were seeded):
--     they get a workflow version, a state and a ticket type (step 6b). Their status, assignee, completed_at,
--     history_log and every history row stay as they are, and each one gets a ticket_type_changes audit row.
--     A ticket whose status cannot be mapped to a workflow state with certainty stops the whole migration with
--     a diagnostic (nothing is changed); no ticket that already has a workflow is touched.
--
-- What it does
--   1. Ticket Type on the ticket (tickets.ticket_type_key) and an audit trail (ticket_type_changes) that
--      browsers can no longer read.
--   2. Browsers can no longer change ticket_type_key, workflow_version_id, workflow_state, status or
--      completed_at, cannot alter ticket histories, and cannot write ticket types or workflow templates/versions. System
--      templates and versions are immutable for everyone.
--   3. Every mutating function (ticket types, apply/change type, workflow actions, save_workflow_template)
--      is executable by the service role only. The API derives the actor and role from the signed session.
--   4. Changing a ticket's type reconciles it with the new workflow: newly required approvals become
--      pending, completed_at and all history are preserved. Permanent deletion keeps only a minimal audit record.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local search_path = public, pg_temp;

-- 0. Preflight: refuse to run against the wrong database -------------------------------------------------
do $pre$
declare
  v_name text;
  v_missing text[] := '{}';
begin
  foreach v_name in array array['tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history', 'ticket_assignment_history'] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := v_missing || v_name;
    end if;
  end loop;
  if cardinality(v_missing) > 0 then
    raise exception 'Wrong database, or supabase/ticket_workflow.sql has not been run. Missing table(s): %', array_to_string(v_missing, ', ');
  end if;

  foreach v_name in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_name) then
      raise exception 'Role % does not exist; this is not a Supabase project database', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'public.apply_workflow_action(text,text,text,text,text)',
    'public.apply_ticket_type_workflow(text)',
    'public.create_ticket_type(text,text,jsonb)',
    'public.update_ticket_type(text,text,text,jsonb)',
    'public.delete_ticket_type(text)',
    'public.build_ticket_type_definition(jsonb)',
    'public.workflow_group_status(text)'
  ] loop
    if to_regprocedure(v_name) is null then
      raise exception 'Missing function %; run supabase/ticket_workflow.sql first', v_name;
    end if;
  end loop;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'save_workflow_template') then
    raise exception 'Missing function public.save_workflow_template';
  end if;

  foreach v_name in array array['workflow_version_id', 'workflow_state', 'status', 'assignee', 'history_log', 'completed_at', 'reporter'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tickets' and column_name = v_name) then
      raise exception 'public.tickets has no column %', v_name;
    end if;
  end loop;
  foreach v_name in array array['config', 'is_active', 'is_system', 'workflow_template_id'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ticket_types' and column_name = v_name) then
      raise exception 'public.ticket_types has no column %', v_name;
    end if;
  end loop;
  foreach v_name in array array['ticket_id', 'from_state', 'to_state', 'changed_by', 'changed_at', 'action_label', 'note', 'workflow_version_id'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ticket_state_history' and column_name = v_name) then
      raise exception 'public.ticket_state_history has no column %; run supabase/ticket_workflow.sql first', v_name;
    end if;
  end loop;
  foreach v_name in array array['ticket_id', 'from_assignee', 'to_assignee', 'changed_by', 'changed_at', 'action_label', 'note'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ticket_assignment_history' and column_name = v_name) then
      raise exception 'public.ticket_assignment_history has no column %; run supabase/ticket_workflow.sql first', v_name;
    end if;
  end loop;
end;
$pre$;

-- 1. Snapshot of the privileges this script changes (captured once, used by the rollback script) -----------
create table if not exists public.ticket_type_migration_backup (
  migration text not null,
  object_type text not null,
  object_name text not null,
  grantee text not null,
  privileges text[] not null default '{}',
  captured_at timestamptz not null default now(),
  primary key (migration, object_type, object_name, grantee)
);
alter table public.ticket_type_migration_backup enable row level security;
revoke all on public.ticket_type_migration_backup from public, anon, authenticated;
grant select on public.ticket_type_migration_backup to service_role;

do $snapshot$
declare
  r record;
begin
  if exists (select 1 from public.ticket_type_migration_backup where migration = 'ticket_type_hardening_v3') then
    return;
  end if;

  for r in
    select p.oid::regprocedure::text as obj, p.proacl as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_workflow_action', 'apply_ticket_type_workflow', 'create_ticket_type', 'update_ticket_type', 'delete_ticket_type', 'save_workflow_template', 'change_ticket_state', 'activate_workflow_template', 'delete_workflow_template')
  loop
    insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
    values ('ticket_type_hardening_v3', 'function', r.obj, '*', '{}');
    if r.acl is null then
      insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
      values ('ticket_type_hardening_v3', 'function', r.obj, 'public', array['EXECUTE']);
    end if;
    insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
    select 'ticket_type_hardening_v3', 'function', r.obj,
           case when a.grantee = 0 then 'public' else (select rolname::text from pg_roles where oid = a.grantee) end,
           array_agg(a.privilege_type::text)
    from aclexplode(r.acl) a
    where a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))
    group by a.grantee
    on conflict do nothing;
  end loop;

  for r in
    select c.oid::regclass::text as obj, c.relacl as acl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('ticket_types', 'workflow_templates', 'workflow_versions', 'tickets', 'ticket_type_changes', 'ticket_state_history', 'ticket_assignment_history')
  loop
    insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
    values ('ticket_type_hardening_v3', 'table', r.obj, '*', '{}');
    insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
    select 'ticket_type_hardening_v3', 'table', r.obj,
           case when a.grantee = 0 then 'public' else (select rolname::text from pg_roles where oid = a.grantee) end,
           array_agg(a.privilege_type::text)
    from aclexplode(r.acl) a
    where a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))
    group by a.grantee
    on conflict do nothing;
  end loop;

  -- Column-level INSERT/UPDATE grants of anon/authenticated (pg_attribute.attacl) on the three tables whose
  -- columns are revoked in section 6. Captured only in the run that creates the snapshot, i.e. before any
  -- revoke. One 'column_capture' marker per table proves the capture happened; a table with no direct column
  -- grants has a marker and no 'column' rows. object_name is '<table>.<column>'.
  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'column_capture', c.relname, '*', '{}'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname in ('ticket_types', 'workflow_templates', 'workflow_versions')
  on conflict do nothing;

  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'column', c.relname || '.' || a.attname, ro.rolname,
         array_agg(distinct acl.privilege_type::text order by acl.privilege_type::text)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  cross join lateral aclexplode(a.attacl) as acl
  join pg_roles ro on ro.oid = acl.grantee
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname in ('ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history', 'ticket_assignment_history')
    and a.attnum > 0 and not a.attisdropped
    and ro.rolname in ('anon', 'authenticated')
    and acl.privilege_type in ('INSERT', 'UPDATE')
  group by c.relname, a.attname, ro.rolname
  on conflict do nothing;

  -- Browser access to public.tickets (changed in section 6c): row level security state, every existing
  -- policy and every column-level grant of anon / authenticated. The table-level grants are in the 'table' rows above.
  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'tickets_capture', 'tickets', '*',
         array[case when c.relrowsecurity then 'RLS_ON' else 'RLS_OFF' end,
               case when c.relforcerowsecurity then 'FORCE_ON' else 'FORCE_OFF' end]
  from pg_class c
  where c.oid = to_regclass('public.tickets')
  on conflict do nothing;

  -- privileges = {command, permissive, roles (comma separated), USING expression, WITH CHECK expression}
  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'tickets_policy', p.policyname::text, 'policy',
         array[p.cmd::text, p.permissive::text, array_to_string(p.roles, ','), coalesce(p.qual, ''), coalesce(p.with_check, '')]
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'tickets'
  on conflict do nothing;

  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'tickets_column', a.attname::text, ro.rolname::text,
         array_agg(distinct acl.privilege_type::text order by acl.privilege_type::text)
  from pg_attribute a
  cross join lateral aclexplode(a.attacl) as acl
  join pg_roles ro on ro.oid = acl.grantee
  where a.attrelid = to_regclass('public.tickets')
    and a.attnum > 0 and not a.attisdropped
    and ro.rolname in ('anon', 'authenticated')
  group by a.attname, ro.rolname
  on conflict do nothing;

  -- History table policies, RLS flags and column grants are captured before browser access is revoked.
  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'history_capture', c.relname, '*',
         array[case when c.relrowsecurity then 'RLS_ON' else 'RLS_OFF' end,
               case when c.relforcerowsecurity then 'FORCE_ON' else 'FORCE_OFF' end]
  from pg_class c
  where c.oid in (to_regclass('public.ticket_state_history'), to_regclass('public.ticket_assignment_history'))
  on conflict do nothing;

  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'history_policy', p.tablename || '.' || p.policyname, 'policy',
         array[p.cmd::text, p.permissive::text, array_to_string(p.roles, ','), coalesce(p.qual, ''), coalesce(p.with_check, '')]
  from pg_policies p
  where p.schemaname = 'public' and p.tablename in ('ticket_state_history', 'ticket_assignment_history')
  on conflict do nothing;

  insert into public.ticket_type_migration_backup (migration, object_type, object_name, grantee, privileges)
  select 'ticket_type_hardening_v3', 'history_column', c.relname || '.' || a.attname, ro.rolname,
         array_agg(distinct acl.privilege_type::text order by acl.privilege_type::text)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  cross join lateral aclexplode(a.attacl) acl
  join pg_roles ro on ro.oid = acl.grantee
  where n.nspname = 'public' and c.relname in ('ticket_state_history', 'ticket_assignment_history')
    and a.attnum > 0 and not a.attisdropped
    and ro.rolname in ('anon', 'authenticated')
  group by c.relname, a.attname, ro.rolname
  on conflict do nothing;
end;
$snapshot$;

-- 2. Ticket type on the ticket ---------------------------------------------------------------------------
alter table public.tickets add column if not exists ticket_type_key text;

-- Existing tickets keep the type they were created with. Only values that match a real ticket type are copied.
update public.tickets t
set ticket_type_key = coalesce(to_jsonb(t) ->> 'type', to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type')
where t.ticket_type_key is null
  and exists (
    select 1 from public.ticket_types tt
    where tt.key = coalesce(to_jsonb(t) ->> 'type', to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type')
  );

-- 3. Audit trail: never readable or writable by browsers -------------------------------------------------
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
revoke all on public.ticket_type_changes from public, anon, authenticated;
grant select on public.ticket_type_changes to service_role;

-- 4. Helpers ---------------------------------------------------------------------------------------------
-- True for requests made straight from a browser (PostgREST anon / authenticated). Inside the security
-- definer functions below current_user is the function owner, so server-side operations are never blocked.
create or replace function public.is_browser_role()
returns boolean
language sql
stable
as $$
  select current_user in ('anon', 'authenticated');
$$;

create or replace function public.assert_ticket_type_actor(p_actor text, p_role text, p_allowed text[])
returns void
language plpgsql
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

create or replace function public.workflow_has_state(p_definition jsonb, p_state text)
returns boolean
language sql
immutable
as $$
  select coalesce(exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(p_definition -> 'states') = 'array' then p_definition -> 'states' else '[]'::jsonb end) s
    where s ->> 'key' = p_state
  ), false);
$$;

create or replace function public.workflow_state_group(p_definition jsonb, p_state text)
returns text
language sql
immutable
as $$
  select coalesce(s ->> 'group', 'open')
  from jsonb_array_elements(case when jsonb_typeof(p_definition -> 'states') = 'array' then p_definition -> 'states' else '[]'::jsonb end) s
  where s ->> 'key' = p_state
  limit 1;
$$;

-- Where a ticket lands when its Ticket Type changes.
--   0. The current state must be known: either the new workflow has it, or it is one of the base states
--      todo / pending_approval / approved / in_progress / on_hold / pending_post_approval / done. A missing
--      or unrecognised state is REJECTED, never silently reset to the initial state.
--   1. Keep the current state when the new workflow has it; otherwise use the nearest earlier stage:
--        pending approval / approved        -> To Do
--        on hold / pending post-approval    -> In Progress
--   2. Approvals the new workflow requires are never skipped and never granted automatically:
--        To Do and a pre-approval stage                -> Pending Approval (Start Work needs "approved")
--        In Progress / On Hold and a NEW pre-approval  -> Pending Approval
--        Done and a NEW post-approval stage            -> Pending Post-approval
--      An unknown old workflow (null definition) counts as "had no approvals", so the checks still apply.
--   3. Done stays Done when the new workflow only adds a pre-approval (nothing is left to approve in advance).
create or replace function public.reconcile_ticket_state(p_old_state text, p_old_definition jsonb, p_new_definition jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_old text := nullif(trim(coalesce(p_old_state, '')), '');
  v_target text;
  v_new_pre boolean := public.workflow_has_state(p_new_definition, 'pending_approval');
  v_new_post boolean := public.workflow_has_state(p_new_definition, 'pending_post_approval');
  v_old_pre boolean := public.workflow_has_state(p_old_definition, 'pending_approval');
  v_old_post boolean := public.workflow_has_state(p_old_definition, 'pending_post_approval');
begin
  if v_old is null then
    raise exception 'The ticket has no workflow state, so its ticket type cannot be changed safely';
  end if;

  if public.workflow_has_state(p_new_definition, v_old) then
    v_target := v_old;
  elsif v_old in ('pending_approval', 'approved') then
    v_target := 'todo';
  elsif v_old in ('on_hold', 'pending_post_approval') then
    v_target := 'in_progress';
  else
    raise exception 'The ticket state "%" does not exist in the new workflow and cannot be mapped', v_old;
  end if;

  if v_target = 'done' and v_new_post and not v_old_post then
    v_target := 'pending_post_approval';
  elsif v_target = 'todo' and v_new_pre then
    v_target := 'pending_approval';
  elsif v_target in ('in_progress', 'on_hold') and v_new_pre and not v_old_pre then
    v_target := 'pending_approval';
  end if;

  if not public.workflow_has_state(p_new_definition, v_target) then
    raise exception 'The new workflow has no state "%" for this ticket', v_target;
  end if;
  return v_target;
end;
$$;

-- 5. Protection triggers ---------------------------------------------------------------------------------
-- Tickets: browsers may edit details, comments, followers and assignee, but never the ticket type, the
-- workflow version/state, the status or the completion time.
create or replace function public.guard_ticket_protected_fields()
returns trigger
language plpgsql
as $$
declare
  v_definition jsonb;
begin
  if not public.is_browser_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.ticket_type_key is not null or new.completed_at is not null then
      raise exception 'The ticket type and completion can only be set through the server' using errcode = '42501';
    end if;
    if new.workflow_version_id is not null or new.workflow_state is not null then
      select v.definition into v_definition from public.workflow_versions v where v.id::text = new.workflow_version_id::text;
      if v_definition is null
         or new.workflow_state is distinct from coalesce(v_definition ->> 'initial', v_definition -> 'states' -> 0 ->> 'key') then
        raise exception 'A new ticket must start in the initial state of its workflow' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.ticket_type_key is distinct from old.ticket_type_key
     or new.workflow_version_id is distinct from old.workflow_version_id
     or new.workflow_state is distinct from old.workflow_state
     or new.status is distinct from old.status
     or new.completed_at is distinct from old.completed_at then
    raise exception 'The ticket type and workflow state can only be changed through the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Ticket types: system types are immutable (only is_active may change); browsers cannot write at all.
create or replace function public.protect_system_ticket_types()
returns trigger
language plpgsql
as $$
begin
  if public.is_browser_role() then
    raise exception 'Ticket types can only be changed through the server' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.is_system and current_user = 'service_role' then
      raise exception 'System ticket types cannot be created';
    end if;
    return new;
  end if;
  if old.is_system then
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'is_active') = (to_jsonb(old) - 'is_active') then
      return new;
    end if;
    raise exception 'System ticket types cannot be edited or deleted';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Workflow templates: browsers cannot write; system templates are immutable for everyone.
create or replace function public.guard_workflow_templates()
returns trigger
language plpgsql
as $$
begin
  if public.is_browser_role() then
    raise exception 'Workflow templates can only be changed through the server' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if coalesce(old.is_system, false) then
    if tg_op = 'DELETE' then
      raise exception 'System workflow templates cannot be deleted';
    end if;
    if to_jsonb(new) <> to_jsonb(old) then
      raise exception 'System workflow templates cannot be modified';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Workflow versions: browsers cannot write; the versions of a system template are frozen (only is_active
-- may change) and a system template never gets a second version.
create or replace function public.guard_workflow_versions()
returns trigger
language plpgsql
as $$
declare
  v_system boolean;
begin
  if public.is_browser_role() then
    raise exception 'Workflow versions can only be changed through the server' using errcode = '42501';
  end if;

  select coalesce(t.is_system, false) into v_system
  from public.workflow_templates t
  where t.id::text = coalesce(new.template_id, old.template_id)::text;
  v_system := coalesce(v_system, false);

  if tg_op = 'INSERT' then
    if v_system and exists (select 1 from public.workflow_versions v where v.template_id::text = new.template_id::text) then
      raise exception 'System workflow templates cannot get new versions';
    end if;
    return new;
  end if;

  if v_system then
    if tg_op = 'DELETE' then
      raise exception 'System workflow versions cannot be deleted';
    end if;
    if (to_jsonb(new) - 'is_active') <> (to_jsonb(old) - 'is_active') then
      raise exception 'System workflow versions cannot be modified';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- The triggers are (re)created after the seed below so a repair of a broken default can run first.
drop trigger if exists zz_guard_ticket_protected_fields on public.tickets;
drop trigger if exists protect_system_ticket_types on public.ticket_types;
drop trigger if exists guard_workflow_templates on public.workflow_templates;
drop trigger if exists guard_workflow_versions on public.workflow_versions;

-- 6. Default ticket types (repairs a partial setup without creating orphaned templates) -------------------
do $seed$
declare
  r record;
  v_type public.ticket_types%rowtype;
  v_template_id uuid;
  v_config jsonb;
  v_has_type boolean;
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
    select * into v_type from public.ticket_types where key = r.key;
    v_has_type := found;
    v_template_id := null;

    -- 1) the template the type already points to
    if v_has_type and v_type.workflow_template_id is not null then
      select t.id into v_template_id from public.workflow_templates t where t.id::text = v_type.workflow_template_id;
    end if;
    -- 2) an unused system template of the same name left behind by an earlier partial run
    if v_template_id is null then
      select t.id into v_template_id
      from public.workflow_templates t
      where coalesce(t.is_system, false)
        and t.name = r.label
        and not exists (select 1 from public.ticket_types tt where tt.workflow_template_id = t.id::text)
      order by t.created_at
      limit 1;
    end if;
    -- 3) otherwise a new one
    if v_template_id is null then
      insert into public.workflow_templates (name, description, is_system)
      values (r.label, r.description, true)
      returning id into v_template_id;
    end if;

    v_config := coalesce(case when v_has_type then v_type.config end, r.config);

    if (public.current_ticket_type_version(v_template_id::text)).id is null then
      insert into public.workflow_versions (template_id, version, definition, is_active)
      select v_template_id,
             coalesce((select max(v.version) from public.workflow_versions v where v.template_id::text = v_template_id::text), 0) + 1,
             public.build_ticket_type_definition(v_config),
             false;
    end if;

    if not v_has_type then
      insert into public.ticket_types (key, label, description, is_system, workflow_template_id, config, is_active)
      values (r.key, r.label, r.description, true, v_template_id::text, v_config, true);
    elsif v_type.config is null or v_type.workflow_template_id is distinct from v_template_id::text then
      update public.ticket_types
      set label = r.label,
          description = r.description,
          is_system = true,
          workflow_template_id = v_template_id::text,
          config = v_config
      where key = r.key;
    end if;
  end loop;
end;
$seed$;

-- 6b. Legacy tickets without any workflow --------------------------------------------------------------------
-- A ticket with workflow_version_id AND workflow_state both NULL cannot run any workflow action ("This ticket
-- has no workflow"). Such a ticket is put on the current workflow of its own ticket type, or of 'standard'
-- when it has none, but only when its status maps to a state with certainty:
--     open -> todo,  in_progress -> in_progress,  done -> done.
-- Any other status (accepted, failed, empty, unknown ...) or a half-initialised ticket (only one of the two
-- columns set) stops the migration with a list of the tickets; nothing is guessed and nothing is changed.
-- status, assignee, completed_at, history_log and all history rows are left alone; the legacy `type` value
-- stays in place and is recorded as from_type in ticket_type_changes.
do $backfill$
declare
  r record;
  v_bad text;
  v_type public.ticket_types%rowtype;
  v_version public.workflow_versions%rowtype;
  v_state text;
  v_count int := 0;
begin
  select string_agg(format('ticket %s (workflow_version_id %s, workflow_state %s)', t.id, coalesce(t.workflow_version_id::text, 'NULL'), coalesce(t.workflow_state, 'NULL')), '; ' order by t.id::text)
  into v_bad
  from public.tickets t
  where (t.workflow_version_id is null) <> (t.workflow_state is null);
  if v_bad is not null then
    raise exception 'Tickets with only half a workflow need a manual decision, nothing was changed: %', v_bad;
  end if;

  select string_agg(format('ticket %s (status %L)', t.id, to_jsonb(t) ->> 'status'), '; ' order by t.id::text)
  into v_bad
  from public.tickets t
  where t.workflow_version_id is null and t.workflow_state is null
    and replace(lower(trim(coalesce(to_jsonb(t) ->> 'status', ''))), ' ', '_') not in ('open', 'in_progress', 'done');
  if v_bad is not null then
    raise exception 'Tickets without a workflow whose status cannot be mapped to a workflow state with certainty (map them by hand, then re-run). Nothing was changed: %', v_bad;
  end if;

  for r in
    select t.id,
           t.ticket_type_key,
           coalesce(t.ticket_type_key, to_jsonb(t) ->> 'type', to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type') as from_type,
           case replace(lower(trim(to_jsonb(t) ->> 'status')), ' ', '_')
             when 'open' then 'todo'
             when 'in_progress' then 'in_progress'
             when 'done' then 'done'
           end as target_state
    from public.tickets t
    where t.workflow_version_id is null and t.workflow_state is null
    order by t.id::text
    for update
  loop
    select * into v_type from public.ticket_types where key = coalesce(r.ticket_type_key, 'standard');
    if not found or v_type.workflow_template_id is null then
      raise exception 'Ticket %: ticket type % has no workflow, so the ticket cannot be initialised. Nothing was changed.', r.id, coalesce(r.ticket_type_key, 'standard');
    end if;
    select * into v_version from public.current_ticket_type_version(v_type.workflow_template_id);
    if v_version.id is null or not public.workflow_has_state(v_version.definition, r.target_state) then
      raise exception 'Ticket %: the workflow of ticket type % has no valid state "%". Nothing was changed.', r.id, v_type.key, r.target_state;
    end if;

    insert into public.ticket_type_changes (ticket_id, from_type, to_type, from_state, to_state, from_version_id, to_version_id, reason, changed_by, changed_role)
    values (r.id::text, r.from_type, v_type.key, null, r.target_state, null, v_version.id::text,
            'Legacy ticket without a workflow initialised by ticket_type_hardening.sql', 'migration', 'System');

    update public.tickets
    set ticket_type_key = v_type.key,
        workflow_version_id = v_version.id,
        workflow_state = r.target_state
    where id = r.id;

    select workflow_state into v_state
    from public.tickets t
    where t.id = r.id and t.workflow_version_id::text = v_version.id::text and t.ticket_type_key = v_type.key;
    if v_state is distinct from r.target_state then
      raise exception 'Ticket % was not initialised as expected (a trigger on public.tickets changed the result). Nothing was changed.', r.id;
    end if;
    v_count := v_count + 1;
  end loop;

  raise notice 'Legacy tickets initialised into a workflow: %', v_count;
end;
$backfill$;

create trigger zz_guard_ticket_protected_fields
  before insert or update on public.tickets
  for each row execute function public.guard_ticket_protected_fields();
create trigger protect_system_ticket_types
  before insert or update or delete on public.ticket_types
  for each row execute function public.protect_system_ticket_types();
create trigger guard_workflow_templates
  before insert or update or delete on public.workflow_templates
  for each row execute function public.guard_workflow_templates();
create trigger guard_workflow_versions
  before insert or update or delete on public.workflow_versions
  for each row execute function public.guard_workflow_versions();

-- Read-only for browsers; every write goes through the service-role functions below.
revoke insert, update, delete, truncate on public.ticket_types from anon, authenticated;
revoke insert, update, delete, truncate on public.workflow_templates from anon, authenticated;
revoke insert, update, delete, truncate on public.workflow_versions from anon, authenticated;

-- Column-level write grants are separate ACL entries (pg_attribute.attacl). A table-level REVOKE only removes
-- column grants made by the same grantor, so revoke them explicitly per column, then fail the migration if
-- any direct column-level INSERT/UPDATE grant to a browser role is still present. SELECT is left untouched.
do $column_privileges$
declare
  r record;
  v_remaining text;
begin
  for r in
    select c.relname, a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relname in ('ticket_types', 'workflow_templates', 'workflow_versions')
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
  loop
    execute format(
      'revoke insert (%1$I), update (%1$I) on public.%2$I from anon, authenticated',
      r.attname, r.relname
    );
  end loop;

  select string_agg(distinct c.relname || '.' || a.attname || ' (' || ro.rolname || ': ' || acl.privilege_type || ')', ', ')
  into v_remaining
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  cross join lateral aclexplode(a.attacl) as acl
  join pg_roles ro on ro.oid = acl.grantee
  where n.nspname = 'public'
    and c.relname in ('ticket_types', 'workflow_templates', 'workflow_versions')
    and a.attnum > 0
    and not a.attisdropped
    and ro.rolname in ('anon', 'authenticated')
    and acl.privilege_type in ('INSERT', 'UPDATE');

  if v_remaining is not null then
    raise exception 'Column-level write grants remain for browser roles: %', v_remaining;
  end if;
end;
$column_privileges$;

-- 6c. Browser access to public.tickets ------------------------------------------------------------------------
-- Before: anonymous visitors could read tickets and browsers could write title, description, assignee and
-- every other ticket field directly. After: only signed-in users (the API hands the browser a short-lived
-- `authenticated` database token, see api/db-token.ts) can READ tickets, which also keeps realtime updates
-- working. Nobody can write a ticket from a browser; every write goes through the *_secure functions below.
-- The previous policies, RLS state and grants are recorded in ticket_type_migration_backup for the rollback.
alter table public.tickets enable row level security;

do $tickets_policies$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'tickets' loop
    execute format('drop policy %I on public.tickets', p.policyname);
  end loop;
end;
$tickets_policies$;

create policy "tickets_read_signed_in" on public.tickets for select to authenticated using (true);

do $tickets_privileges$
declare
  r record;
  v_remaining text;
begin
  for r in
    select a.attname
    from pg_attribute a
    where a.attrelid = to_regclass('public.tickets') and a.attnum > 0 and not a.attisdropped
  loop
    execute format('revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on public.tickets from anon, authenticated', r.attname);
  end loop;

  revoke all on public.tickets from anon, authenticated;
  grant select on public.tickets to authenticated;

  select string_agg(distinct a.attname || ' (' || ro.rolname || ': ' || acl.privilege_type || ')', ', ')
  into v_remaining
  from pg_attribute a
  cross join lateral aclexplode(a.attacl) as acl
  join pg_roles ro on ro.oid = acl.grantee
  where a.attrelid = to_regclass('public.tickets') and a.attnum > 0 and not a.attisdropped
    and ro.rolname in ('anon', 'authenticated');
  if v_remaining is not null then
    raise exception 'Column-level grants remain on public.tickets for browser roles: %', v_remaining;
  end if;
end;
$tickets_privileges$;

-- 6d. History is evidence, not browser-editable data. Keep all access behind server functions.
do $history_lockdown$
declare
  v_table text;
  v_column text;
  v_policy text;
begin
  foreach v_table in array array['ticket_state_history', 'ticket_assignment_history'] loop
    for v_policy in select policyname from pg_policies where schemaname = 'public' and tablename = v_table loop
      execute format('drop policy %I on public.%I', v_policy, v_table);
    end loop;
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    for v_column in
      select a.attname from pg_attribute a
      where a.attrelid = to_regclass('public.' || v_table) and a.attnum > 0 and not a.attisdropped
    loop
      execute format('revoke all (%1$I) on public.%2$I from public, anon, authenticated', v_column, v_table);
    end loop;
  end loop;
end;
$history_lockdown$;

-- Small helper for the functions below: sets one key inside ptz_coordinates.metadata.
create or replace function public.ticket_metadata_set(p_ptz jsonb, p_key text, p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    case when jsonb_typeof(p_ptz) = 'object' then p_ptz else '{}'::jsonb end,
    '{metadata}',
    (case when jsonb_typeof(p_ptz -> 'metadata') = 'object' then p_ptz -> 'metadata' else '{}'::jsonb end)
      || jsonb_build_object(p_key, p_value)
  );
$$;

-- 7. Service-role functions ------------------------------------------------------------------------------
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
  if exists (
    select 1 from public.tickets t
    where t.ticket_type_key = p_key
       or to_jsonb(t) ->> 'type' = p_key
       or to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type' = p_key
  ) then
    raise exception 'Tickets of this type exist, so it cannot be deleted';
  end if;
  perform public.delete_ticket_type(p_key);
end;
$$;

-- Gives a ticket that was JUST created its type: stores the type reference and pins the current workflow
-- version. It refuses anything that has progressed, so an existing ticket's workflow can never be reset
-- by this call; those tickets use change_ticket_type_secure (reason required, audited, reconciled).
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
  v_current jsonb;
  v_initial text;
  v_group text;
  v_status text;
  v_created timestamptz;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if v_ticket.ticket_type_key is not distinct from p_type_key then
    return v_ticket;
  end if;
  if v_ticket.ticket_type_key is not null then
    raise exception 'This ticket already has a ticket type. Use Change type instead';
  end if;

  v_status := lower(trim(coalesce(to_jsonb(v_ticket) ->> 'status', '')));
  v_created := nullif(to_jsonb(v_ticket) ->> 'created_at', '')::timestamptz;

  if v_ticket.completed_at is not null
     or v_status in ('in progress', 'in_progress', 'done', 'accepted', 'failed')
     or exists (select 1 from public.ticket_state_history h where h.ticket_id::text = v_ticket.id::text)
     or exists (select 1 from public.ticket_type_changes c where c.ticket_id = v_ticket.id::text) then
    raise exception 'This ticket has already progressed, so its type can only be changed with Change type';
  end if;

  if v_ticket.workflow_version_id is not null then
    select v.definition into v_current from public.workflow_versions v where v.id::text = v_ticket.workflow_version_id::text;
    if v_current is null
       or v_ticket.workflow_state is distinct from coalesce(v_current ->> 'initial', v_current -> 'states' -> 0 ->> 'key') then
      raise exception 'This ticket has already progressed, so its type can only be changed with Change type';
    end if;
  elsif v_ticket.workflow_state is not null then
    raise exception 'This ticket has already progressed, so its type can only be changed with Change type';
  end if;

  if v_created is not null and v_created < now() - interval '1 hour' then
    raise exception 'Only a newly created ticket can be given its type this way. Use Change type instead';
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
  v_group := coalesce(public.workflow_state_group(v_version.definition, v_initial), 'open');

  insert into public.ticket_type_changes (ticket_id, from_type, to_type, from_state, to_state, from_version_id, to_version_id, reason, changed_by, changed_role)
  values (v_ticket.id::text, null, v_type.key, v_ticket.workflow_state, v_initial, v_ticket.workflow_version_id::text, v_version.id::text,
          'Ticket type chosen at creation', coalesce(v_by, 'System'), p_role);

  update public.tickets
  set ticket_type_key = v_type.key,
      workflow_version_id = v_version.id,
      workflow_state = v_initial,
      status = public.workflow_group_status(v_group)
  where id = v_ticket.id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

-- Changes the Ticket Type of an existing ticket in any state and reconciles it with the new workflow (see
-- reconcile_ticket_state). Assignee, comments, completed_at and every earlier history entry are preserved;
-- the change is appended to the ticket history and to ticket_type_changes.
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
  v_old_definition jsonb;
  v_definition jsonb;
  v_now timestamptz := now();
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_old_type text;
  v_old_state text;
  v_status text;
  v_target text;
  v_group text;
  v_assignee text;
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
  v_definition := v_version.definition;

  -- The workflow the ticket is on today. It may be missing (null): approvals are then still enforced.
  if v_ticket.workflow_version_id is not null then
    select v.definition into v_old_definition from public.workflow_versions v where v.id::text = v_ticket.workflow_version_id::text;
  end if;

  v_status := lower(trim(coalesce(to_jsonb(v_ticket) ->> 'status', '')));
  v_old_state := coalesce(
    v_ticket.workflow_state,
    case v_status
      when 'done' then 'done'
      when 'accepted' then 'done'
      when 'in progress' then 'in_progress'
      when 'in_progress' then 'in_progress'
      else null
    end
  );

  v_target := public.reconcile_ticket_state(v_old_state, v_old_definition, v_definition);
  if not public.workflow_has_state(v_definition, v_target) then
    raise exception 'The new workflow has no matching state for this ticket';
  end if;
  v_group := coalesce(public.workflow_state_group(v_definition, v_target), 'open');

  v_assignee := coalesce(nullif(trim(v_ticket.assignee), ''), 'Unassigned');
  if v_target is distinct from v_old_state and v_group = 'in_progress' and v_assignee = 'Unassigned' then
    raise exception 'Assign the ticket to someone before moving it back into progress';
  end if;

  v_text := 'Ticket type changed from ' || coalesce(v_old_type, 'unknown') || ' to ' || v_type.label
    || case when v_target is distinct from v_old_state then ' (state ' || coalesce(v_old_state, 'none') || ' to ' || v_target || ')' else '' end
    || case when v_ticket.completed_at is not null then '; original completion time kept' else '' end;

  if v_target is distinct from v_old_state then
    insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at, action_label, note, workflow_version_id)
    values (v_ticket.id, v_old_state, v_target, v_by, v_now, 'Ticket type changed', v_reason, v_version.id);
  end if;

  insert into public.ticket_type_changes (ticket_id, from_type, to_type, from_state, to_state, from_version_id, to_version_id, reason, changed_by, changed_role, changed_at)
  values (v_ticket.id::text, v_old_type, v_type.key, v_old_state, v_target, v_ticket.workflow_version_id::text, v_version.id::text, v_reason, v_by, p_role, v_now);

  -- completed_at is deliberately not touched: the original completion time and record stay on the ticket.
  update public.tickets
  set ticket_type_key = v_type.key,
      workflow_version_id = v_version.id,
      workflow_state = v_target,
      status = public.workflow_group_status(v_group),
      history_log = coalesce(history_log, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', v_now, 'by', v_by, 'text', v_text, 'comment', v_reason))
  where id = v_ticket.id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

-- Runs one workflow action for the signed-in user. The actor recorded in the history is the session user,
-- never a value chosen by the browser. Every role (Administrator, Operator, Viewer) may run permitted
-- workflow actions, but ONLY when they are the ticket's current assignee or its reporter: the role alone
-- never grants permission. The transition rules, approval gates, mandatory comments and assignment history
-- are enforced by apply_workflow_action, which only this function can reach.
create or replace function public.apply_workflow_action_secure(
  p_ticket_id text, p_action_id text, p_actor text, p_role text,
  p_new_assignee text default null, p_note text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_actor text := nullif(trim(coalesce(p_actor, '')), '');
  v_new text := nullif(trim(coalesce(p_new_assignee, '')), '');
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  if v_actor is null
     or lower(v_actor) = 'unassigned'
     or not coalesce(v_actor = trim(coalesce(v_ticket.assignee, '')) or v_actor = trim(coalesce(v_ticket.reporter, '')), false) then
    raise exception 'Only the ticket''s current assignee or its reporter can run workflow actions' using errcode = '42501';
  end if;
  if v_new is not null and lower(v_new) = 'unassigned' then
    raise exception 'Choose a person, not Unassigned';
  end if;

  return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
end;
$$;

-- Creates a ticket. The reporter, the creation time, the status and the workflow are decided here, never by
-- the browser: the ticket is pinned to the CURRENT workflow version of the Ticket Type it was created with,
-- overriding whatever a trigger on INSERT (for example tickets_assign_workflow) may have assigned.
create or replace function public.create_ticket_secure(
  p_ticket jsonb, p_type_key text, p_actor text, p_role text
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
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_id text;
  v_title text;
  v_priority text;
  v_assignee text;
  v_initial text;
  v_group text;
  v_status text;
  v_now timestamptz := now();
  v_ptz jsonb;
  v_followers jsonb;
  v_row jsonb;
  v_cols text;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  if jsonb_typeof(p_ticket) is distinct from 'object' then
    raise exception 'Invalid ticket';
  end if;

  v_id := nullif(trim(coalesce(p_ticket ->> 'id', '')), '');
  v_title := nullif(trim(coalesce(p_ticket ->> 'title', '')), '');
  v_priority := lower(trim(coalesce(p_ticket ->> 'priority', '')));
  v_assignee := coalesce(nullif(trim(coalesce(p_ticket ->> 'assignee', '')), ''), 'Unassigned');
  if v_id is null or v_title is null then
    raise exception 'A ticket needs an id and a title';
  end if;
  if v_priority not in ('critical', 'high', 'medium', 'low') then
    raise exception 'Invalid priority';
  end if;
  if exists (select 1 from public.tickets t where t.id::text = v_id) then
    raise exception 'A ticket with this id already exists';
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
  v_group := coalesce(public.workflow_state_group(v_version.definition, v_initial), 'open');
  v_status := public.workflow_group_status(v_group);

  v_ptz := case when jsonb_typeof(p_ticket -> 'ptz_coordinates') = 'object' then p_ticket -> 'ptz_coordinates' else '{}'::jsonb end;
  select coalesce(jsonb_agg(f order by f), '[]'::jsonb) into v_followers
  from (
    select v_by as f
    union
    select x from jsonb_array_elements_text(
      case when jsonb_typeof(v_ptz -> 'metadata' -> 'followers') = 'array' then v_ptz -> 'metadata' -> 'followers' else '[]'::jsonb end) x
    where nullif(trim(x), '') is not null
  ) s;
  v_ptz := jsonb_set(v_ptz, '{metadata}',
    ((case when jsonb_typeof(v_ptz -> 'metadata') = 'object' then v_ptz -> 'metadata' else '{}'::jsonb end) - 'completedAt' - 'completion')
    || jsonb_build_object('type', v_type.key, 'followers', v_followers));

  v_row := jsonb_build_object(
    'id', v_id, 'ticket_id', v_id, 'created_at', v_now, 'status', v_status,
    'title', v_title, 'description', coalesce(p_ticket ->> 'description', ''), 'priority', v_priority,
    'reporter', v_by, 'assignee', v_assignee, 'camera_name', coalesce(p_ticket ->> 'camera_name', 'Earth'),
    'ptz_coordinates', v_ptz,
    'history_log', jsonb_build_array(jsonb_build_object('at', v_now, 'by', v_by, 'text', 'Ticket created')),
    'replies', '[]'::jsonb,
    'ticket_type_key', v_type.key, 'workflow_version_id', v_version.id, 'workflow_state', v_initial);

  select string_agg(quote_ident(k), ', ') into v_cols
  from jsonb_object_keys(v_row) k
  where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'tickets' and c.column_name = k);

  execute format('insert into public.tickets (%1$s) select %1$s from jsonb_populate_record(null::public.tickets, $1) returning *', v_cols)
  into v_ticket using v_row;

  -- A trigger on INSERT may have attached some other workflow: pin the one that belongs to the Ticket Type.
  update public.tickets
  set ticket_type_key = v_type.key,
      workflow_version_id = v_version.id,
      workflow_state = v_initial,
      status = v_status
  where id = v_ticket.id
  returning * into v_ticket;

  if v_ticket.ticket_type_key is distinct from v_type.key
     or v_ticket.workflow_version_id::text is distinct from v_version.id::text
     or v_ticket.workflow_state is distinct from v_initial then
    raise exception 'The ticket was not created on the workflow of its ticket type (a trigger changed the result)';
  end if;

  insert into public.ticket_type_changes (ticket_id, from_type, to_type, from_state, to_state, from_version_id, to_version_id, reason, changed_by, changed_role, changed_at)
  values (v_ticket.id::text, null, v_type.key, null, v_initial, null, v_version.id::text, 'Ticket type chosen at creation', v_by, p_role, v_now);

  if v_assignee <> 'Unassigned' then
    insert into public.ticket_assignment_history (ticket_id, from_assignee, to_assignee, changed_by, action_label, note, changed_at)
    values (v_ticket.id, 'Unassigned', v_assignee, v_by, 'Assigned at creation', null, v_now);
  end if;

  return v_ticket;
end;
$$;

-- Edits title, description, priority, the additional fields and the creation snapshot. It never touches the
-- assignee, the workflow, the status or the reporter.
create or replace function public.update_ticket_details_secure(
  p_ticket_id text, p_title text, p_description text, p_priority text,
  p_additional jsonb, p_creation_snapshot jsonb, p_actor text, p_role text
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_priority text := lower(trim(coalesce(p_priority, '')));
  v_ptz jsonb;
  v_snapshots jsonb;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  if v_title is null then
    raise exception 'A ticket needs a title';
  end if;
  if v_priority not in ('critical', 'high', 'medium', 'low') then
    raise exception 'Invalid priority';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  if p_role = 'Operator' and v_ticket.assignee is distinct from v_by then
    raise exception 'Operators may edit ticket details only when they are the current assignee' using errcode = '42501';
  end if;

  v_ptz := v_ticket.ptz_coordinates;
  if p_additional is not null then
    v_ptz := public.ticket_metadata_set(v_ptz, 'additional', p_additional);
  end if;
  if p_creation_snapshot is not null then
    v_snapshots := case when jsonb_typeof(v_ptz -> 'metadata' -> 'snapshots') = 'object' then v_ptz -> 'metadata' -> 'snapshots' else '{}'::jsonb end;
    v_ptz := public.ticket_metadata_set(v_ptz, 'snapshots', v_snapshots || jsonb_build_object('before', p_creation_snapshot));
  end if;

  update public.tickets
  set title = v_title,
      description = coalesce(p_description, ''),
      priority = v_priority,
      ptz_coordinates = v_ptz,
      history_log = coalesce(history_log, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', now(), 'by', v_by, 'text', 'Ticket details updated'))
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

-- Adds a comment (every role may comment).
create or replace function public.add_ticket_comment_secure(
  p_ticket_id text, p_text text, p_attachments jsonb, p_actor text, p_role text
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_comment jsonb;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);
  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception 'Invalid attachments';
  end if;
  if nullif(trim(coalesce(p_text, '')), '') is null and jsonb_array_length(v_attachments) = 0 then
    raise exception 'A comment needs text or an attachment';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  v_comment := jsonb_build_object('at', now(), 'by', v_by, 'text', coalesce(p_text, ''))
    || case when jsonb_array_length(v_attachments) > 0 then jsonb_build_object('attachments', v_attachments) else '{}'::jsonb end;

  update public.tickets
  set replies = coalesce(replies, '[]'::jsonb) || jsonb_build_array(v_comment)
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

-- Followers: toggle (the signed-in user follows / unfollows), add, share and remove.
create or replace function public.update_ticket_followers_secure(
  p_ticket_id text, p_op text, p_people text[], p_actor text, p_role text
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_current text[];
  v_people text[];
  v_next text[];
  v_text text;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);
  if p_op not in ('toggle', 'add', 'share', 'remove') then
    raise exception 'Invalid follower operation';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  v_current := array(
    select x from jsonb_array_elements_text(
      case when jsonb_typeof(v_ticket.ptz_coordinates -> 'metadata' -> 'followers') = 'array'
           then v_ticket.ptz_coordinates -> 'metadata' -> 'followers' else '[]'::jsonb end) x);
  v_people := array(select distinct trim(x) from unnest(coalesce(p_people, '{}')) x where nullif(trim(x), '') is not null);

  if p_op = 'toggle' then
    if v_by = any (v_current) then
      v_next := array(select f from unnest(v_current) f where f <> v_by);
      v_text := v_by || ' stopped following this ticket';
    else
      v_next := v_current || v_by;
      v_text := v_by || ' started following this ticket';
    end if;
  elsif p_op = 'remove' then
    v_next := array(select f from unnest(v_current) f where f <> all (v_people));
    v_text := v_by || ' removed ' || array_to_string(v_people, ', ') || ' from followers';
  else
    v_next := v_current || array(select p from unnest(v_people) p where p <> all (v_current));
    v_text := case when p_op = 'share' then v_by || ' shared this ticket with ' else v_by || ' added followers: ' end
      || array_to_string(v_people, ', ');
  end if;

  update public.tickets
  set ptz_coordinates = public.ticket_metadata_set(ptz_coordinates, 'followers', to_jsonb(v_next)),
      history_log = coalesce(history_log, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', now(), 'by', v_by, 'text', v_text))
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

-- Stores the before / after snapshot of a ticket.
create or replace function public.attach_ticket_snapshot_secure(
  p_ticket_id text, p_slot text, p_snapshot jsonb, p_actor text, p_role text
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_snapshots jsonb;
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  if p_slot not in ('before', 'after') or jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'Invalid snapshot';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  v_snapshots := case when jsonb_typeof(v_ticket.ptz_coordinates -> 'metadata' -> 'snapshots') = 'object'
                      then v_ticket.ptz_coordinates -> 'metadata' -> 'snapshots' else '{}'::jsonb end;
  update public.tickets
  set ptz_coordinates = public.ticket_metadata_set(ptz_coordinates, 'snapshots', v_snapshots || jsonb_build_object(p_slot, p_snapshot)),
      history_log = coalesce(history_log, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('at', now(), 'by', v_by, 'text', initcap(p_slot) || ' snapshot saved'))
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

-- Permanent deletion leaves a minimal, non-recoverable audit record (no ticket payload or FK).
create table if not exists public.ticket_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null,
  deleted_by text not null,
  deleted_role text not null,
  deleted_at timestamptz not null default now()
);
create index if not exists ticket_deletion_audit_deleted_at_idx on public.ticket_deletion_audit (deleted_at desc);
create index if not exists ticket_deletion_audit_ticket_idx on public.ticket_deletion_audit (ticket_id, deleted_at desc);
alter table public.ticket_deletion_audit enable row level security;
revoke all on public.ticket_deletion_audit from public, anon, authenticated;
grant select on public.ticket_deletion_audit to service_role;

-- Permanently deletes the ticket. The separate audit record is retained.
create or replace function public.delete_ticket_secure(p_ticket_id text, p_actor text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $body$
declare
  v_ticket public.tickets%rowtype;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;
  insert into public.ticket_deletion_audit (ticket_id, deleted_by, deleted_role, deleted_at)
  values (v_ticket.id::text, v_by, p_role, now());
  delete from public.tickets where id = v_ticket.id;
end;
$body$;

-- The audit trail of ticket type changes, for Administrators and Operators.
create or replace function public.get_ticket_type_changes_secure(p_ticket_id text, p_actor text, p_role text)
returns setof public.ticket_type_changes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator']);
  return query
    select * from public.ticket_type_changes c
    where c.ticket_id = p_ticket_id
    order by c.changed_at desc
    limit 200;
end;
$$;

-- Lets the API report which revision of this hardening the database has.
create or replace function public.ticket_type_hardening_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'revision', 3,
    'browser_can_run_workflow_actions',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('apply_workflow_action', 'change_ticket_state')
                and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
    'browser_can_read_type_changes', has_table_privilege('anon', 'public.ticket_type_changes', 'select')
      or has_table_privilege('authenticated', 'public.ticket_type_changes', 'select')
      or has_any_column_privilege('anon', 'public.ticket_type_changes', 'select')
      or has_any_column_privilege('authenticated', 'public.ticket_type_changes', 'select'),
    'anon_can_read_tickets', has_table_privilege('anon', 'public.tickets', 'select')
      or has_any_column_privilege('anon', 'public.tickets', 'select'),
    'browser_can_write_tickets', has_table_privilege('anon', 'public.tickets', 'insert,update,delete')
      or has_table_privilege('authenticated', 'public.tickets', 'insert,update,delete')
      or has_any_column_privilege('anon', 'public.tickets', 'insert,update,references')
      or has_any_column_privilege('authenticated', 'public.tickets', 'insert,update,references'),
    'anon_can_access_history', has_table_privilege('anon', 'public.ticket_state_history', 'select,insert,update,delete,truncate,references,trigger')
      or has_table_privilege('anon', 'public.ticket_assignment_history', 'select,insert,update,delete,truncate,references,trigger')
      or has_any_column_privilege('anon', 'public.ticket_state_history', 'select,insert,update,references')
      or has_any_column_privilege('anon', 'public.ticket_assignment_history', 'select,insert,update,references'),
    'authenticated_can_access_history', has_table_privilege('authenticated', 'public.ticket_state_history', 'select,insert,update,delete,truncate,references,trigger')
      or has_table_privilege('authenticated', 'public.ticket_assignment_history', 'select,insert,update,delete,truncate,references,trigger')
      or has_any_column_privilege('authenticated', 'public.ticket_state_history', 'select,insert,update,references')
      or has_any_column_privilege('authenticated', 'public.ticket_assignment_history', 'select,insert,update,references'),
    'anon_can_access_deletion_audit', has_table_privilege('anon', 'public.ticket_deletion_audit', 'select,insert,update,delete,truncate,references,trigger')
      or has_any_column_privilege('anon', 'public.ticket_deletion_audit', 'select,insert,update,references'),
    'authenticated_can_access_deletion_audit', has_table_privilege('authenticated', 'public.ticket_deletion_audit', 'select,insert,update,delete,truncate,references,trigger')
      or has_any_column_privilege('authenticated', 'public.ticket_deletion_audit', 'select,insert,update,references'),
    'anon_can_run_legacy_workflow_admin',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('apply_ticket_type_workflow','create_ticket_type','update_ticket_type',
                'delete_ticket_type','save_workflow_template','activate_workflow_template','delete_workflow_template')
                and has_function_privilege('anon', p.oid, 'execute')),
    'authenticated_can_run_legacy_workflow_admin',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('apply_ticket_type_workflow','create_ticket_type','update_ticket_type',
                'delete_ticket_type','save_workflow_template','activate_workflow_template','delete_workflow_template')
                and has_function_privilege('authenticated', p.oid, 'execute'))
  );
$$;

-- 8. Grants ----------------------------------------------------------------------------------------------
revoke execute on function public.create_ticket_type(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.update_ticket_type(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_ticket_type(text) from public, anon, authenticated;
revoke execute on function public.apply_ticket_type_workflow(text) from public, anon, authenticated;
grant execute on function public.create_ticket_type(text, text, jsonb) to service_role;
grant execute on function public.update_ticket_type(text, text, text, jsonb) to service_role;
grant execute on function public.delete_ticket_type(text) to service_role;
grant execute on function public.apply_ticket_type_workflow(text) to service_role;

-- save_workflow_template is only ever called from the security definer functions above (as their owner).
-- change_ticket_state is the legacy direct state change; the app never calls it and the workflow actions replace
-- it. Browsers must not be able to call any of them, whatever their signature is. service_role keeps whatever
-- it had for these two.
-- apply_workflow_action (every overload) is closed to service_role as well: it trusts the actor it is given and
-- has no assignee / reporter check, so the ONLY way to run a workflow action is apply_workflow_action_secure,
-- which calls it as the function owner.
do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname::text as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('save_workflow_template', 'change_ticket_state', 'apply_workflow_action', 'activate_workflow_template', 'delete_workflow_template')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    if r.name = 'apply_workflow_action' then
      execute format('revoke execute on function %s from service_role', r.sig);
    end if;
  end loop;
end;
$grants$;

revoke execute on function public.ticket_metadata_set(jsonb, text, jsonb) from public, anon, authenticated;

revoke execute on function public.assert_ticket_type_actor(text, text, text[]) from public, anon, authenticated;
revoke execute on function public.current_ticket_type_version(text) from public, anon, authenticated;
revoke execute on function public.workflow_has_state(jsonb, text) from public, anon, authenticated;
revoke execute on function public.workflow_state_group(jsonb, text) from public, anon, authenticated;
revoke execute on function public.reconcile_ticket_state(text, jsonb, jsonb) from public, anon, authenticated;

revoke execute on function public.create_ticket_type_secure(text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.update_ticket_type_secure(text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.delete_ticket_type_secure(text, text, text) from public, anon, authenticated;
revoke execute on function public.apply_ticket_type_secure(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.change_ticket_type_secure(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.apply_workflow_action_secure(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.get_ticket_type_changes_secure(text, text, text) from public, anon, authenticated;
revoke execute on function public.ticket_type_hardening_status() from public, anon, authenticated;
revoke execute on function public.create_ticket_secure(jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.update_ticket_details_secure(text, text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.add_ticket_comment_secure(text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.update_ticket_followers_secure(text, text, text[], text, text) from public, anon, authenticated;
revoke execute on function public.attach_ticket_snapshot_secure(text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.delete_ticket_secure(text, text, text) from public, anon, authenticated;

grant execute on function public.create_ticket_secure(jsonb, text, text, text) to service_role;
grant execute on function public.update_ticket_details_secure(text, text, text, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.add_ticket_comment_secure(text, text, jsonb, text, text) to service_role;
grant execute on function public.update_ticket_followers_secure(text, text, text[], text, text) to service_role;
grant execute on function public.attach_ticket_snapshot_secure(text, text, jsonb, text, text) to service_role;
grant execute on function public.delete_ticket_secure(text, text, text) to service_role;
grant execute on function public.create_ticket_type_secure(text, text, jsonb, text, text) to service_role;
grant execute on function public.update_ticket_type_secure(text, text, text, jsonb, text, text) to service_role;
grant execute on function public.delete_ticket_type_secure(text, text, text) to service_role;
grant execute on function public.apply_ticket_type_secure(text, text, text, text) to service_role;
grant execute on function public.change_ticket_type_secure(text, text, text, text, text) to service_role;
grant execute on function public.apply_workflow_action_secure(text, text, text, text, text, text) to service_role;
grant execute on function public.get_ticket_type_changes_secure(text, text, text) to service_role;
grant execute on function public.ticket_type_hardening_status() to service_role;

-- 9. Postflight: any failed assertion aborts the transaction and nothing above is kept ------------------------
do $post$
declare
  v_sig text;
  v_role text;
  r record;
begin
  foreach v_sig in array array[
    'public.apply_ticket_type_workflow(text)',
    'public.create_ticket_type(text,text,jsonb)',
    'public.update_ticket_type(text,text,text,jsonb)',
    'public.delete_ticket_type(text)',
    'public.create_ticket_type_secure(text,text,jsonb,text,text)',
    'public.update_ticket_type_secure(text,text,text,jsonb,text,text)',
    'public.delete_ticket_type_secure(text,text,text)',
    'public.apply_ticket_type_secure(text,text,text,text)',
    'public.change_ticket_type_secure(text,text,text,text,text)',
    'public.apply_workflow_action_secure(text,text,text,text,text,text)',
    'public.get_ticket_type_changes_secure(text,text,text)',
    'public.create_ticket_secure(jsonb,text,text,text)',
    'public.update_ticket_details_secure(text,text,text,text,jsonb,jsonb,text,text)',
    'public.add_ticket_comment_secure(text,text,jsonb,text,text)',
    'public.update_ticket_followers_secure(text,text,text[],text,text)',
    'public.attach_ticket_snapshot_secure(text,text,jsonb,text,text)',
    'public.delete_ticket_secure(text,text,text)'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'Postflight failed: % can still execute %', v_role, v_sig;
      end if;
    end loop;
    if not has_function_privilege('service_role', v_sig, 'execute') then
      raise exception 'Postflight failed: service_role cannot execute %', v_sig;
    end if;
  end loop;

  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('save_workflow_template', 'change_ticket_state', 'apply_workflow_action', 'activate_workflow_template', 'delete_workflow_template')
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, r.sig, 'execute') then
        raise exception 'Postflight failed: % can still execute %', v_role, r.sig;
      end if;
    end loop;
  end loop;

  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_workflow_action'
  loop
    if has_function_privilege('service_role', r.sig, 'execute') then
      raise exception 'Postflight failed: service_role can still execute % directly (workflow actions must go through apply_workflow_action_secure)', r.sig;
    end if;
  end loop;

  -- public.tickets: anonymous visitors have nothing, signed-in browsers can only read, and there is exactly one policy
  if has_table_privilege('anon', 'public.tickets', 'select,insert,update,delete,truncate,references,trigger')
     or has_any_column_privilege('anon', 'public.tickets', 'select,insert,update,references') then
    raise exception 'Postflight failed: anon can still access public.tickets';
  end if;
  if has_table_privilege('authenticated', 'public.tickets', 'insert,update,delete,truncate,references,trigger')
     or has_any_column_privilege('authenticated', 'public.tickets', 'insert,update,references') then
    raise exception 'Postflight failed: authenticated can still write public.tickets';
  end if;
  if not has_table_privilege('authenticated', 'public.tickets', 'select') then
    raise exception 'Postflight failed: authenticated can no longer read public.tickets';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.tickets'::regclass) then
    raise exception 'Postflight failed: row level security is not enabled on public.tickets';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.ticket_state_history', 'select,insert,update,delete,truncate,references,trigger')
       or has_table_privilege(v_role, 'public.ticket_assignment_history', 'select,insert,update,delete,truncate,references,trigger')
       or has_any_column_privilege(v_role, 'public.ticket_state_history', 'select,insert,update,references')
       or has_any_column_privilege(v_role, 'public.ticket_assignment_history', 'select,insert,update,references')
       or exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('ticket_state_history','ticket_assignment_history')) then
      raise exception 'Postflight failed: % can still access ticket history tables', v_role;
    end if;
  end loop;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tickets') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tickets'
                    and policyname = 'tickets_read_signed_in' and cmd = 'SELECT' and roles = '{authenticated}') then
    raise exception 'Postflight failed: public.tickets must have exactly one policy, tickets_read_signed_in (SELECT, authenticated)';
  end if;

  foreach v_sig in array array['public.ticket_types', 'public.workflow_templates', 'public.workflow_versions'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, v_sig, 'insert') or has_table_privilege(v_role, v_sig, 'update') or has_table_privilege(v_role, v_sig, 'delete') then
        raise exception 'Postflight failed: % can still write %', v_role, v_sig;
      end if;
    end loop;
  end loop;

  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.ticket_type_changes', 'select') or has_table_privilege(v_role, 'public.ticket_type_migration_backup', 'select') then
      raise exception 'Postflight failed: % can read the audit trail or the migration backup', v_role;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('ticket_type_changes','ticket_state_history','ticket_assignment_history')) then
    raise exception 'Postflight failed: an audit or history table still has a browser policy';
  end if;
  if has_table_privilege('anon', 'public.ticket_deletion_audit', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.ticket_deletion_audit', 'select,insert,update,delete') then
    raise exception 'Postflight failed: browser roles can access the ticket deletion audit';
  end if;

  if (select count(*) from pg_trigger where not tgisinternal and tgname in (
        'zz_guard_ticket_protected_fields', 'protect_system_ticket_types', 'guard_workflow_templates', 'guard_workflow_versions')) <> 4 then
    raise exception 'Postflight failed: a protection trigger is missing';
  end if;

  if exists (
    select 1 from public.ticket_types
    where key in ('standard', 'financial', 'maintenance')
      and (config is null or workflow_template_id is null or (public.current_ticket_type_version(workflow_template_id)).id is null or not is_system)
  ) or (select count(*) from public.ticket_types where key in ('standard', 'financial', 'maintenance')) <> 3 then
    raise exception 'Postflight failed: a default ticket type has no valid workflow';
  end if;
end;
$post$;

notify pgrst, 'reload schema';

commit;
