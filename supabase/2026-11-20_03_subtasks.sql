-- Step 4 of Spec-2026-11-19-Hierarchy-Subtasks: sub-tasks, mention → watcher, Inbox = FYI mentions only.
-- A sub-task is a tickets row with parent_ticket_id set, on its own small workflow (ticket type 'subtask').

-- 1. Data -------------------------------------------------------------------------------------------
alter table public.tickets add column if not exists parent_ticket_id text references public.tickets (id) on delete cascade;
alter table public.tickets add column if not exists source_comment_id text;
create index if not exists tickets_parent_idx on public.tickets (parent_ticket_id);

-- 2. Sub-task workflow (hidden ticket type, never offered for new tickets) ----------------------------
do $$
declare v_template uuid;
begin
  if not exists (select 1 from public.ticket_types where key = 'subtask') then
    alter table public.workflow_templates disable trigger user;
    alter table public.workflow_versions disable trigger user;
    alter table public.ticket_types disable trigger protect_system_ticket_types;
    insert into public.workflow_templates (name, description, is_system)
    values ('Sub-task', 'To Do → Start Work → Complete; can be discarded or reopened', true)
    returning id into v_template;
    insert into public.workflow_versions (template_id, version, is_active, definition)
    values (v_template, 1, false, '{
      "initial": "todo",
      "states": [
        {"key":"todo","label":"To Do","group":"open"},
        {"key":"in_progress","label":"In Progress","group":"in_progress"},
        {"key":"on_hold","label":"On Hold","group":"in_progress"},
        {"key":"done","label":"Done","group":"done"},
        {"key":"discarded","label":"Discarded","group":"failed"}
      ],
      "transitions": [
        {"id":"assign","label":"Reassign","from":["todo","in_progress","on_hold"],"to":"todo","assign":"pick","requireNote":false},
        {"id":"start","label":"Start Work","from":["todo"],"to":"in_progress","assign":"none","requireNote":false},
        {"id":"complete","label":"Mark Done","from":["in_progress"],"to":"done","assign":"none","requireNote":true},
        {"id":"hold","label":"Put On Hold","from":["in_progress"],"to":"on_hold","assign":"none","requireNote":false},
        {"id":"resume","label":"Resume Work","from":["on_hold"],"to":"in_progress","assign":"none","requireNote":false},
        {"id":"discard","label":"Discard","from":["todo","in_progress","on_hold"],"to":"discarded","assign":"none","requireNote":true},
        {"id":"reopen","label":"Reopen","from":["done","discarded"],"to":"todo","assign":"none","requireNote":false}
      ]
    }'::jsonb);
    insert into public.ticket_types (key, label, description, is_system, workflow_template_id, config, is_active)
    values ('subtask', 'Sub-task', 'Created from a comment on a main ticket', true, v_template::text, null, false);
    alter table public.ticket_types enable trigger protect_system_ticket_types;
    alter table public.workflow_versions enable trigger user;
    alter table public.workflow_templates enable trigger user;
  end if;
end $$;

-- 3. Mentions make the person a watcher (FYI) -------------------------------------------------------
create or replace function public.notify_on_mention()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_old_len int := case when tg_op = 'UPDATE' and jsonb_typeof(old.replies) = 'array' then jsonb_array_length(old.replies) else 0 end;
  v_c jsonb; v_i bigint; v_text text; v_by text; v_uid text; v_name text; v_parent_by text; v_mentioned text[];
  v_followers text[];
