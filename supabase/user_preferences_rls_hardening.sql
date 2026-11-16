-- OominiEye: lock per-user preferences and ticket-read markers to the signed-in account.
-- Apply after user_preferences.sql in Supabase project okkgnwiqcupflocoobes.
-- Browser identity is supplied by the short-lived server-signed DB JWT claim app_user_name.
-- Existing rows remain keyed by display name; no data migration is required.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

do $$
begin
  if to_regclass('public.user_preferences') is null then
    raise exception 'public.user_preferences does not exist; apply user_preferences.sql first';
  end if;
  if to_regclass('public.ticket_reads') is null then
    raise exception 'public.ticket_reads does not exist; apply user_preferences.sql first';
  end if;
end;
$$;

alter table public.user_preferences enable row level security;
alter table public.ticket_reads enable row level security;

-- Remove every existing policy on these tables so no permissive legacy policy can
-- combine with the new account-scoped policies.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_preferences', 'ticket_reads')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

-- Remove anonymous and PUBLIC access. The browser receives a signed JWT with role
-- authenticated; only that role receives the minimum privileges needed by the UI.
revoke all on table public.user_preferences, public.ticket_reads from public, anon, authenticated;
grant select, insert, update on table public.user_preferences, public.ticket_reads to authenticated;

create policy user_preferences_select_own
  on public.user_preferences for select to authenticated
  using (user_name = (auth.jwt() ->> 'app_user_name'));

create policy user_preferences_insert_own
  on public.user_preferences for insert to authenticated
  with check (user_name = (auth.jwt() ->> 'app_user_name'));

create policy user_preferences_update_own
  on public.user_preferences for update to authenticated
  using (user_name = (auth.jwt() ->> 'app_user_name'))
  with check (user_name = (auth.jwt() ->> 'app_user_name'));

create policy ticket_reads_select_own
  on public.ticket_reads for select to authenticated
  using (user_name = (auth.jwt() ->> 'app_user_name'));

create policy ticket_reads_insert_own
  on public.ticket_reads for insert to authenticated
  with check (user_name = (auth.jwt() ->> 'app_user_name'));

create policy ticket_reads_update_own
  on public.ticket_reads for update to authenticated
  using (user_name = (auth.jwt() ->> 'app_user_name'))
  with check (user_name = (auth.jwt() ->> 'app_user_name'));

commit;
