-- OominiEye: rollback for supabase/ticket_type_hardening.sql (revision 2).
--
-- NOT APPLIED AUTOMATICALLY. Run as a single script in the SQL editor of okkgnwiqcupflocoobes, the same
-- project the migration ran on. NEVER run it on krrmktwszdijoqmigkif.
--
-- It restores the privileges captured in public.ticket_type_migration_backup before the migration ran,
-- removes the protection triggers and every function the migration added, and re-opens nothing that the
-- snapshot did not have open. The whole script is one transaction with a postflight check.
--
-- Data is KEPT by default: tickets.ticket_type_key, public.ticket_type_changes and the seeded default
-- ticket types stay, so the audit trail and any type changed after the migration are not lost, and the
-- app (which reads ticket_type_key when present) keeps working. Ticket states changed by the migration's
-- functions are not reverted; ticket_type_changes records the previous type and state of each change.
--
-- WARNING: after the rollback the legacy functions are executable by browsers again (as before the
-- migration), so the database is no longer protected against direct browser writes.
--
-- Full removal (drops ticket_type_key, ticket_type_changes and the backup table; irreversible):
-- change 'off' to 'on' in the next statement before running.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local search_path = public, pg_temp;
select set_config('oomnieye.rollback_drop_data', 'off', true);

do $pre$
begin
  if to_regclass('public.ticket_type_migration_backup') is null
     or not exists (select 1 from public.ticket_type_migration_backup where migration = 'ticket_type_hardening_v2') then
    raise exception 'No migration snapshot found, so privileges cannot be restored safely. Nothing was changed.';
  end if;
end;
$pre$;

-- 1. Protection triggers and their functions
drop trigger if exists zz_guard_ticket_protected_fields on public.tickets;
drop trigger if exists protect_system_ticket_types on public.ticket_types;
drop trigger if exists guard_workflow_templates on public.workflow_templates;
drop trigger if exists guard_workflow_versions on public.workflow_versions;

drop function if exists public.guard_ticket_protected_fields();
drop function if exists public.protect_system_ticket_types();
drop function if exists public.guard_workflow_templates();
drop function if exists public.guard_workflow_versions();

-- 2. Restore the table and function privileges captured before the migration
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
      execute format('grant %s on table public.%I to %s', array_to_string(g.privileges, ', '), r.object_name, case g.grantee when 'public' then 'public' else quote_ident(g.grantee) end);
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
      execute format('grant execute on function public.%s to %s', r.object_name, case g.grantee when 'public' then 'public' else quote_ident(g.grantee) end);
    end loop;
  end loop;
end;
$restore$;

-- 3. Functions added by the migration
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

-- 4. Optional full removal
do $data$
begin
  if coalesce(current_setting('oomnieye.rollback_drop_data', true), 'off') = 'on' then
    drop table if exists public.ticket_type_changes;
    alter table public.tickets drop column if exists ticket_type_key;
  end if;
end;
$data$;

-- 5. Postflight: privileges match the snapshot, otherwise everything is rolled back
do $post$
declare
  r record;
  v_role text;
  v_expected boolean;
begin
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
      if has_function_privilege(v_role, 'public.' || r.object_name, 'execute') <> v_expected then
        raise exception 'Rollback postflight failed: % on % does not match the snapshot', v_role, r.object_name;
      end if;
    end loop;
  end loop;

  if exists (select 1 from pg_trigger where not tgisinternal and tgname in (
      'zz_guard_ticket_protected_fields', 'protect_system_ticket_types', 'guard_workflow_templates', 'guard_workflow_versions')) then
    raise exception 'Rollback postflight failed: a protection trigger is still present';
  end if;
end;
$post$;

do $cleanup$
begin
  if coalesce(current_setting('oomnieye.rollback_drop_data', true), 'off') = 'on' then
    drop table if exists public.ticket_type_migration_backup;
  end if;
end;
$cleanup$;

notify pgrst, 'reload schema';

commit;
