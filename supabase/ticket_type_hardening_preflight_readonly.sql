-- OominiEye: READ-ONLY preflight for supabase/ticket_type_hardening.sql.
--
-- Purpose: report the real shape of the live database so it can be compared with what the migration assumes.
-- It does NOT prove compatibility by itself: send the result grid back and it is compared with the migration.
--
-- Where to run: the SQL editor of the Supabase project okkgnwiqcupflocoobes ONLY. Check the project ref in
-- the editor's browser URL first (SQL cannot read it). NEVER run it on krrmktwszdijoqmigkif.
--
-- Read-only guarantee
--   * The whole file is ONE SELECT statement. It contains no INSERT, UPDATE, DELETE, TRUNCATE, DDL, GRANT,
--     REVOKE, SET or transaction control, and calls no function that writes.
--   * The only dynamic part is query_to_xml(), which runs the fixed, read-only SELECT texts written in the
--     "probes" list below, and only when the tables they read exist (so a missing table is reported, not an error).
--   * It reads the system catalogs and counts rows. It never reads ticket contents, comments or credentials.
--
-- How to read the result (one grid, sorted by section)
--   OK       the live database matches what the migration needs
--   MISSING  something the migration requires is absent  -> the migration will fail or must not be run yet
--   MISMATCH something exists with a type/signature the migration cannot work with -> do not run
--   REVIEW   needs a human decision (an unexpected trigger, a policy-less RLS table, a function the
--            migration would replace, column-level grants that the migration does not revoke, ...)
--   MANUAL   cannot be checked from SQL
--   INFO     facts for the comparison (counts, grants, definitions)
-- The first rows (section 00 summary) count the blocking findings.
--
-- What to send back: the whole grid (copy as CSV or JSON). Do not paste any keys or passwords; none are read.

with
grantees(rolname) as (
  select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
),

watched(name) as (
  values ('tickets'), ('ticket_types'), ('workflow_templates'), ('workflow_versions'),
         ('ticket_state_history'), ('ticket_assignment_history'), ('ticket_type_changes'), ('ticket_deletion_audit')
),

-- 01 context ----------------------------------------------------------------------------------------------
context_rows(section, item, expected, actual, status) as (
  select '01 context', 'database', null::text, current_database()::text, 'INFO'
  union all
  select '01 context', 'server_version', null, current_setting('server_version'), 'INFO'
  union all
  select '01 context', 'current_user', null, current_user::text, 'INFO'
  union all
  select '01 context', 'project ref', 'okkgnwiqcupflocoobes',
         'not readable from SQL: confirm it in the dashboard URL of this SQL editor', 'MANUAL'
),

role_rows(section, item, expected, actual, status) as (
  select '01 context', 'role ' || r.name, 'exists',
         case when exists (select 1 from pg_roles where rolname = r.name) then 'exists' else 'missing' end,
         case when exists (select 1 from pg_roles where rolname = r.name) then 'OK' else 'MISSING' end
  from (values ('anon'), ('authenticated'), ('service_role')) r(name)
),

-- 02 tables -----------------------------------------------------------------------------------------------
tables_expected(name, required) as (
  values ('tickets', true), ('ticket_types', true), ('workflow_templates', true), ('workflow_versions', true),
         ('ticket_state_history', true), ('ticket_assignment_history', true),
         ('ticket_type_changes', false), ('ticket_type_migration_backup', false), ('ticket_deletion_audit', false)
),

table_rows(section, item, expected, actual, status) as (
  select '02 tables', 'public.' || e.name,
         case when e.required then 'must exist' else 'created by the migration (absent before it)' end,
         case when c.oid is null then 'absent' else 'present (relkind ' || c.relkind::text || ')' end,
         case
           when e.required then case when c.relkind in ('r', 'p') then 'OK' else 'MISSING' end
           else case when c.oid is null then 'OK' else 'INFO' end
         end
  from tables_expected e
  left join pg_class c on c.oid = to_regclass('public.' || e.name)
),

