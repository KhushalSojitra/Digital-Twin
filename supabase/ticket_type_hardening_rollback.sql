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
--   * Column-level INSERT / UPDATE privileges of anon / authenticated on the columns of those three tables,
--     exactly as recorded ('column' rows) before the migration revoked them. Only INSERT and UPDATE are ever
--     granted back, only to anon / authenticated, only on columns that still exist. Any other direct column
--     INSERT/UPDATE grant to those roles on the three tables is revoked first, so the result equals the snapshot.
--   * EXECUTE privileges of PUBLIC / anon / authenticated / service_role on the legacy functions:
--     apply_workflow_action, apply_ticket_type_workflow, create_ticket_type, update_ticket_type,
--     delete_ticket_type, save_workflow_template, change_ticket_state, activate_workflow_template and
--     delete_workflow_template (every overload recorded in the snapshot).
--     The snapshot is taken after supabase/ticket_workflow.sql, so the four ticket-type functions that script
--     creates are restored to service-role-only, exactly as that script left them.
--
-- REMOVED (objects the migration added; none of them holds data)
--   * Triggers: zz_guard_ticket_protected_fields (tickets), protect_system_ticket_types (ticket_types),
--     guard_workflow_templates, guard_workflow_versions.
--   * Functions: the four trigger functions, create/update/delete_ticket_type_secure, apply_ticket_type_secure,
--     change_ticket_type_secure, apply_workflow_action_secure, get_ticket_type_changes_secure, delete_ticket_secure,
--     ticket_type_hardening_status, reconcile_ticket_state, workflow_state_group, workflow_has_state,
--     current_ticket_type_version, assert_ticket_type_actor, is_browser_role.
--   * RLS policies on ticket_type_changes and ticket_type_migration_backup; history-table policies are dropped
--     and intentionally not restored (policies are not data).
--
-- INTENTIONALLY RETAINED (never deleted or rewritten, and the reason)
--   * public.tickets.ticket_type_key and every value in it   - ticket data; the app reads it when present.
--   * public.ticket_type_changes (+ its index)                - audit trail. It stays LOCKED: RLS on, no
--     browser privileges, SELECT for service_role only. Rollback re-asserts this.
--   * public.ticket_deletion_audit                             - minimal permanent-deletion audit; retained and locked.
--   * public.ticket_state_history and ticket_assignment_history - intentionally remain locked after rollback; the old
--     browser policies and grants are NOT restored because they allowed history tampering.
--   * public.ticket_type_migration_backup                     - the snapshot; kept so this script can be re-run
--     and the restore can be re-checked. Also kept locked.
--   * Legacy tickets that the migration initialised (workflow_version_id, workflow_state and ticket_type_key
--     set where all were empty, step 6b). They are NOT reset: they stay on their workflow, and their
--     ticket_type_changes audit row (changed_by 'migration') records the original type and that they had no state.
--   * tickets, history_log and history rows are not rewritten by rollback. Ticket states and history entries
--     written by change_ticket_type_secure stay; ticket_type_changes records the previous type
--     and state of every change.
--   * Seeded default ticket types, templates and versions (standard, financial, maintenance) and any template
--     or version the seed step created or repaired. The migration stores no row snapshot of them, so what the
--     seed inserted or updated cannot be told apart from what existed, and deleting them could orphan tickets.
--     They are kept as they are.
--   * History-table policies and grants are intentionally not restored; the history tables remain inaccessible
--     to browser roles. Other non-history table privileges not listed above are unchanged.
--
-- COLUMN GRANT SNAPSHOT REQUIREMENT
--   Column grants can only be restored if the migration captured them before it revoked them: the snapshot must
--   hold a 'column_capture' marker for each of the three tables. A snapshot created by an earlier revision of the
--   migration has no markers, and the original column grants cannot be reconstructed afterwards (the revoked state
--   looks the same as "never had any"). In that case the script refuses to run. To roll back anyway WITHOUT
--   restoring column grants (browsers stay without column-level INSERT/UPDATE, the safe direction), change 'off'
--   to 'on' in the oomnieye.rollback_skip_column_grants line below.
--
-- RESTORED / REMOVED for public.tickets browser access (migration section 6c)
--   * RESTORED: the row level security state, every policy that existed before (rebuilt from the snapshot),
--     and the table-level and column-level SELECT / INSERT / UPDATE / REFERENCES grants of anon / authenticated.
--   * REMOVED: the policy tickets_read_signed_in and the functions create_ticket_secure,
--     update_ticket_details_secure, add_ticket_comment_secure, update_ticket_followers_secure,
--     attach_ticket_snapshot_secure, delete_ticket_secure and ticket_metadata_set.
--   * RESTORED: EXECUTE on apply_workflow_action for service_role, exactly as in the snapshot.
--   * Needs the 'tickets_capture' marker in the snapshot; without it (an older revision of the migration) the
--     script stops unless oomnieye.rollback_skip_tickets_access is set to on, in which case tickets access is
--     left locked down.
--
-- NOT COVERED
--   * Column grants made by a different grantor than the role running this script are restored as granted by the
--     running role, and WITH GRANT OPTION is not recorded or restored (the table snapshot has the same limits).
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
select set_config('oomnieye.rollback_skip_column_grants', 'off', true);
select set_config('oomnieye.rollback_skip_tickets_access', 'off', true);

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
  v_column_tables int;
