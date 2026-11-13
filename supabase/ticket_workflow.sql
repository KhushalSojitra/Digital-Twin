-- Per-ticket workflow selection.
-- Each ticket already stores its own workflow_version_id / workflow_state. This function
-- lets a ticket be moved onto the latest version of any workflow template: the ticket
-- restarts in that workflow's initial state and the change is recorded in its history.
-- Run this once in the Supabase SQL editor of the project the app is connected to.

create or replace function public.set_ticket_workflow(
  p_ticket_id text,
  p_template_id text,
  p_changed_by text
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.workflow_versions%rowtype;
  v_template_name text;
  v_initial text;
  v_state jsonb;
  v_group text;
  v_status text;
  v_ticket public.tickets%rowtype;
begin
  select * into v_version
  from public.workflow_versions
  where template_id::text = p_template_id
  order by version desc
  limit 1;
  if not found then
    raise exception 'Workflow not found';
  end if;

  select name into v_template_name from public.workflow_templates where id::text = p_template_id;

  v_initial := coalesce(v_version.definition ->> 'initial', v_version.definition -> 'states' -> 0 ->> 'key');
  select s into v_state
  from jsonb_array_elements(v_version.definition -> 'states') as s
  where s ->> 'key' = v_initial
  limit 1;
  if v_state is null then
    raise exception 'Workflow has no initial state';
  end if;

  v_group := coalesce(v_state ->> 'group', 'open');
  v_status := case v_group
    when 'open' then 'to do'
    when 'in_progress' then 'in progress'
    else v_group
  end;

  update public.tickets
  set workflow_version_id = v_version.id,
      workflow_state = v_initial,
      status = v_status,
      history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'by', coalesce(p_changed_by, ''),
          'text', 'Changed workflow to ' || coalesce(v_template_name, 'a new workflow')
        )
      )
  where id::text = p_ticket_id
  returning * into v_ticket;
  if not found then
    raise exception 'Ticket not found';
  end if;

  return v_ticket;
end;
$$;

grant execute on function public.set_ticket_workflow(text, text, text) to anon, authenticated;
