-- OominiEye: correct workflow-version guard ownership checks.
--
-- Apply only after reviewing this patch. Run in the Supabase SQL Editor for
-- project okkgnwiqcupflocoobes. This patch changes one trigger function only.
-- It does NOT drop or replace the legacy workflow protection triggers.
--
-- Fixes:
--   * DELETE reads OLD.template_id explicitly.
--   * UPDATE checks both the source and destination template. A version cannot
--     be moved out of a system template or moved into one.
--   * INSERT checks the destination template before allowing a version.
--
-- Existing behaviour intentionally retained:
--   * Browser roles cannot write workflow templates or versions directly.
--   * A system template cannot receive additional versions.
--   * is_active may change on a system version; all other version fields remain
--     immutable. Change this policy separately if activation must also be locked.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

create or replace function public.guard_workflow_versions()
returns trigger
language plpgsql
as $$
declare
  v_old_system boolean := false;
  v_new_system boolean := false;
begin
  if public.is_browser_role() then
    raise exception 'Workflow versions can only be changed through the server'
      using errcode = '42501';
  end if;

  if tg_op <> 'INSERT' then
    select coalesce(t.is_system, false)
      into v_old_system
    from public.workflow_templates t
    where t.id::text = old.template_id::text;
    v_old_system := coalesce(v_old_system, false);
  end if;

  if tg_op <> 'DELETE' then
    select coalesce(t.is_system, false)
      into v_new_system
    from public.workflow_templates t
    where t.id::text = new.template_id::text;
    v_new_system := coalesce(v_new_system, false);
  end if;

  if tg_op = 'INSERT' then
    if v_new_system and exists (
      select 1
      from public.workflow_versions v
      where v.template_id::text = new.template_id::text
    ) then
      raise exception 'System workflow templates cannot get new versions';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_old_system then
      raise exception 'System workflow versions cannot be deleted';
    end if;
    return old;
  end if;

  -- UPDATE: protect both ends of a template reassignment.
  if v_old_system or v_new_system then
    if old.template_id is distinct from new.template_id then
      raise exception 'System workflow versions cannot be moved';
    end if;

    if (to_jsonb(new) - 'is_active') <> (to_jsonb(old) - 'is_active') then
      raise exception 'System workflow versions cannot be modified';
    end if;
  end if;

  return new;
end;
$$;

commit;

-- Verification after applying:
-- 1. Re-run the trigger inventory query and confirm both
--    guard_workflow_versions and workflow_versions_protect remain attached.
-- 2. Re-run the function-definition query and confirm this function body is live.
-- 3. Do not drop either legacy trigger as part of this patch.