-- 03 columns ----------------------------------------------------------------------------------------------
-- types are udt_name values; '*' accepts any type
cols_expected(tbl, col, types, required) as (
  values
    ('tickets', 'id', array['*'], true),
    ('tickets', 'workflow_version_id', array['uuid', 'text', 'varchar'], true),
    ('tickets', 'workflow_state', array['text', 'varchar'], true),
    ('tickets', 'status', array['text', 'varchar'], true),
    ('tickets', 'assignee', array['text', 'varchar'], true),
    ('tickets', 'history_log', array['jsonb'], true),
    ('tickets', 'completed_at', array['timestamptz'], true),
    ('tickets', 'reporter', array['*'], true),
    ('tickets', 'created_at', array['timestamptz'], false),
    ('tickets', 'ptz_coordinates', array['jsonb'], false),
    ('tickets', 'type', array['*'], false),
    ('tickets', 'ticket_type_key', array['text'], false),
    ('ticket_types', 'key', array['text', 'varchar'], true),
    ('ticket_types', 'label', array['text', 'varchar'], true),
    ('ticket_types', 'description', array['text', 'varchar'], true),
    ('ticket_types', 'is_system', array['bool'], true),
    ('ticket_types', 'workflow_template_id', array['text', 'varchar'], true),
    ('ticket_types', 'config', array['jsonb'], true),
    ('ticket_types', 'is_active', array['bool'], true),
    ('workflow_templates', 'id', array['uuid'], true),
    ('workflow_templates', 'name', array['text', 'varchar'], true),
    ('workflow_templates', 'description', array['text', 'varchar'], true),
    ('workflow_templates', 'is_system', array['bool'], true),
    ('workflow_templates', 'created_at', array['timestamptz'], true),
    ('workflow_versions', 'id', array['*'], true),
    ('workflow_versions', 'template_id', array['*'], true),
    ('workflow_versions', 'version', array['int2', 'int4', 'int8', 'numeric'], true),
    ('workflow_versions', 'definition', array['jsonb'], true),
    ('workflow_versions', 'is_active', array['bool'], true),
    ('ticket_state_history', 'ticket_id', array['*'], true),
    ('ticket_state_history', 'from_state', array['text', 'varchar'], true),
    ('ticket_state_history', 'to_state', array['text', 'varchar'], true),
    ('ticket_state_history', 'changed_by', array['text', 'varchar'], true),
    ('ticket_state_history', 'changed_at', array['timestamptz'], true),
    ('ticket_state_history', 'action_label', array['text', 'varchar'], true),
    ('ticket_state_history', 'note', array['text', 'varchar'], true),
    ('ticket_state_history', 'workflow_version_id', array['*'], true),
    ('ticket_assignment_history', 'ticket_id', array['*'], true),
    ('ticket_assignment_history', 'from_assignee', array['text', 'varchar'], true),
    ('ticket_assignment_history', 'to_assignee', array['text', 'varchar'], true),
    ('ticket_assignment_history', 'changed_by', array['text', 'varchar'], true),
    ('ticket_assignment_history', 'changed_at', array['timestamptz'], true),
    ('ticket_assignment_history', 'action_label', array['text', 'varchar'], true),
    ('ticket_assignment_history', 'note', array['text', 'varchar'], true)
),

col_rows(section, item, expected, actual, status) as (
  select '03 columns', e.tbl || '.' || e.col,
         case when e.required then 'required: ' else 'optional: ' end || array_to_string(e.types, '|'),
         coalesce(c.udt_name::text, 'absent'),
         case
           when c.udt_name is null then case when e.required then 'MISSING' else 'INFO' end
           when '*' = any (e.types) or c.udt_name::text = any (e.types) then 'OK'
           else 'MISMATCH'
         end
  from cols_expected e
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = e.tbl and c.column_name = e.col
),

-- values the migration assigns across tables must fit the target column type
type_pairs(t_tbl, t_col, s_tbl, s_col) as (
  values ('tickets', 'workflow_version_id', 'workflow_versions', 'id'),
         ('ticket_state_history', 'workflow_version_id', 'workflow_versions', 'id'),
         ('ticket_state_history', 'ticket_id', 'tickets', 'id')
),

