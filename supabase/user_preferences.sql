-- Per-user interface preferences (ticket view, preview, pin size, Ticket Management layout).
create table if not exists public.user_preferences (
  user_name text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_name, key)
);

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences select" on public.user_preferences;
drop policy if exists "user_preferences insert" on public.user_preferences;
drop policy if exists "user_preferences update" on public.user_preferences;
create policy "user_preferences select" on public.user_preferences for select to anon, authenticated using (true);
create policy "user_preferences insert" on public.user_preferences for insert to anon, authenticated with check (true);
create policy "user_preferences update" on public.user_preferences for update to anon, authenticated using (true) with check (true);

-- Tracks when each user last opened a ticket (drives the "updated" dot).
create table if not exists public.ticket_reads (
  user_name text not null,
  ticket_id text not null,
  seen_at timestamptz not null default now(),
  primary key (user_name, ticket_id)
);

alter table public.ticket_reads enable row level security;

drop policy if exists "ticket_reads select" on public.ticket_reads;
drop policy if exists "ticket_reads insert" on public.ticket_reads;
drop policy if exists "ticket_reads update" on public.ticket_reads;
create policy "ticket_reads select" on public.ticket_reads for select to anon, authenticated using (true);
create policy "ticket_reads insert" on public.ticket_reads for insert to anon, authenticated with check (true);
create policy "ticket_reads update" on public.ticket_reads for update to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
