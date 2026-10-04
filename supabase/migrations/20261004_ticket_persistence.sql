-- Ticket persistence: completion time, append-only state history, attachments, atomic state change.
-- Idempotent: safe to run more than once. Existing tickets and their data are never dropped or rewritten.

-- 1. tickets: only the completion timestamp is missing. (updated_at is intentionally NOT added.)
alter table public.tickets add column if not exists completed_at timestamptz;

update public.tickets
set completed_at = (ptz_coordinates::jsonb -> 'metadata' ->> 'completedAt')::timestamptz
where completed_at is null
  and ptz_coordinates::jsonb -> 'metadata' ->> 'completedAt' is not null;

-- 2. State history: one row per state transition, append-only.
create table if not exists public.ticket_state_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  from_state text,
  to_state text not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
create index if not exists ticket_state_history_ticket_idx on public.ticket_state_history (ticket_id, changed_at);

-- 3. Attachment metadata; the files themselves live in the private `ticket-attachments` storage bucket.
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  kind text not null default 'file' check (kind in ('before', 'after', 'file')),
  file_name text not null,
  file_type text,
  storage_path text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index if not exists ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id, uploaded_at);

-- 4. Backfill state history from the legacy tickets.history_log entries that carry a state.
insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at)
select s.ticket_id,
       lag(s.to_state) over (partition by s.ticket_id order by s.changed_at, s.ord),
       s.to_state,
       s.changed_by,
       s.changed_at
from (
  select t.id as ticket_id,
         case e.elem ->> 'state'
           when 'open' then 'to do'
           when 'reopened' then 'to do'
           else e.elem ->> 'state'
         end as to_state,
         coalesce(nullif(e.elem ->> 'by', ''), 'System') as changed_by,
         coalesce((e.elem ->> 'at')::timestamptz, t.created_at) as changed_at,
         e.ord
  from public.tickets t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.history_log::jsonb) = 'array' then t.history_log::jsonb else '[]'::jsonb end
  ) with ordinality as e(elem, ord)
  where e.elem ->> 'state' is not null
    and not exists (select 1 from public.ticket_state_history h where h.ticket_id = t.id)
) s;

-- Tickets that still have no history get a creation entry (null -> current state).
insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at)
select t.id, null, coalesce(t.status, 'to do'), coalesce(nullif(t.reporter, ''), 'System'), t.created_at
from public.tickets t
where not exists (select 1 from public.ticket_state_history h where h.ticket_id = t.id);

-- 5. Atomic state change: update tickets.status, completion time and append the history row in one transaction.
create or replace function public.change_ticket_state(
  p_ticket_id text,
  p_to_state text,
  p_changed_by text,
  p_completion jsonb default null
)
returns public.tickets
language plpgsql
security invoker
as $$
declare
  v_ticket public.tickets;
  v_from text;
  v_now timestamptz := now();
begin
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket % not found or not visible', p_ticket_id using errcode = 'P0002';
  end if;

  v_from := v_ticket.status;
  if v_from is not distinct from p_to_state then
    raise exception 'Ticket % is already in state %', p_ticket_id, p_to_state using errcode = 'P0001';
  end if;

  update public.tickets
  set status = p_to_state,
      completed_at = case when p_to_state = 'done' then v_now else completed_at end,
      ptz_coordinates = case
        when p_completion is not null then
          coalesce(ptz_coordinates::jsonb, '{}'::jsonb) || jsonb_build_object(
            'metadata',
            coalesce(ptz_coordinates::jsonb -> 'metadata', '{}'::jsonb)
              || jsonb_build_object('completion', p_completion)
          )
        else ptz_coordinates
      end
  where id = p_ticket_id
  returning * into v_ticket;

  if not found then
    raise exception 'Ticket % could not be updated (row level security?)', p_ticket_id using errcode = '42501';
  end if;

  insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at)
  values (p_ticket_id, v_from, p_to_state, p_changed_by, v_now);

  return v_ticket;
end;
$$;

grant execute on function public.change_ticket_state(text, text, text, jsonb) to anon, authenticated;

-- 6. Row level security (kept ON). The app signs users in on the client, so requests use the anon key.
alter table public.tickets enable row level security;
alter table public.ticket_state_history enable row level security;
alter table public.ticket_attachments enable row level security;

drop policy if exists "tickets_update_app" on public.tickets;
create policy "tickets_update_app" on public.tickets
  for update to anon, authenticated using (true) with check (true);

-- History is append-only: select + insert only, no update or delete policy.
drop policy if exists "ticket_state_history_select_app" on public.ticket_state_history;
create policy "ticket_state_history_select_app" on public.ticket_state_history
  for select to anon, authenticated using (true);
drop policy if exists "ticket_state_history_insert_app" on public.ticket_state_history;
create policy "ticket_state_history_insert_app" on public.ticket_state_history
  for insert to anon, authenticated with check (true);

drop policy if exists "ticket_attachments_select_app" on public.ticket_attachments;
create policy "ticket_attachments_select_app" on public.ticket_attachments
  for select to anon, authenticated using (true);
drop policy if exists "ticket_attachments_insert_app" on public.ticket_attachments;
create policy "ticket_attachments_insert_app" on public.ticket_attachments
  for insert to anon, authenticated with check (true);

-- 7. Private storage bucket for attachments.
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

drop policy if exists "ticket_attachments_objects_select" on storage.objects;
create policy "ticket_attachments_objects_select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'ticket-attachments');
drop policy if exists "ticket_attachments_objects_insert" on storage.objects;
create policy "ticket_attachments_objects_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'ticket-attachments');
drop policy if exists "ticket_attachments_objects_delete" on storage.objects;
create policy "ticket_attachments_objects_delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'ticket-attachments');

-- 8. Realtime for the new tables (ignored if already published).
do $$
begin
  alter publication supabase_realtime add table public.ticket_state_history;
exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.ticket_attachments;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