type_rows(section, item, expected, actual, status) as (
  select '03 columns', 'type fit: ' || p.t_tbl || '.' || p.t_col || ' <- ' || p.s_tbl || '.' || p.s_col,
         'target can hold the source value',
         coalesce(t.udt_name::text, 'absent') || ' <- ' || coalesce(s.udt_name::text, 'absent'),
         case
           when t.udt_name is null or s.udt_name is null then 'MISSING'
           when t.udt_name = s.udt_name or t.udt_name::text in ('text', 'varchar') then 'OK'
           else 'MISMATCH'
         end
  from type_pairs p
  left join information_schema.columns t
    on t.table_schema = 'public' and t.table_name = p.t_tbl and t.column_name = p.t_col
  left join information_schema.columns s
    on s.table_schema = 'public' and s.table_name = p.s_tbl and s.column_name = p.s_col
),

-- 04 functions --------------------------------------------------------------------------------------------
fn_expected(sig, ret) as (
  values
    ('apply_workflow_action(text,text,text,text,text)', 'tickets'),
    ('apply_ticket_type_workflow(text)', null),
    ('create_ticket_type(text,text,jsonb)', 'ticket_types'),
    ('update_ticket_type(text,text,text,jsonb)', 'ticket_types'),
    ('delete_ticket_type(text)', 'void'),
    ('build_ticket_type_definition(jsonb)', null),
    ('workflow_group_status(text)', null)
),

fn_rows(section, item, expected, actual, status) as (
  select '04 functions', 'public.' || e.sig,
         'exists' || coalesce('; returns ' || e.ret, ''),
         case when p.oid is null then 'absent'
              else 'returns ' || regexp_replace(pg_get_function_result(p.oid), '^public\.', '')
                   || '; security ' || case when p.prosecdef then 'definer' else 'invoker' end
                   || '; owner ' || pg_get_userbyid(p.proowner)::text
                   || '; execute: ' || coalesce((
                        select string_agg(g.rolname || '=' || has_function_privilege(g.rolname::name, p.oid, 'execute')::text, ', ' order by g.rolname)
                        from grantees g), 'n/a')
         end,
         case
           when p.oid is null then 'MISSING'
           when e.ret is not null and regexp_replace(pg_get_function_result(p.oid), '^public\.', '') <> e.ret then 'MISMATCH'
           else 'OK'
         end
  from fn_expected e
  left join pg_proc p on p.oid = to_regprocedure('public.' || e.sig)::oid
),

-- every overload of the functions whose browser access the migration revokes
fn_overload_rows(section, item, expected, actual, status) as (
  select '04 functions',
         'overload: public.' || p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'browser EXECUTE is revoked by the migration',
         'returns ' || regexp_replace(pg_get_function_result(p.oid), '^public\.', '')
           || '; security ' || case when p.prosecdef then 'definer' else 'invoker' end
           || '; owner ' || pg_get_userbyid(p.proowner)::text
           || '; execute: ' || coalesce((
                select string_agg(g.rolname || '=' || has_function_privilege(g.rolname::name, p.oid, 'execute')::text, ', ' order by g.rolname)
                from grantees g), 'n/a'),
         'INFO'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('apply_workflow_action', 'apply_ticket_type_workflow', 'create_ticket_type',
                      'update_ticket_type', 'delete_ticket_type', 'save_workflow_template', 'activate_workflow_template', 'delete_workflow_template')
),

fn_save_rows(section, item, expected, actual, status) as (
  select '04 functions', 'public.save_workflow_template (any signature)', 'at least one overload',
         count(*)::text || ' overload(s)',
         case when count(*) > 0 then 'OK' else 'MISSING' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_workflow_template'
),

-- the migration uses CREATE OR REPLACE on these names; any that already exist would be overwritten
fn_migration_rows(section, item, expected, actual, status) as (
  select '04 functions', 'names the migration creates or replaces that ALREADY exist',
         'none (they are created by the migration)',
         coalesce(string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by p.proname), 'none'),
         case when count(*) = 0 then 'OK' else 'REVIEW' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_ticket_type_secure', 'update_ticket_type_secure', 'delete_ticket_type_secure',
                      'apply_ticket_type_secure', 'change_ticket_type_secure', 'apply_workflow_action_secure',
                      'get_ticket_type_changes_secure', 'ticket_type_hardening_status', 'reconcile_ticket_state',
                      'workflow_state_group', 'workflow_has_state', 'current_ticket_type_version',
                      'assert_ticket_type_actor', 'is_browser_role', 'guard_ticket_protected_fields',
                      'protect_system_ticket_types', 'guard_workflow_templates', 'guard_workflow_versions')
),