begin
  foreach v_name in array array['tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history',
                                'ticket_assignment_history', 'ticket_type_changes', 'ticket_type_migration_backup', 'ticket_deletion_audit'] loop
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
           and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history', 'ticket_assignment_history')),
         count(*) filter (where object_type = 'function' and grantee = '*')
  into v_captures, v_tables, v_functions
  from public.ticket_type_migration_backup
  where migration = 'ticket_type_hardening_v3';

  if v_tables < 5 or v_functions = 0 then
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
  where migration = 'ticket_type_hardening_v3';

  if v_open_tables = 0 and v_open_functions = 0
     and coalesce(current_setting('oomnieye.rollback_accept_snapshot', true), 'off') <> 'on' then
    raise exception 'The snapshot shows browsers with no write access and no EXECUTE on the legacy functions. That looks like the state AFTER the migration, so restoring it would not undo anything. Nothing was changed. If you have verified it is the original state, set oomnieye.rollback_accept_snapshot to on.';
  end if;

  select count(distinct object_name) into v_column_tables
  from public.ticket_type_migration_backup
  where migration = 'ticket_type_hardening_v3' and object_type = 'column_capture' and grantee = '*'
    and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions');
  if v_column_tables = 3 then
    perform set_config('oomnieye.rb_column_mode', 'restore', true);
  elsif coalesce(current_setting('oomnieye.rollback_skip_column_grants', true), 'off') = 'on' then
    perform set_config('oomnieye.rb_column_mode', 'skipped', true);
    raise warning 'Column-level INSERT/UPDATE grants will NOT be restored: the snapshot has no column capture (% of 3 tables).', v_column_tables;
  else
    raise exception 'The snapshot has no column-level grant capture (% of 3 tables), so the original column INSERT/UPDATE grants cannot be restored: it was created by an earlier revision of the migration, after which the columns had already been revoked. Nothing was changed. To roll back without restoring column grants, set oomnieye.rollback_skip_column_grants to on.', v_column_tables;
  end if;

  foreach v_name in array array['tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history',
                                'ticket_assignment_history', 'ticket_type_changes', 'ticket_type_migration_backup', 'ticket_deletion_audit'] loop
    execute format('select count(*) from public.%I', v_name) into v_n;
    perform set_config('oomnieye.rb_count_' || v_name, v_n::text, true);
  end loop;
  execute 'select count(*) from public.tickets where ticket_type_key is not null' into v_n;
  perform set_config('oomnieye.rb_count_typed_tickets', v_n::text, true);
end;
$pre$;