begin
  if new.replies is null or jsonb_typeof(new.replies) <> 'array' then return new; end if;
  for v_c, v_i in select e, o from jsonb_array_elements(new.replies) with ordinality as t(e, o) loop
    continue when v_i <= v_old_len;
    v_text := lower(regexp_replace(coalesce(v_c->>'text', ''), '\s+', ' ', 'g'));
    v_by := trim(coalesce(v_c->>'by', ''));
    v_mentioned := '{}';
    if v_by <> '' then perform public.resolve_inbox_for(v_by, new.id); end if;

    -- Mentions are stored as user ids on the comment; older comments fall back to matching @Display Name.
    if jsonb_typeof(v_c->'mentions') = 'array' then
      v_mentioned := array(select distinct m from jsonb_array_elements_text(v_c->'mentions') m
                           join public.app_users u on u.id::text = m and u.active where m <> v_by);
    elsif position('@' in v_text) > 0 then
      for v_uid, v_name in select u.id::text, u.display_name from public.app_users u where u.active loop
        if position('@' || lower(v_name) in v_text) > 0 and v_uid <> v_by then
          v_mentioned := v_mentioned || v_uid;
        end if;
      end loop;
    end if;

    if array_length(v_mentioned, 1) > 0 then
      insert into public.notifications (for_user, from_user, ticket_id, ticket_title, type, message, comment_id)
      select m, v_by, new.id, new.title, 'mention', left(coalesce(v_c->>'text', ''), 300), v_c->>'id' from unnest(v_mentioned) m;
      -- FYI watchers
      v_followers := array(select x from jsonb_array_elements_text(
        case when jsonb_typeof(new.ptz_coordinates->'metadata'->'followers') = 'array' then new.ptz_coordinates->'metadata'->'followers' else '[]'::jsonb end) x);
      if exists (select 1 from unnest(v_mentioned) m where not (m = any (v_followers))) then
        update public.tickets
        set ptz_coordinates = public.ticket_metadata_set(ptz_coordinates, 'followers',
              to_jsonb(v_followers || array(select m from unnest(v_mentioned) m where not (m = any (v_followers)))))
        where id = new.id;
      end if;
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

-- The trigger updates the same row (followers): make sure it does not re-fire on its own update.
drop trigger if exists tickets_notify_on_mention on public.tickets;
create trigger tickets_notify_on_mention after update of replies on public.tickets
for each row when (pg_trigger_depth() < 1) execute function public.notify_on_mention();

-- 4. Comments carry mention ids; posting can create sub-tasks for checked people -----------------------
drop function if exists public.add_ticket_comment_secure(text, text, jsonb, text, text, text, text);
create or replace function public.add_ticket_comment_secure(
  p_ticket_id text, p_text text, p_attachments jsonb, p_actor text, p_role text,
  p_comment_id text default null, p_reply_to text default null,
  p_mentions text[] default null, p_subtask_for text[] default null)
returns public.tickets language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_ticket public.tickets%rowtype;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_comment jsonb;
  v_id text := coalesce(nullif(trim(coalesce(p_comment_id, '')), ''), gen_random_uuid()::text);
  v_reply_to text := nullif(trim(coalesce(p_reply_to, '')), '');
  v_mentions text[];
  v_sub text[];
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);
  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception 'Invalid attachments';
  end if;
  if nullif(trim(coalesce(p_text, '')), '') is null and jsonb_array_length(v_attachments) = 0 then
    raise exception 'A comment needs text or an attachment';
  end if;

  select * into v_ticket from public.tickets where id::text = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found';
  end if;

  v_mentions := array(select distinct m from unnest(coalesce(p_mentions, '{}')) m
                      join public.app_users u on u.id::text = m and u.active);
  v_sub := array(select distinct s from unnest(coalesce(p_subtask_for, '{}')) s where s = any (v_mentions));

  if array_length(v_sub, 1) > 0 then
    if v_ticket.parent_ticket_id is not null then
      raise exception 'Sub-tasks cannot have sub-tasks';
    end if;
    if not (v_by = trim(coalesce(v_ticket.reporter, '')) or v_by = trim(coalesce(v_ticket.assignee, ''))) then
      raise exception 'Only the ticket''s reporter or current assignee can create sub-tasks';
    end if;
  end if;

  v_comment := jsonb_build_object('at', now(), 'by', v_by, 'text', coalesce(p_text, ''), 'id', v_id)
    || case when v_reply_to is not null then jsonb_build_object('reply_to', v_reply_to) else '{}'::jsonb end
    || case when array_length(v_mentions, 1) > 0 then jsonb_build_object('mentions', to_jsonb(v_mentions)) else jsonb_build_object('mentions', '[]'::jsonb) end
    || case when jsonb_array_length(v_attachments) > 0 then jsonb_build_object('attachments', v_attachments) else '{}'::jsonb end;

  if array_length(v_sub, 1) > 0 then
    -- People who get a sub-task are not FYI watchers: keep them out of the mention trigger's watcher/inbox list.
    v_comment := v_comment || jsonb_build_object('mentions', to_jsonb(array(select m from unnest(v_mentions) m where not (m = any (v_sub)))),
                                                 'subtask_for', to_jsonb(v_sub));
  end if;

  update public.tickets
  set replies = coalesce(replies, '[]'::jsonb) || jsonb_build_array(v_comment)
  where id = v_ticket.id
  returning * into v_ticket;

  if array_length(v_sub, 1) > 0 then
    perform public.create_subtask_internal(v_ticket, v_id, coalesce(p_text, ''), s, v_by) from unnest(v_sub) s;
    select * into v_ticket from public.tickets where id = v_ticket.id;
  end if;
  return v_ticket;
