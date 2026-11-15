-- OominiEye: read-only checks for the ticket type hardening. Changes nothing; safe to run at any time, before
-- and after supabase/ticket_type_hardening.sql, in the SQL editor of okkgnwiqcupflocoobes.

-- A. Is this the application database? (expect: tickets, ticket_types, workflow_templates, workflow_versions)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('tickets', 'ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_state_history', 'ticket_assignment_history')
order by table_name;

-- B. Who can execute what. After the migration every anon / authenticated column must be false.
select p.oid::regprocedure::text as function,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname in ('apply_workflow_action', 'apply_ticket_type_workflow', 'create_ticket_type', 'update_ticket_type', 'delete_ticket_type', 'save_workflow_template', 'change_ticket_state')
       or p.proname like '%\_secure' escape '\')
order by 1;

-- C. Table privileges for browsers. After the migration: no write on the first three, no access to the others.
select t.table_name,
       has_table_privilege('anon', 'public.' || t.table_name, 'select') as anon_select,
       has_table_privilege('anon', 'public.' || t.table_name, 'insert') as anon_insert,
       has_table_privilege('anon', 'public.' || t.table_name, 'update') as anon_update,
       has_table_privilege('anon', 'public.' || t.table_name, 'delete') as anon_delete
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name in ('ticket_types', 'workflow_templates', 'workflow_versions', 'ticket_type_changes', 'ticket_type_migration_backup', 'tickets')
order by 1;

-- D. Protection triggers (expect four rows after the migration)
select c.relname as table_name, t.tgname as trigger
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgname in ('zz_guard_ticket_protected_fields', 'protect_system_ticket_types', 'guard_workflow_templates', 'guard_workflow_versions')
order by 1, 2;

-- E. Row level security policies on the audit trail (expect none)
select schemaname, tablename, policyname, roles
from pg_policies
where schemaname = 'public' and tablename = 'ticket_type_changes';

-- F. Default ticket types and their workflows (every row needs a template and a version)
select tt.key, tt.is_system, tt.is_active, tt.config is not null as has_config,
       tt.workflow_template_id,
       (select count(*) from public.workflow_versions v where v.template_id::text = tt.workflow_template_id) as versions
from public.ticket_types tt
where tt.key in ('standard', 'financial', 'maintenance')
order by tt.key;

-- G. Orphaned system workflow templates (not used by any ticket type). Review before deleting anything.
select t.id, t.name, t.created_at
from public.workflow_templates t
where coalesce(t.is_system, false)
  and not exists (select 1 from public.ticket_types tt where tt.workflow_template_id = t.id::text)
order by t.created_at;

-- I. public.tickets browser access. After the migration: RLS on, exactly one policy (tickets_read_signed_in,
--    SELECT, authenticated), anon has nothing, authenticated can only select, and no column-level grants remain.
select (select relrowsecurity from pg_class where oid = 'public.tickets'::regclass) as rls_enabled,
       (select string_agg(policyname || ' [' || cmd || ' / ' || array_to_string(roles, ',') || ']', '; ') from pg_policies where schemaname = 'public' and tablename = 'tickets') as policies,
       has_table_privilege('anon', 'public.tickets', 'select,insert,update,delete') as anon_any_table_privilege,
       has_any_column_privilege('anon', 'public.tickets', 'select,insert,update,references') as anon_any_column_privilege,
       has_table_privilege('authenticated', 'public.tickets', 'select') as authenticated_select,
       has_table_privilege('authenticated', 'public.tickets', 'insert,update,delete') as authenticated_write_table,
       (select count(*) from pg_attribute a cross join lateral aclexplode(a.attacl) acl join pg_roles ro on ro.oid = acl.grantee
         where a.attrelid = 'public.tickets'::regclass and a.attnum > 0 and not a.attisdropped
           and ro.rolname in ('anon', 'authenticated') and acl.privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')) as authenticated_or_anon_column_write_grants;

-- H. Existing tickets: how many already carry a type, how many are legacy (type only in metadata)
select count(*) filter (where to_jsonb(t) ->> 'ticket_type_key' is not null) as with_ticket_type_key,
       count(*) filter (where to_jsonb(t) ->> 'ticket_type_key' is null) as without_ticket_type_key,
       count(*) filter (where workflow_version_id is null) as without_workflow_version
from public.tickets t;
