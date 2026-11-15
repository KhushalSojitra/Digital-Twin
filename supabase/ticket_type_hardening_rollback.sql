-- OominiEye: rollback for supabase/ticket_type_hardening.sql (revision 3).
--
-- NOT APPLIED AUTOMATICALLY. Run as a single script in the SQL editor of okkgnwiqcupflocoobes, the same
-- project the migration ran on. NEVER run it on krrmktwszdijoqmigkif. Run supabase/ticket_type_hardening_preflight_readonly.sql
-- first and compare it with the live database before relying on either script.
--
-- This script contains NO INSERT, UPDATE, DELETE, TRUNCATE or DROP TABLE. It only drops functions, triggers
-- and policies and changes privileges, so no ticket, history or audit row can be changed by it. It runs in one
-- transaction: a preflight refuses to start on a doubtful snapshot, and a postflight rolls everything back
-- if privileges differ from the snapshot or if any row count changed.
--
-- RESTORED (to the state captured in public.ticket_type_migration_backup before the migration ran)
--   * Table privileges of anon / authenticated / PUBLIC on ticket_types, workflow_templates, workflow_versions.
--   * EXECUTE privileges of PUBLIC / anon / authenticated / service_role on the legacy functions:
--     apply_workflow_action, apply_ticket_type_workflow, create_ticket_type, update_ticket_type,
--     delete_ticket_type, save_workflow_template (every overload recorded in the snapshot).
--
-- REMOVED (objects the migration added; none of them holds data)
--   * Triggers: zz_guard_ticket_protected_fields (tickets), protect_system_ticket_types (ticket_types),
--     guard_workflow_templates, guard_workflow_versions.
--   * Functions: the four trigger functions, create/update/delete_ticket_type_secure, apply_ticket_type_secure,
--     change_ticket_type_secure, apply_workflow_action_secure, get_ticket_type_changes_secure,
--     ticket_type_hardening_status, reconcile_ticket_state, workflow_state_group, workflow_has_state,
--     current_ticket_type_version, assert_ticket_type_actor, is_browser_role.
--   * Any RLS policy on ticket_type_changes and ticket_type_migration_backup (policies are not data).
--
-- INTENTIONALLY RETAINED (never deleted or rewritten, and the reason)
--   * public.tickets.ticket_type_key and every value in it   - ticket data; the app reads it when present.
--   * public.ticket_type_changes (+ its index)                - audit trail. It stays LOCKED: RLS on, no
--     browser privileges, SELECT for service_role only. Rollback re-asserts this.
--   * public.ticket_type_migration_backup                     - the snapshot; kept so this script can be re-run
--     and the restore can be re-checked. Also kept locked.
--   * tickets, ticket_state_history, ticket_assignment_history, history_log: untouched. Ticket states and
--     history entries written by change_ticket_type_secure stay; ticket_type_changes records the previous type
--     and state of every change.
--   * Seeded default ticket types, templates and versions (standard, financial, maintenance) and any template
--     or version the seed step created or repaired. The migration stores no row snapshot of them, so what the
--     seed inserted or updated cannot be told apart from what existed, and deleting them could orphan tickets.
--     They are kept as they are.
--   * Column-level and other privileges the migration never touched (tickets, ticket_state_history, ...).
--
-- NOT COVERED
--   * It does not undo supabase/ticket_workflow.sql.
--   * It cannot revert seed UPDATEs to ticket_types (see above). Doing that needs a row snapshot taken by the
--     migration before its seed step.
--   * After the rollback browsers can again execute the legacy functions and write ticket types, workflow
--     templates/versions and the protected ticket columns directly (as before the migration).
--
-- Snapshot safety: the script refuses to run if the snapshot is incomplete, comes from more than one capture,
-- or looks like it was taken AFTER the migration (browsers already without write access and without EXECUTE),
-- because restoring that would leave the database locked down. If you have verified that this really is the
-- original state, change 'off' to 'on' in the next set_config line.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local search_path = public, pg_temp;
select set_config('oomnieye.rollback_accept_snapshot', 'off', true);

