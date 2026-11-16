-- Per-user interface preferences (ticket view, preview, pin size, Ticket Management layout).
-- Browser access is restricted to the signed-in account by a server-signed JWT claim.
create table if not exists public.user_preferences (
  user_name text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_name, key)
);

-- Tracks when each user last opened a ticket (drives the "updated" dot).
create table if not exists public.ticket_reads (
  user_name text not null,
  ticket_id text not null,
  seen_at timestamptz not null default now(),
  primary key (user_name, ticket_id)
);

alter table public.user_preferences enable row level security;
alter table public.ticket_reads enable row level security;

-- Remove legacy broad policies before defining account-scoped access.
drop policy if exists "user_preferences select" on public.user_preferences;
drop policy if exists "user_preferences insert" on public.user_preferences;
drop policy if exists "user_preferences update" on public.user_preferences;
drop policy if exists user_preferences_select_own on public.user_preferences;
drop policy if exists user_preferences_insert_own on public.user_preferences;
drop policy if exists user_preferences_update_own on public.user_preferences;

drop policy if exists "ticket_reads select" on public.ticket_reads;
drop policy if exists "ticket_reads insert" on public.ticket_reads;
drop policy if exists "ticket_reads update" on public.ticket_reads;
drop policy if exists ticket_reads_select_own on public.ticket_reads;
drop policy if exists ticket_reads_insert_own on public.ticket_reads;
drop policy if exists ticket_reads_update_own on public.ticket_reads;

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

notify pgrst, 'reload schema';