-- 05 triggers ---------------------------------------------------------------------------------------------
trigger_rows(section, item, expected, actual, status) as (
  select '05 triggers', c.relname::text || '.' || t.tgname::text,
         'compare with the four migration triggers',
         pg_get_triggerdef(t.oid) || '; enabled=' || t.tgenabled::text,
         case when t.tgname::text in ('zz_guard_ticket_protected_fields', 'protect_system_ticket_types',
                                      'guard_workflow_templates', 'guard_workflow_versions')
              then 'INFO' else 'REVIEW' end
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join watched w on w.name = c.relname::text
  where n.nspname = 'public' and not t.tgisinternal
),

-- 06 rls and policies -------------------------------------------------------------------------------------
rls_rows(section, item, expected, actual, status) as (
  select '06 rls and policies', c.relname::text, 'RLS state',
         'rls=' || c.relrowsecurity::text || '; force=' || c.relforcerowsecurity::text
           || '; policies=' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::text,
         case when c.relrowsecurity
                   and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
              then 'REVIEW' else 'INFO' end
  from watched w
  join pg_class c on c.oid = to_regclass('public.' || w.name)
),

policy_rows(section, item, expected, actual, status) as (
  select '06 rls and policies', p.tablename::text || '.' || p.policyname::text, 'policy',
         'cmd=' || p.cmd || '; roles=' || p.roles::text || '; using=' || coalesce(p.qual, '(none)')
           || '; check=' || coalesce(p.with_check, '(none)'),
         'INFO'
  from pg_policies p join watched w on w.name = p.tablename::text
  where p.schemaname = 'public'
),

-- 07 privileges -------------------------------------------------------------------------------------------
priv_rows(section, item, expected, actual, status) as (
  select '07 privileges', 'table ' || c.relname::text,
         'the migration revokes INSERT/UPDATE/DELETE/TRUNCATE from browsers on ticket_types, workflow_templates, workflow_versions',
         coalesce((
           select string_agg(
                    g.rolname || '=' || coalesce((
                      select string_agg(pv, ',' order by pv)
                      from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) pv
                      where has_table_privilege(g.rolname::name, c.oid, pv)), 'none'),
                    '; ' order by g.rolname)
           from grantees g), 'n/a'),
         'INFO'
  from watched w
  join pg_class c on c.oid = to_regclass('public.' || w.name)
),

-- table-level REVOKE does not remove column-level grants
colpriv_rows(section, item, expected, actual, status) as (
  select '07 privileges', 'column-level grants on ' || c.relname::text,
         'the migration explicitly revokes browser column grants and snapshots history grants',
         (select count(*) from pg_attribute a
           where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null)::text || ' column(s) with their own grants',
         case when exists (select 1 from pg_attribute a
                           where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null)
              then 'INFO' else 'OK' end
  from watched w
  join pg_class c on c.oid = to_regclass('public.' || w.name)
),

-- 08 other functions that write public.tickets (they would hit the new guard trigger when run as a browser role)
writer_rows(section, item, expected, actual, status) as (
  select '08 other ticket writers',
         'public.' || p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'review: any browser-executable function that writes protected ticket columns; SECURITY DEFINER functions bypass the table guard',
         'security ' || case when p.prosecdef then 'definer' else 'invoker' end
           || '; anon execute=' || has_function_privilege('anon'::name, p.oid, 'execute')::text
           || '; authenticated execute=' || has_function_privilege('authenticated'::name, p.oid, 'execute')::text
           || '; mentions protected columns='
           || (p.prosrc ~* '(workflow_state|workflow_version_id|completed_at|ticket_type_key|status)')::text,
         case when (has_function_privilege('anon'::name, p.oid, 'execute') or has_function_privilege('authenticated'::name, p.oid, 'execute'))
                   and p.prosrc ~* '(workflow_state|workflow_version_id|completed_at|ticket_type_key|status)'
              then 'REVIEW' else 'INFO' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.prosrc ~* '(update[[:space:]]+(only[[:space:]]+)?(public\.)?tickets\y|insert[[:space:]]+into[[:space:]]+(public\.)?tickets\y)'
    and p.proname not in ('create_ticket_type_secure', 'update_ticket_type_secure', 'delete_ticket_type_secure',
                          'apply_ticket_type_secure', 'change_ticket_type_secure', 'apply_workflow_action_secure',
                          'get_ticket_type_changes_secure', 'ticket_type_hardening_status', 'reconcile_ticket_state',
                          'guard_ticket_protected_fields')
),