-- 0. Preflight: snapshot validity and row counts to compare against at the end ---------------------------
do $pre$
declare
  v_name text;
  v_n bigint;
  v_captures int;
  v_tables int;
  v_functions int;
  v_open_tables int;
  v_open_functions int;
begin
  foreach v_name in array array['tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history',
                                'ticket_assignment_history', 'ticket_type_changes', 'ticket_type_migration_backup'] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'public.% is missing: the migration was not applied here, or this is the wrong database. Nothing was changed.', v_name;
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tickets' and column_name = 'ticket_type_key') then
    raise exception 'public.tickets.ticket_type_key is missing: the migration was not applied here. Nothing was changed.';
  end if;

  select count(distinct captured_at),
         count(distinct object_name) filter (where object_type = 'table'
           and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions')),
         count(*) filter (where object_type = 'function' and grantee = '*')
  into v_captures, v_tables, v_functions
  from public.ticket_type_migration_backup
  where migration = 'ticket_type_hardening_v2';

  if v_tables < 3 or v_functions = 0 then
    raise exception 'The migration snapshot is missing or incomplete (tables %, functions %), so privileges cannot be restored safely. Nothing was changed.', v_tables, v_functions;
  end if;
  if v_captures <> 1 then
    raise exception 'The migration snapshot comes from % separate captures; it is not trustworthy. Nothing was changed.', v_captures;
  end if;

  select count(*) filter (where object_type = 'table' and grantee in ('anon', 'authenticated')
           and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions')
           and privileges && array['INSERT', 'UPDATE', 'DELETE']),
         count(*) filter (where object_type = 'function' and grantee in ('public', 'anon', 'authenticated')
           and 'EXECUTE' = any (privileges))
  into v_open_tables, v_open_functions
  from public.ticket_type_migration_backup
  where migration = 'ticket_type_hardening_v2';

  if v_open_tables = 0 and v_open_functions = 0
     and coalesce(current_setting('oomnieye.rollback_accept_snapshot', true), 'off') <> 'on' then
    raise exception 'The snapshot shows browsers with no write access and no EXECUTE on the legacy functions. That looks like the state AFTER the migration, so restoring it would not undo anything. Nothing was changed. If you have verified it is the original state, set oomnieye.rollback_accept_snapshot to on.';
  end if;

  foreach v_name in array array['tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history',
                                'ticket_assignment_history', 'ticket_type_changes', 'ticket_type_migration_backup'] loop
    execute format('select count(*) from public.%I', v_name) into v_n;
    perform set_config('oomnieye.rb_count_' || v_name, v_n::text, true);
  end loop;
  execute 'select count(*) from public.tickets where ticket_type_key is not null' into v_n;
  perform set_config('oomnieye.rb_count_typed_tickets', v_n::text, true);
end;
$pre$;

-- 1. REMOVED: protection triggers and their functions -----------------------------------------------------
drop trigger if exists zz_guard_ticket_protected_fields on public.tickets;
drop trigger if exists protect_system_ticket_types on public.ticket_types;
drop trigger if exists guard_workflow_templates on public.workflow_templates;
drop trigger if exists guard_workflow_versions on public.workflow_versions;

drop function if exists public.guard_ticket_protected_fields();
drop function if exists public.protect_system_ticket_types();
drop function if exists public.guard_workflow_templates();
drop function if exists public.guard_workflow_versions();

-- 2. RESTORED: table and function privileges captured before the migration --------------------------------
do $restore$
declare
  r record;
  g record;
begin
  for r in
    select distinct object_name from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v2' and object_type = 'table'
      and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions')
      and to_regclass('public.' || object_name) is not null
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', r.object_name);
    for g in
      select grantee, privileges from public.ticket_type_migration_backup
      where migration = 'ticket_type_hardening_v2' and object_type = 'table' and object_name = r.object_name
        and grantee in ('public', 'anon', 'authenticated') and cardinality(privileges) > 0
    loop
      execute format('grant %s on table public.%I to %s', array_to_string(g.privileges, ', '), r.object_name,
                     case g.grantee when 'public' then 'public' else quote_ident(g.grantee) end);
    end loop;
  end loop;

  for r in
    select distinct object_name from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v2' and object_type = 'function'
      and to_regprocedure('public.' || object_name) is not null
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', r.object_name);
    for g in
      select grantee, privileges from public.ticket_type_migration_backup
      where migration = 'ticket_type_hardening_v2' and object_type = 'function' and object_name = r.object_name
        and grantee in ('public', 'anon', 'authenticated', 'service_role') and cardinality(privileges) > 0
    loop
      execute format('grant execute on function public.%s to %s', r.object_name,
                     case g.grantee when 'public' then 'public' else quote_ident(g.grantee) end);
    end loop;
  end loop;
end;
$restore$;

-- 3. REMOVED: functions added by the migration -------------------------------------------------------------
drop function if exists public.create_ticket_type_secure(text, text, jsonb, text, text);
drop function if exists public.update_ticket_type_secure(text, text, text, jsonb, text, text);
drop function if exists public.delete_ticket_type_secure(text, text, text);
drop function if exists public.apply_ticket_type_secure(text, text, text, text);
drop function if exists public.change_ticket_type_secure(text, text, text, text, text);
drop function if exists public.apply_workflow_action_secure(text, text, text, text, text, text);
drop function if exists public.get_ticket_type_changes_secure(text, text, text);
drop function if exists public.ticket_type_hardening_status();
drop function if exists public.reconcile_ticket_state(text, jsonb, jsonb);
drop function if exists public.workflow_state_group(jsonb, text);
drop function if exists public.workflow_has_state(jsonb, text);
drop function if exists public.current_ticket_type_version(text);
drop function if exists public.assert_ticket_type_actor(text, text, text[]);
drop function if exists public.is_browser_role();

-- 4. RETAINED and kept locked: the audit trail and the snapshot never become browser-readable -------------
do $lock$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('ticket_type_changes', 'ticket_type_migration_backup')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$lock$;

alter table public.ticket_type_changes enable row level security;
alter table public.ticket_type_migration_backup enable row level security;
revoke all on public.ticket_type_changes from public, anon, authenticated;
revoke all on public.ticket_type_migration_backup from public, anon, authenticated;
grant select on public.ticket_type_changes to service_role;
grant select on public.ticket_type_migration_backup to service_role;

-- 5. Postflight: anything unexpected rolls the whole script back -------------------------------------------
do $post$
declare
  r record;
  v_role text;
  v_priv text;
  v_name text;
  v_expected boolean;
  v_n bigint;
begin
  -- legacy function privileges match the snapshot
  for r in
    select distinct object_name from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v2' and object_type = 'function'
      and to_regprocedure('public.' || object_name) is not null
  loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      select exists (
        select 1 from public.ticket_type_migration_backup b
        where b.migration = 'ticket_type_hardening_v2' and b.object_type = 'function' and b.object_name = r.object_name
          and b.grantee in ('public', v_role) and cardinality(b.privileges) > 0
      ) into v_expected;
      if has_function_privilege(v_role::name, to_regprocedure('public.' || r.object_name)::oid, 'execute') <> v_expected then
        raise exception 'Rollback postflight failed: % on % does not match the snapshot', v_role, r.object_name;
      end if;
    end loop;
  end loop;

  -- table privileges match the snapshot, privilege by privilege
  for r in
    select distinct object_name from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v2' and object_type = 'table'
      and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions')
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        select exists (
          select 1 from public.ticket_type_migration_backup b
          where b.migration = 'ticket_type_hardening_v2' and b.object_type = 'table' and b.object_name = r.object_name
            and b.grantee in ('public', v_role) and v_priv = any (b.privileges)
        ) into v_expected;
        if has_table_privilege(v_role::name, to_regclass('public.' || r.object_name)::oid, v_priv) <> v_expected then
          raise exception 'Rollback postflight failed: % % on % does not match the snapshot', v_role, v_priv, r.object_name;
        end if;
      end loop;
    end loop;
  end loop;

  -- removed objects are gone
  if exists (select 1 from pg_trigger where not tgisinternal and tgname in (
      'zz_guard_ticket_protected_fields', 'protect_system_ticket_types', 'guard_workflow_templates', 'guard_workflow_versions')) then
    raise exception 'Rollback postflight failed: a protection trigger is still present';
  end if;
  foreach v_name in array array[
    'public.guard_ticket_protected_fields()', 'public.protect_system_ticket_types()',
    'public.guard_workflow_templates()', 'public.guard_workflow_versions()',
    'public.create_ticket_type_secure(text,text,jsonb,text,text)', 'public.update_ticket_type_secure(text,text,text,jsonb,text,text)',
    'public.delete_ticket_type_secure(text,text,text)', 'public.apply_ticket_type_secure(text,text,text,text)',
    'public.change_ticket_type_secure(text,text,text,text,text)', 'public.apply_workflow_action_secure(text,text,text,text,text,text)',
    'public.get_ticket_type_changes_secure(text,text,text)', 'public.ticket_type_hardening_status()',
    'public.reconcile_ticket_state(text,jsonb,jsonb)', 'public.workflow_state_group(jsonb,text)',
    'public.workflow_has_state(jsonb,text)', 'public.current_ticket_type_version(text)',
    'public.assert_ticket_type_actor(text,text,text[])', 'public.is_browser_role()'
  ] loop
    if to_regprocedure(v_name) is not null then
      raise exception 'Rollback postflight failed: % still exists', v_name;
    end if;
  end loop;

  -- retained objects are still there and still locked
  if to_regclass('public.ticket_type_changes_ticket_idx') is null then
    raise exception 'Rollback postflight failed: the ticket_type_changes index is missing';
  end if;
  foreach v_name in array array['ticket_type_changes', 'ticket_type_migration_backup'] loop
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || v_name)) then
      raise exception 'Rollback postflight failed: RLS is not enabled on %', v_name;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_name) then
      raise exception 'Rollback postflight failed: a policy is still present on %', v_name;
    end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role::name, to_regclass('public.' || v_name)::oid,
                             'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Rollback postflight failed: % can still access %', v_role, v_name;
      end if;
    end loop;
  end loop;

  -- no data changed
  foreach v_name in array array['tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history',
                                'ticket_assignment_history', 'ticket_type_changes', 'ticket_type_migration_backup'] loop
    execute format('select count(*) from public.%I', v_name) into v_n;
    if v_n::text <> current_setting('oomnieye.rb_count_' || v_name) then
      raise exception 'Rollback postflight failed: the row count of % changed (% before, % after)',
        v_name, current_setting('oomnieye.rb_count_' || v_name), v_n;
    end if;
  end loop;
  execute 'select count(*) from public.tickets where ticket_type_key is not null' into v_n;
  if v_n::text <> current_setting('oomnieye.rb_count_typed_tickets') then
    raise exception 'Rollback postflight failed: the number of tickets with a ticket_type_key changed';
  end if;
end;
$post$;

notify pgrst, 'reload schema';

commit;

-- Result of a successful rollback: the retained data, for the record.
select 'rollback complete' as result,
       (select count(*) from public.tickets) as tickets,
       (select count(*) from public.tickets where ticket_type_key is not null) as tickets_with_ticket_type_key,
       (select count(*) from public.ticket_type_changes) as ticket_type_changes_kept,
       (select count(*) from public.ticket_types where is_system) as system_ticket_types_kept,
       (select count(*) from public.ticket_type_migration_backup) as snapshot_rows_kept;