do $pre_tickets$
begin
  if exists (select 1 from public.ticket_type_migration_backup
             where migration = 'ticket_type_hardening_v3' and object_type = 'tickets_capture' and object_name = 'tickets') then
    perform set_config('oomnieye.rb_tickets_mode', 'restore', true);
  elsif coalesce(current_setting('oomnieye.rollback_skip_tickets_access', true), 'off') = 'on' then
    perform set_config('oomnieye.rb_tickets_mode', 'skipped', true);
    raise warning 'Browser access to public.tickets will NOT be restored: the snapshot has no tickets capture.';
  else
    raise exception 'The snapshot has no capture of the original public.tickets policies and grants (it was created by an earlier revision of the migration), so they cannot be restored. Nothing was changed. To roll back and leave tickets locked down, set oomnieye.rollback_skip_tickets_access to on.';
  end if;
end;
$pre_tickets$;

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
    where migration = 'ticket_type_hardening_v3' and object_type = 'table'
      and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions')
      and to_regclass('public.' || object_name) is not null
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', r.object_name);
    for g in
      select grantee, privileges from public.ticket_type_migration_backup
      where migration = 'ticket_type_hardening_v3' and object_type = 'table' and object_name = r.object_name
        and grantee in ('public', 'anon', 'authenticated') and cardinality(privileges) > 0
    loop
      execute format('grant %s on table public.%I to %s', array_to_string(g.privileges, ', '), r.object_name,
                     case g.grantee when 'public' then 'public' else quote_ident(g.grantee) end);
    end loop;
  end loop;

  for r in
    select distinct object_name from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v3' and object_type = 'function'
      and to_regprocedure('public.' || object_name) is not null
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', r.object_name);
    for g in
      select grantee, privileges from public.ticket_type_migration_backup
      where migration = 'ticket_type_hardening_v3' and object_type = 'function' and object_name = r.object_name
        and grantee in ('public', 'anon', 'authenticated', 'service_role') and cardinality(privileges) > 0
    loop
      execute format('grant execute on function public.%s to %s', r.object_name,
                     case g.grantee when 'public' then 'public' else quote_ident(g.grantee) end);
    end loop;
  end loop;
end;
$restore$;

-- 2b. RESTORED: column-level INSERT/UPDATE grants captured before the migration. Must run after the table
-- restore above, because REVOKE ... ON TABLE also removes the same grantor's column grants.
do $columns$
declare
  r record;
  v_privs text[];
  v_restored int := 0;
  v_missing int := 0;
begin
  if current_setting('oomnieye.rb_column_mode') <> 'restore' then
    raise notice 'Column-level grants: restore skipped (no capture in the snapshot, skip confirmed).';
    return;
  end if;

  for r in
    select c.relname, a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname in ('ticket_types', 'workflow_templates', 'workflow_versions')
      and a.attnum > 0 and not a.attisdropped
  loop
    execute format('revoke insert (%1$I), update (%1$I) on public.%2$I from anon, authenticated', r.attname, r.relname);
  end loop;

  for r in
    select s.tbl, s.col, s.grantee, s.privileges,
           exists (select 1 from pg_attribute a
                   where a.attrelid = to_regclass('public.' || s.tbl) and a.attname = s.col
                     and a.attnum > 0 and not a.attisdropped) as col_exists
    from (
      select split_part(b.object_name, '.', 1) as tbl,
             substr(b.object_name, length(split_part(b.object_name, '.', 1)) + 2) as col,
             b.grantee, b.privileges
      from public.ticket_type_migration_backup b
      where b.migration = 'ticket_type_hardening_v3' and b.object_type = 'column'
        and b.grantee in ('anon', 'authenticated')
    ) s
    where s.tbl in ('ticket_types', 'workflow_templates', 'workflow_versions')
  loop
    v_privs := array(select p from unnest(r.privileges) p where p in ('INSERT', 'UPDATE') order by p);
    if cardinality(v_privs) = 0 then
      continue;
    elsif not r.col_exists then
      v_missing := v_missing + 1;
      raise warning 'Column %.% no longer exists; its recorded grants for % are not restored.', r.tbl, r.col, r.grantee;
    else
      execute format('grant %s on public.%I to %I',
                     (select string_agg(format('%s (%I)', p, r.col), ', ' order by p) from unnest(v_privs) p),
                     r.tbl, r.grantee);
      v_restored := v_restored + 1;
    end if;
  end loop;
  raise notice 'Column-level grants restored: % (columns no longer present: %).', v_restored, v_missing;