-- 09 data profile: fixed read-only SELECTs, each run only when its tables exist ----------------------------
probes(item, expected, guard, qtext) as (
  values
    ('tickets: rows', null::text,
      to_regclass('public.tickets') is not null,
      $q$select count(*) from public.tickets$q$),
    ('tickets: without workflow_version_id', 'informational',
      to_regclass('public.tickets') is not null,
      $q$select count(*) from public.tickets t where (to_jsonb(t) ->> 'workflow_version_id') is null$q$),
    ('tickets: rows per workflow_state', 'informational',
      to_regclass('public.tickets') is not null,
      $q$select coalesce(string_agg(s || '=' || n::text, '; ' order by s), 'none')
         from (select coalesce(to_jsonb(t) ->> 'workflow_state', '(null)') as s, count(*) as n from public.tickets t group by 1) x$q$),
    ('tickets: already have ticket_type_key', '0 before the migration',
      to_regclass('public.tickets') is not null,
      $q$select count(*) from public.tickets t where (to_jsonb(t) ->> 'ticket_type_key') is not null$q$),
    ('tickets: the migration backfill would set ticket_type_key', 'informational',
      to_regclass('public.tickets') is not null and to_regclass('public.ticket_types') is not null,
      $q$select count(*) from public.tickets t,
           lateral (select coalesce(to_jsonb(t) ->> 'type', to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type') as v) x
         where (to_jsonb(t) ->> 'ticket_type_key') is null and x.v is not null
           and exists (select 1 from public.ticket_types tt where (to_jsonb(tt) ->> 'key') = x.v)$q$),
    ('tickets: legacy type value that matches no ticket type (stay untyped)', 'informational',
      to_regclass('public.tickets') is not null and to_regclass('public.ticket_types') is not null,
      $q$select count(*) from public.tickets t,
           lateral (select coalesce(to_jsonb(t) ->> 'type', to_jsonb(t) -> 'ptz_coordinates' -> 'metadata' ->> 'type') as v) x
         where x.v is not null
           and not exists (select 1 from public.ticket_types tt where (to_jsonb(tt) ->> 'key') = x.v)$q$),
    ('tickets: workflow_version_id points to a missing version', '0',
      to_regclass('public.tickets') is not null and to_regclass('public.workflow_versions') is not null,
      $q$select count(*) from public.tickets t
         where (to_jsonb(t) ->> 'workflow_version_id') is not null
           and not exists (select 1 from public.workflow_versions v where (to_jsonb(v) ->> 'id') = (to_jsonb(t) ->> 'workflow_version_id'))$q$),
    ('ticket_state_history: rows', 'informational',
      to_regclass('public.ticket_state_history') is not null,
      $q$select count(*) from public.ticket_state_history$q$),
    ('ticket_assignment_history: rows', 'informational',
      to_regclass('public.ticket_assignment_history') is not null,
      $q$select count(*) from public.ticket_assignment_history$q$),
    ('ticket_types: rows, system rows and keys', 'informational',
      to_regclass('public.ticket_types') is not null,
      $q$select count(*)::text || ' rows; system=' || (count(*) filter (where (to_jsonb(t) ->> 'is_system') = 'true'))::text
           || '; keys=' || coalesce(string_agg(to_jsonb(t) ->> 'key', ',' order by to_jsonb(t) ->> 'key'), 'none')
         from public.ticket_types t$q$),
    ('ticket_types: rows with NULL config', '0 for healthy defaults',
      to_regclass('public.ticket_types') is not null,
      $q$select count(*) from public.ticket_types t where (to_jsonb(t) ->> 'config') is null$q$),
    ('ticket_types: template pointer is NULL or points to a missing template', '0 for healthy defaults',
      to_regclass('public.ticket_types') is not null and to_regclass('public.workflow_templates') is not null,
      $q$select count(*) from public.ticket_types t
         where (to_jsonb(t) ->> 'workflow_template_id') is null
            or not exists (select 1 from public.workflow_templates w where (to_jsonb(w) ->> 'id') = (to_jsonb(t) ->> 'workflow_template_id'))$q$),
    ('workflow_templates: rows and system rows', 'informational',
      to_regclass('public.workflow_templates') is not null,
      $q$select count(*)::text || ' rows; system=' || (count(*) filter (where (to_jsonb(w) ->> 'is_system') = 'true'))::text
         from public.workflow_templates w$q$),
    ('workflow_versions: rows', 'informational',
      to_regclass('public.workflow_versions') is not null,
      $q$select count(*) from public.workflow_versions$q$),
    ('seed prediction for standard / financial / maintenance', 'informational: what the seed step would do',
      to_regclass('public.ticket_types') is not null and to_regclass('public.workflow_templates') is not null
        and to_regclass('public.workflow_versions') is not null,
      $q$select string_agg(d.k || ': ' || coalesce(s.msg, 'no row, seed INSERTS the type'), ' | ' order by d.k)
         from (values ('standard'), ('financial'), ('maintenance')) d(k)
         left join lateral (
           select case
             when (to_jsonb(t) ->> 'config') is null then 'row exists with NULL config, seed UPDATES it'
             when not exists (select 1 from public.workflow_templates w
                              where (to_jsonb(w) ->> 'id') = (to_jsonb(t) ->> 'workflow_template_id'))
               then 'row exists but its template is missing, seed UPDATES it'
             when not exists (
                    select 1 from public.workflow_versions v, lateral (select to_jsonb(v) -> 'definition' as df) z
                    where (to_jsonb(v) ->> 'template_id') = (to_jsonb(t) ->> 'workflow_template_id')
                      and case when jsonb_typeof(z.df -> 'states') = 'array' then jsonb_array_length(z.df -> 'states') > 0 else false end
                      and jsonb_typeof(z.df -> 'transitions') = 'array'
                      and coalesce(z.df ->> 'initial', '') <> '')
               then 'row ok but no valid workflow version, seed INSERTS a version'
             else 'row, template and valid version present, seed changes nothing'
           end as msg
           from public.ticket_types t where (to_jsonb(t) ->> 'key') = d.k limit 1
         ) s on true$q$),
    ('ticket_type_changes: rows (audit trail)', '0 before the migration',
      to_regclass('public.ticket_type_changes') is not null,
      $q$select count(*) from public.ticket_type_changes$q$),
    ('ticket_type_migration_backup: rows and distinct captured_at', 'informational (the rollback snapshot)',
      to_regclass('public.ticket_type_migration_backup') is not null,
      $q$select count(*)::text || ' rows; distinct captured_at=' || count(distinct (to_jsonb(b) ->> 'captured_at'))::text
         from public.ticket_type_migration_backup b$q$)
),

probe_rows(section, item, expected, actual, status) as (
  select '09 data profile', p.item, p.expected,
         case when p.guard
              then coalesce((xpath('/row/*/text()', query_to_xml(p.qtext, false, true, '')))[1]::text, '(null)')
              else 'skipped: a table it reads is missing'
         end,
         'INFO'
  from probes p
),

all_rows(section, item, expected, actual, status) as (
  select * from context_rows
  union all select * from role_rows
  union all select * from table_rows
  union all select * from col_rows
  union all select * from type_rows
  union all select * from fn_rows
  union all select * from fn_overload_rows
  union all select * from fn_save_rows
  union all select * from fn_migration_rows
  union all select * from trigger_rows
  union all select * from rls_rows
  union all select * from policy_rows
  union all select * from priv_rows
  union all select * from colpriv_rows
  union all select * from writer_rows
  union all select * from probe_rows
)

select section, item, expected, actual, status from all_rows
union all
select '00 summary', 'blocking findings (MISSING or MISMATCH)', '0', count(*)::text,
       case when count(*) = 0 then 'OK' else 'BLOCKED' end
from all_rows where status in ('MISSING', 'MISMATCH')
union all
select '00 summary', 'items that need a decision (REVIEW)', '0, or each one explained', count(*)::text, 'INFO'
from all_rows where status = 'REVIEW'
order by 1, 2;
