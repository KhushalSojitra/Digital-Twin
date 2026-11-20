-- Step 0–1 of Spec-2026-11-19-Hierarchy-Subtasks: clean slate, users in the database, ids instead of names.
-- Passwords are NOT set here; they are set separately so they never land in migration history.

-- 0. Clean slate ---------------------------------------------------------------------------------
truncate table
  public.tickets,
  public.notifications,
  public.ticket_reads,
  public.ticket_state_history,
  public.ticket_assignment_history,
  public.ticket_type_changes,
  public.ticket_attachments,
  public.ticket_deletion_audit,
  public.ticket_type_migration_backup;

-- 1. Users ---------------------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9._-]{2,40}$'),
  display_name text not null unique check (length(trim(display_name)) between 1 and 80),
  role text not null check (role in ('Administrator', 'Operator', 'Viewer')),
  team text,
  reports_to uuid references public.app_users (id) on delete set null,
  email text,
  email_enabled boolean not null default false,
  password_hash text,
  avatar_color text not null default '#0A84FF',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint app_users_not_own_manager check (reports_to is distinct from id)
);

alter table public.app_users enable row level security;
-- No browser access at all: the server serves the public directory (never the hash).
revoke all on public.app_users from anon, authenticated;

-- No circular reporting lines.
create or replace function public.guard_app_user_hierarchy()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v uuid := new.reports_to; i int := 0;
begin
  while v is not null and i < 100 loop
    if v = new.id then
      raise exception 'Circular reporting line: % cannot report to someone who reports to them', new.display_name;
    end if;
    select reports_to into v from public.app_users where id = v;
    i := i + 1;
  end loop;
  return new;
end $$;

drop trigger if exists app_users_hierarchy_guard on public.app_users;
create trigger app_users_hierarchy_guard before insert or update of reports_to on public.app_users
for each row execute function public.guard_app_user_hierarchy();

-- Nearest ACTIVE manager up the chain (an inactive manager is skipped; the next one up is the authority).
create or replace function public.effective_manager(p_user uuid)
returns uuid language plpgsql stable set search_path = public, pg_temp as $$
declare v uuid; v_active boolean; i int := 0;
begin
  select reports_to into v from public.app_users where id = p_user;
  while v is not null and i < 100 loop
    select active into v_active from public.app_users where id = v;
    if v_active then return v; end if;
    select reports_to into v from public.app_users where id = v;
    i := i + 1;
  end loop;
  return null;
end $$;

-- The person at the top of the hierarchy (Director).
create or replace function public.top_user()
returns uuid language sql stable set search_path = public, pg_temp as $$
  select id from public.app_users where active and reports_to is null order by created_at limit 1;
$$;

-- Who approves / manages work done by p_user: their active manager, or the top user (who self-approves).
create or replace function public.approver_for(p_user text)
returns uuid language sql stable set search_path = public, pg_temp as $$
  select case
    when p_user is null or p_user !~ '^[0-9a-f-]{36}$' then null
    else coalesce(public.effective_manager(p_user::uuid), public.top_user())
  end;
$$;

create or replace function public.is_manager_of(p_manager text, p_user text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.approver_for(p_user)::text = p_manager, false);
$$;

-- Display name for a stored user id (falls back to the value itself, e.g. 'Unassigned').
create or replace function public.user_label(p_ref text)
returns text language sql stable set search_path = public, pg_temp as $$
  select coalesce((select display_name from public.app_users where id::text = p_ref), p_ref);
$$;

-- Server-only password check.
create or replace function public.verify_app_user_password(p_username text, p_password text)
returns table (id uuid, username text, display_name text, role text, team text, reports_to uuid, email text, avatar_color text)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select u.id, u.username, u.display_name, u.role, u.team, u.reports_to, u.email, u.avatar_color
  from public.app_users u
  where u.username = lower(trim(p_username))
    and u.active
    and u.password_hash is not null
    and u.password_hash = extensions.crypt(p_password, u.password_hash);
$$;
revoke all on function public.verify_app_user_password(text, text) from public, anon, authenticated;
grant execute on function public.verify_app_user_password(text, text) to service_role;

-- Seed (passwords set separately).
insert into public.app_users (username, display_name, role, team, avatar_color) values
  ('director', 'Director', 'Administrator', null, '#5E5CE6')