end;
$function$;

create or replace function public.create_subtask_internal(p_parent public.tickets, p_comment_id text, p_text text, p_assignee text, p_by text)
returns text language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_type public.ticket_types%rowtype;
  v_version public.workflow_versions%rowtype;
  v_n int;
  v_id text;
  v_now timestamptz := now();
  v_additional jsonb := p_parent.ptz_coordinates -> 'metadata' -> 'additional';
begin
  select * into v_type from public.ticket_types where key = 'subtask';
  select * into v_version from public.current_ticket_type_version(v_type.workflow_template_id);
  select count(*) + 1 into v_n from public.tickets where parent_ticket_id = p_parent.id;
  v_id := left(p_parent.id, 100) || '-S' || v_n;
  while exists (select 1 from public.tickets where id = v_id) loop
    v_n := v_n + 1;
    v_id := left(p_parent.id, 100) || '-S' || v_n;
  end loop;

  insert into public.tickets (id, ticket_id, created_at, status, title, description, priority, reporter, assignee,
                              camera_name, ptz_coordinates, history_log, replies, ticket_type_key, workflow_version_id,
                              workflow_state, parent_ticket_id, source_comment_id)
  values (v_id, v_id, v_now, 'to do', 'Sub-task of: ' || p_parent.title, p_text, p_parent.priority, p_by, p_assignee,
          null,
          -- No location: no camera, map pin or snapshots. Inherits the parent's due date / breach rule (SLA).
          jsonb_build_object('metadata', jsonb_build_object('type', 'subtask', 'source', 'SUBTASK', 'parentTicketId', p_parent.id,
                             'followers', to_jsonb(array[p_by])) ||
                             case when jsonb_typeof(v_additional) = 'object' then jsonb_build_object('additional', v_additional) else '{}'::jsonb end),
          jsonb_build_array(jsonb_build_object('at', v_now, 'by', p_by, 'text', 'Sub-task created from a comment on ' || p_parent.id)),
          '[]'::jsonb, 'subtask', v_version.id, 'todo', p_parent.id, p_comment_id);

  insert into public.ticket_assignment_history (ticket_id, from_assignee, to_assignee, changed_by, action_label, note, changed_at)
  values (v_id, 'Unassigned', p_assignee, p_by, 'Sub-task', left(p_text, 300), v_now);

  update public.tickets
  set history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at', v_now, 'by', p_by, 'text', 'Sub-task ' || v_id || ' created for ' || public.user_label(p_assignee)))
  where id = p_parent.id;
  return v_id;
end;
$function$;
revoke all on function public.create_subtask_internal(public.tickets, text, text, text, text) from public, anon, authenticated;

-- 5. Workflow permissions: sub-task rules -------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.apply_workflow_action_secure(text,text,text,text,text,text)'::regprocedure) into v_def;
  v_def := replace(v_def,
    $q$  v_allowed := case p_action_id$q$,
    $q$  if v_ticket.parent_ticket_id is not null then
    -- Sub-task: the main ticket's reporter / assignee and the sub-task assignee's manager control it;
    -- the sub-task assignee may only start it and mark it done.
    select (v_actor = trim(coalesce(p.reporter, '')) or v_actor = trim(coalesce(p.assignee, '')))
      into v_allowed from public.tickets p where p.id = v_ticket.parent_ticket_id;
    v_allowed := coalesce(v_allowed, false) or public.is_manager_of(v_actor, v_assignee)
      or (p_action_id in ('start', 'complete') and v_is_assignee);
    if not v_allowed then
      raise exception 'You are not allowed to do this on this sub-task';
    end if;
    return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
  end if;

  v_allowed := case p_action_id$q$);
  -- Main ticket Done = every sub-task Completed or Discarded.
  v_def := replace(v_def,
    $q$  return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
end;$q$,
    $q$  if exists (
       select 1 from jsonb_array_elements((select definition from public.workflow_versions where id = v_ticket.workflow_version_id) -> 'transitions') a
       where a ->> 'id' = p_action_id and public.workflow_state_group((select definition from public.workflow_versions where id = v_ticket.workflow_version_id), a ->> 'to') in ('done', 'accepted'))
     and exists (select 1 from public.tickets s where s.parent_ticket_id = v_ticket.id and s.workflow_state not in ('done', 'discarded')) then
    raise exception 'Mark every open sub-task complete or discard it before closing this ticket';
  end if;

  return public.apply_workflow_action(p_ticket_id, p_action_id, v_actor, v_new, p_note);
end;$q$);
  execute v_def;
