-- Comment threading: lets add_ticket_comment_secure store an "id" and an optional "reply_to" inside each
-- entry of tickets.replies. No new table or function is created: the existing function is replaced in
-- place and gains two optional arguments, so older callers keep working. Entries written earlier have no
-- id and keep rendering as standalone bubbles.

drop function if exists public.add_ticket_comment_secure(text, text, jsonb, text, text);

create or replace function public.add_ticket_comment_secure(
  p_ticket_id text, p_text text, p_attachments jsonb, p_actor text, p_role text,
  p_id text default null, p_reply_to text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_by text := nullif(trim(coalesce(p_actor, '')), '');
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_id text := coalesce(nullif(trim(coalesce(p_id, '')), ''), gen_random_uuid()::text);
  v_reply_to text := nullif(trim(coalesce(p_reply_to, '')), '');
  v_comment jsonb;
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

  v_comment := jsonb_build_object('id', v_id, 'at', now(), 'by', v_by, 'text', coalesce(p_text, ''))
    || case when v_reply_to is not null then jsonb_build_object('reply_to', v_reply_to) else '{}'::jsonb end
    || case when jsonb_array_length(v_attachments) > 0 then jsonb_build_object('attachments', v_attachments) else '{}'::jsonb end;

  update public.tickets
  set replies = coalesce(replies, '[]'::jsonb) || jsonb_build_array(v_comment)
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

-- Keep the same grants the original function had.
revoke all on function public.add_ticket_comment_secure(text, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.add_ticket_comment_secure(text, text, jsonb, text, text, text, text) to service_role;
