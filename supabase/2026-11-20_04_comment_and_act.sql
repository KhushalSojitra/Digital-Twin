-- A comment and a state change in one database call: both happen or neither does.
create or replace function public.comment_and_act_secure(
  p_ticket_id text, p_action_id text, p_actor text, p_role text,
  p_new_assignee text default null, p_note text default null,
  p_comment_text text default null, p_attachments jsonb default '[]'::jsonb,
  p_comment_id text default null, p_reply_to text default null, p_mentions text[] default null)
returns public.tickets language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if nullif(trim(coalesce(p_comment_text, '')), '') is not null or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 0 then
    perform public.add_ticket_comment_secure(p_ticket_id, coalesce(p_comment_text, ''), coalesce(p_attachments, '[]'::jsonb),
                                             p_actor, p_role, p_comment_id, p_reply_to, p_mentions, null);
  end if;
  return public.apply_workflow_action_secure(p_ticket_id, p_action_id, p_actor, p_role, p_new_assignee, p_note);
end;
$function$;
revoke all on function public.comment_and_act_secure(text, text, text, text, text, text, text, jsonb, text, text, text[]) from public, anon, authenticated;
grant execute on function public.comment_and_act_secure(text, text, text, text, text, text, text, jsonb, text, text, text[]) to service_role;