end $$;

-- 6. Closing a parent: resolve each open sub-task (Mark complete / Discard) in one call ----------------
create or replace function public.resolve_open_subtasks_secure(p_ticket_id text, p_decisions jsonb, p_actor text, p_role text)
returns setof public.tickets language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_parent public.tickets%rowtype;
  v_sub public.tickets%rowtype;
  v_choice text;
  v_now timestamptz := now();
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator', 'Operator', 'Viewer']);
  select * into v_parent from public.tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if not (v_by = trim(coalesce(v_parent.reporter, '')) or v_by = trim(coalesce(v_parent.assignee, ''))
          or public.is_manager_of(v_by, v_parent.assignee)) then
    raise exception 'You are not allowed to close the sub-tasks of this ticket';
  end if;
  for v_sub in select * from public.tickets where parent_ticket_id = v_parent.id and workflow_state not in ('done', 'discarded') for update loop
    v_choice := p_decisions ->> v_sub.id;
    if v_choice not in ('complete', 'discard') then
      raise exception 'Choose Mark complete or Discard for %', v_sub.id;
    end if;
    insert into public.ticket_state_history (ticket_id, from_state, to_state, changed_by, changed_at, action_label, note, workflow_version_id)
    values (v_sub.id, v_sub.workflow_state, case v_choice when 'complete' then 'done' else 'discarded' end, v_by, v_now,
            case v_choice when 'complete' then 'Marked complete' else 'Discarded' end, 'Main ticket closed', v_sub.workflow_version_id);
    update public.tickets
    set workflow_state = case v_choice when 'complete' then 'done' else 'discarded' end,
        status = case v_choice when 'complete' then 'done' else 'failed' end,
        completed_at = case v_choice when 'complete' then v_now else completed_at end,
        history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', v_now, 'by', v_by,
          'text', case v_choice when 'complete' then 'Marked complete' else 'Discarded' end || ' when the main ticket was closed'))
    where id = v_sub.id;
  end loop;
  return query select * from public.tickets where parent_ticket_id = v_parent.id order by created_at;
end;
$function$;

-- 7. Inbox = FYI mentions and replies (assignments go to Assigned to Me) -----------------------------
create or replace function public.inbox_tickets_secure(p_actor text, p_role text)
returns table(ticket_id text, open_items integer, has_mention boolean, has_reply boolean, has_assignment boolean, latest_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator','Operator','Viewer']);
  return query
    select n.ticket_id, count(*)::int, bool_or(n.type = 'mention'), bool_or(n.type = 'reply'), false, max(n.created_at)
    from public.notifications n
    where n.for_user = trim(p_actor) and n.type in ('mention', 'reply')
      and exists (select 1 from public.tickets t where t.id = n.ticket_id and coalesce(t.assignee, '') <> trim(p_actor))
    group by n.ticket_id
    order by max(n.created_at) desc;
end $function$;

create or replace function public.inbox_count_secure(p_actor text, p_role text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  perform public.assert_ticket_type_actor(p_actor, p_role, array['Administrator','Operator','Viewer']);
  return (select count(distinct n.ticket_id) from public.notifications n
          where n.for_user = trim(p_actor) and n.type in ('mention', 'reply')
            and exists (select 1 from public.tickets t where t.id = n.ticket_id and coalesce(t.assignee, '') <> trim(p_actor)));
end $function$;
-- Patch: sub-tasks are created in the order people were mentioned (with ordinality).