on conflict (username) do nothing;
insert into public.app_users (username, display_name, role, team, reports_to, avatar_color)
select v.username, v.display_name, v.role, v.team, (select id from public.app_users where username = v.manager), v.color
from (values
  ('ava', 'Ava Sharma', 'Administrator', 'General', 'director', '#0A84FF'),
  ('michael', 'Michael Reed', 'Operator', 'Finance', 'director', '#30D158')
) v(username, display_name, role, team, manager, color)
on conflict (username) do nothing;
insert into public.app_users (username, display_name, role, team, reports_to, avatar_color)
select v.username, v.display_name, v.role, v.team, (select id from public.app_users where username = v.manager), v.color
from (values
  ('sarah', 'Sarah Wilson', 'Viewer', 'General', 'ava', '#FF9F0A'),
  ('general2', 'General Member 2', 'Operator', 'General', 'ava', '#64D2FF'),
  ('finance1', 'Finance Member 1', 'Operator', 'Finance', 'michael', '#FF375F'),
  ('finance2', 'Finance Member 2', 'Operator', 'Finance', 'michael', '#BF5AF2')
) v(username, display_name, role, team, manager, color)
on conflict (username) do nothing;

-- Merge the old email table into app_users, then drop it.
update public.app_users u set email = e.email, email_enabled = e.email_enabled
from public.app_user_emails e where e.user_name = u.display_name;
drop table if exists public.app_user_emails;

-- Preferences and reads are now keyed by user id (the DB token claim app_user_name carries the id).
update public.user_preferences p set user_name = u.id::text from public.app_users u where p.user_name = u.display_name;
delete from public.user_preferences p where not exists (select 1 from public.app_users u where u.id::text = p.user_name);

-- 2. Mentions match every active user (not only people already on a ticket) and store ids ---------
create or replace function public.notify_on_mention()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_old_len int := case when tg_op = 'UPDATE' and jsonb_typeof(old.replies) = 'array' then jsonb_array_length(old.replies) else 0 end;
  v_c jsonb; v_i bigint; v_text text; v_by text; v_uid text; v_name text; v_parent_by text; v_mentioned text[];
begin
  if new.replies is null or jsonb_typeof(new.replies) <> 'array' then return new; end if;
  for v_c, v_i in select e, o from jsonb_array_elements(new.replies) with ordinality as t(e, o) loop
    continue when v_i <= v_old_len;
    v_text := lower(regexp_replace(coalesce(v_c->>'text', ''), '\s+', ' ', 'g'));
    v_by := trim(coalesce(v_c->>'by', ''));
    v_mentioned := '{}';
    if v_by <> '' then perform public.resolve_inbox_for(v_by, new.id); end if;

    if position('@' in v_text) > 0 then
      for v_uid, v_name in select u.id::text, u.display_name from public.app_users u where u.active loop
        if position('@' || lower(v_name) in v_text) > 0 and v_uid <> v_by then
          v_mentioned := v_mentioned || v_uid;
          insert into public.notifications (for_user, from_user, ticket_id, ticket_title, type, message, comment_id)
          values (v_uid, v_by, new.id, new.title, 'mention', left(coalesce(v_c->>'text', ''), 300), v_c->>'id');
        end if;
      end loop;
    end if;

    if nullif(v_c->>'reply_to', '') is not null then
      select trim(p->>'by') into v_parent_by from jsonb_array_elements(new.replies) p where p->>'id' = v_c->>'reply_to' limit 1;
      if v_parent_by is not null and v_parent_by <> '' and v_parent_by <> v_by and not (v_parent_by = any (v_mentioned)) then
        insert into public.notifications (for_user, from_user, ticket_id, ticket_title, type, message, comment_id)
        values (v_parent_by, v_by, new.id, new.title, 'reply', left(coalesce(v_c->>'text', ''), 300), v_c->>'id');
      end if;
    end if;
  end loop;
  return new;
end $function$;

drop function if exists public.known_ticket_users();

-- 3. History text shows names, not ids (data columns keep the ids) ------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.apply_workflow_action(text,text,text,text,text)'::regprocedure) into v_def;
  v_def := replace(v_def, $q$'Assigned to ' || v_assignee$q$, $q$'Assigned to ' || public.user_label(v_assignee)$q$);
  v_def := replace(v_def, $q$'work passed from ' || v_previous || ' to ' || v_assignee$q$,
                          $q$'work passed from ' || public.user_label(v_previous) || ' to ' || public.user_label(v_assignee)$q$);
  execute v_def;

  select pg_get_functiondef('public.update_ticket_followers_secure(text,text,text[],text,text)'::regprocedure) into v_def;
  v_def := replace(v_def, $q$v_by || ' $q$, $q$public.user_label(v_by) || ' $q$);
  v_def := replace(v_def, $q$then v_by || $q$, $q$then public.user_label(v_by) || $q$);
  v_def := replace(v_def, $q$else v_by || $q$, $q$else public.user_label(v_by) || $q$);
  v_def := replace(v_def, $q$array_to_string(v_people, ', ')$q$, $q$(select string_agg(public.user_label(x), ', ') from unnest(v_people) x)$q$);
  execute v_def;
end $$;