end;
$columns$;

-- 2c. RESTORED: public.tickets row level security, policies, table and column grants of the browser roles.
do $tickets_restore$
declare
  r record;
  v_privs text[];
  v_rls text[];
begin
  if current_setting('oomnieye.rb_tickets_mode') <> 'restore' then
    raise notice 'public.tickets access: restore skipped (confirmed).';
    return;
  end if;

  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'tickets' loop
    execute format('drop policy %I on public.tickets', r.policyname);
  end loop;
  for r in
    select object_name, privileges as p from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v3' and object_type = 'tickets_policy'
  loop
    execute format('create policy %I on public.tickets as %s for %s to %s%s%s',
      r.object_name, lower(r.p[2]), lower(r.p[1]),
      (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(string_to_array(r.p[3], ',')) x),
      case when r.p[4] <> '' then format(' using (%s)', r.p[4]) else '' end,
      case when r.p[5] <> '' then format(' with check (%s)', r.p[5]) else '' end);
  end loop;

  select privileges into v_rls from public.ticket_type_migration_backup
  where migration = 'ticket_type_hardening_v3' and object_type = 'tickets_capture' and object_name = 'tickets';
  execute case when v_rls[1] = 'RLS_ON' then 'alter table public.tickets enable row level security'
               else 'alter table public.tickets disable row level security' end;
  execute case when v_rls[2] = 'FORCE_ON' then 'alter table public.tickets force row level security'
               else 'alter table public.tickets no force row level security' end;

  execute 'revoke all on table public.tickets from anon, authenticated';
  for r in
    select grantee, privileges from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v3' and object_type = 'table' and object_name = 'tickets'
      and grantee in ('anon', 'authenticated') and cardinality(privileges) > 0
  loop
    execute format('grant %s on table public.tickets to %I', array_to_string(r.privileges, ', '), r.grantee);
  end loop;

  for r in
    select b.object_name as col, b.grantee, b.privileges,
           exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.tickets') and a.attname = b.object_name
                   and a.attnum > 0 and not a.attisdropped) as col_exists
    from public.ticket_type_migration_backup b
    where b.migration = 'ticket_type_hardening_v3' and b.object_type = 'tickets_column' and b.grantee in ('anon', 'authenticated')
  loop
    v_privs := array(select p from unnest(r.privileges) p where p in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') order by p);
    if cardinality(v_privs) = 0 then
      continue;
    elsif not r.col_exists then
      raise warning 'Column tickets.% no longer exists; its recorded grants for % are not restored.', r.col, r.grantee;
    else
      execute format('grant %s on public.tickets to %I',
                     (select string_agg(format('%s (%I)', p, r.col), ', ' order by p) from unnest(v_privs) p), r.grantee);
    end if;
  end loop;
end;
$tickets_restore$;

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
drop function if exists public.create_ticket_secure(jsonb, text, text, text);
drop function if exists public.update_ticket_details_secure(text, text, text, text, jsonb, jsonb, text, text);
drop function if exists public.add_ticket_comment_secure(text, text, jsonb, text, text);
drop function if exists public.update_ticket_followers_secure(text, text, text[], text, text);
drop function if exists public.attach_ticket_snapshot_secure(text, text, jsonb, text, text);
drop function if exists public.delete_ticket_secure(text, text, text);
drop function if exists public.ticket_metadata_set(jsonb, text, jsonb);

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
  v_diff text;
begin
  -- direct column INSERT/UPDATE grants of browser roles equal the snapshot exactly (columns that still exist)
  if current_setting('oomnieye.rb_column_mode') = 'restore' then
    with actual as (
      select c.relname || '.' || a.attname as obj, ro.rolname::text as grantee, acl.privilege_type::text as priv
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
      cross join lateral aclexplode(a.attacl) as acl
      join pg_roles ro on ro.oid = acl.grantee
      where n.nspname = 'public' and c.relname in ('ticket_types', 'workflow_templates', 'workflow_versions')
        and a.attnum > 0 and not a.attisdropped
        and ro.rolname in ('anon', 'authenticated') and acl.privilege_type in ('INSERT', 'UPDATE')
    ),
    expected as (
      select b.object_name as obj, b.grantee, p as priv
      from public.ticket_type_migration_backup b
      cross join lateral unnest(b.privileges) as p
      where b.migration = 'ticket_type_hardening_v3' and b.object_type = 'column'
        and b.grantee in ('anon', 'authenticated') and p in ('INSERT', 'UPDATE')
        and exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || split_part(b.object_name, '.', 1))
                      and a.attname = substr(b.object_name, length(split_part(b.object_name, '.', 1)) + 2)
                      and a.attnum > 0 and not a.attisdropped)
    ),
    diff as (
      (select 'unexpected' as kind, * from (select * from actual except select * from expected) x)
      union all
      (select 'missing' as kind, * from (select * from expected except select * from actual) y)
    )
    select string_agg(kind || ' ' || obj || ' (' || grantee || ': ' || priv || ')', ', ') into v_diff from diff;
    if v_diff is not null then
      raise exception 'Rollback postflight failed: column-level grants differ from the snapshot: %', v_diff;
    end if;
  end if;

  -- legacy function privileges match the snapshot
  for r in
    select distinct object_name from public.ticket_type_migration_backup
    where migration = 'ticket_type_hardening_v3' and object_type = 'function'
      and to_regprocedure('public.' || object_name) is not null
  loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      select exists (
        select 1 from public.ticket_type_migration_backup b
        where b.migration = 'ticket_type_hardening_v3' and b.object_type = 'function' and b.object_name = r.object_name
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
    where migration = 'ticket_type_hardening_v3' and object_type = 'table'
      and object_name in ('ticket_types', 'workflow_templates', 'workflow_versions')
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        select exists (
          select 1 from public.ticket_type_migration_backup b
          where b.migration = 'ticket_type_hardening_v3' and b.object_type = 'table' and b.object_name = r.object_name
            and b.grantee in ('public', v_role) and v_priv = any (b.privileges)
        ) into v_expected;
        if has_table_privilege(v_role::name, to_regclass('public.' || r.object_name)::oid, v_priv) <> v_expected then
          raise exception 'Rollback postflight failed: % % on % does not match the snapshot', v_role, v_priv, r.object_name;
        end if;
      end loop;
    end loop;
  end loop;

  -- public.tickets: RLS, policies, table and column grants equal the snapshot
  if current_setting('oomnieye.rb_tickets_mode') = 'restore' then
    if (select relrowsecurity from pg_class where oid = 'public.tickets'::regclass)
       is distinct from ((select privileges[1] from public.ticket_type_migration_backup
                          where migration = 'ticket_type_hardening_v3' and object_type = 'tickets_capture') = 'RLS_ON') then
      raise exception 'Rollback postflight failed: RLS on public.tickets does not match the snapshot';
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tickets' and policyname = 'tickets_read_signed_in')
       and not exists (select 1 from public.ticket_type_migration_backup where migration = 'ticket_type_hardening_v3'
                       and object_type = 'tickets_policy' and object_name = 'tickets_read_signed_in') then
      raise exception 'Rollback postflight failed: the migration policy tickets_read_signed_in is still present';
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tickets')
       <> (select count(*) from public.ticket_type_migration_backup where migration = 'ticket_type_hardening_v3' and object_type = 'tickets_policy') then
      raise exception 'Rollback postflight failed: the policies on public.tickets do not match the snapshot';
    end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        select exists (
          select 1 from public.ticket_type_migration_backup b
          where b.migration = 'ticket_type_hardening_v3' and b.object_type = 'table' and b.object_name = 'tickets'
            and b.grantee in ('public', v_role) and v_priv = any (b.privileges)
        ) into v_expected;
        if has_table_privilege(v_role::name, 'public.tickets'::regclass::oid, v_priv) <> v_expected then
          raise exception 'Rollback postflight failed: % % on public.tickets does not match the snapshot', v_role, v_priv;
        end if;
      end loop;
    end loop;
    with actual as (
      select a.attname::text as obj, ro.rolname::text as grantee, acl.privilege_type::text as priv
      from pg_attribute a
      cross join lateral aclexplode(a.attacl) as acl
      join pg_roles ro on ro.oid = acl.grantee
      where a.attrelid = 'public.tickets'::regclass and a.attnum > 0 and not a.attisdropped
        and ro.rolname in ('anon', 'authenticated')
    ),
    expected as (
      select b.object_name as obj, b.grantee, p as priv
      from public.ticket_type_migration_backup b cross join lateral unnest(b.privileges) p
      where b.migration = 'ticket_type_hardening_v3' and b.object_type = 'tickets_column'
        and exists (select 1 from pg_attribute a where a.attrelid = 'public.tickets'::regclass and a.attname = b.object_name
                    and a.attnum > 0 and not a.attisdropped)
    ),
    diff as (
      (select 'unexpected' as kind, * from (select * from actual except select * from expected) x)
      union all
      (select 'missing' as kind, * from (select * from expected except select * from actual) y)
    )
    select string_agg(kind || ' ' || obj || ' (' || grantee || ': ' || priv || ')', ', ') into v_diff from diff;
    if v_diff is not null then
      raise exception 'Rollback postflight failed: column-level grants on public.tickets differ from the snapshot: %', v_diff;
    end if;
  end if;

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
    'public.assert_ticket_type_actor(text,text,text[])', 'public.is_browser_role()',
    'public.create_ticket_secure(jsonb,text,text,text)', 'public.update_ticket_details_secure(text,text,text,text,jsonb,jsonb,text,text)',
    'public.add_ticket_comment_secure(text,text,jsonb,text,text)', 'public.update_ticket_followers_secure(text,text,text[],text,text)',
    'public.attach_ticket_snapshot_secure(text,text,jsonb,text,text)', 'public.delete_ticket_secure(text,text,text)',
    'public.ticket_metadata_set(jsonb,text,jsonb)'
  ] loop
    if to_regprocedure(v_name) is not null then
      raise exception 'Rollback postflight failed: % still exists', v_name;
    end if;
  end loop;

  -- retained objects are still there and still locked
  if to_regclass('public.ticket_type_changes_ticket_idx') is null then
    raise exception 'Rollback postflight failed: the ticket_type_changes index is missing';
  end if;
  if to_regclass('public.ticket_deletion_audit_ticket_idx') is null then
    raise exception 'Rollback postflight failed: the ticket_deletion_audit ticket index is missing';
  end if;
  foreach v_name in array array['ticket_type_changes', 'ticket_type_migration_backup', 'ticket_deletion_audit'] loop
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

  -- History remains locked after rollback: do not restore the original browser write policies.
  if exists (select 1 from pg_policies where schemaname = 'public'
             and tablename in ('ticket_state_history', 'ticket_assignment_history')) then
    raise exception 'Rollback postflight failed: a browser policy was restored on a history table';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role::name, 'public.ticket_state_history', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_table_privilege(v_role::name, 'public.ticket_assignment_history', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege(v_role::name, 'public.ticket_state_history', 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_any_column_privilege(v_role::name, 'public.ticket_assignment_history', 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'Rollback postflight failed: % regained access to ticket history tables', v_role;
    end if;
  end loop;

  -- no data changed
  foreach v_name in array array['tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history',
                                'ticket_assignment_history', 'ticket_type_changes', 'ticket_type_migration_backup', 'ticket_deletion_audit'] loop
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
       (select count(*) from public.ticket_type_migration_backup) as snapshot_rows_kept,
       (select count(*) from public.ticket_deletion_audit) as deletion_audit_rows_kept;
