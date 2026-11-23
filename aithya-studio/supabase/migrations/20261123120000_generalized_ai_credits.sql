alter table public.studio_claude_connections
  add column provider text not null default 'claude' check(provider in ('claude','codex')),
  drop constraint studio_claude_connections_project_id_user_id_key,
  add unique(project_id,user_id,provider);
alter table public.studio_claude_windows
  drop constraint studio_claude_windows_window_key_check,
  add check(window_key in ('five_hour','seven_day','primary','secondary'));

create or replace function aithya_private.claude_reset_notifications(p_connection uuid default null)
returns void language sql set search_path='' as $$
  with due as (
    update public.studio_claude_windows w
       set notified_at=now()
      from public.studio_claude_connections c
     where c.id=w.connection_id and (p_connection is null or c.id=p_connection)
       and w.reset_at<=now() and w.notified_at is null
    returning c.project_id,c.user_id,w.window_key,w.reset_at,w.used,c.provider
  )
  insert into public.project_activity(project_id,recipient_id,event_type,description)
  select d.project_id,d.user_id,'credits.'||d.provider||'.'||d.window_key,'AI usage window reached its reset time.'
  from due d
  join public.projects p on p.id=d.project_id and p.archived_at is null
  join public.project_members m on m.project_id=d.project_id and m.user_id=d.user_id and m.status='accepted'
  left join public.studio_member_details pref on pref.project_id=d.project_id and pref.user_id=d.user_id
  where d.used>0 and coalesce(pref.credit_alerts,true) and d.reset_at>now()-interval '1 day';
$$;
revoke all on function aithya_private.claude_reset_notifications(uuid) from public,anon,authenticated;

create function public.connect_studio_ai_provider(p_project uuid,p_provider text)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_token text;
  v_connection uuid;
begin
  if p_provider is null or p_provider not in ('claude','codex') then raise exception 'Unknown AI provider.'; end if;
  if auth.uid() is null or not public.has_accepted_project_membership(p_project) then
    raise exception 'Join this project to connect an AI account.' using errcode='42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.studio_claude_connections(project_id,user_id,provider)
  values(p_project,auth.uid(),p_provider)
  on conflict(project_id,user_id,provider) do update set user_id=excluded.user_id
  returning id into v_connection;
  insert into aithya_private.claude_tokens(connection_id,token_hash)
  values(v_connection,extensions.digest(v_token,'sha256'))
  on conflict(connection_id) do update set token_hash=excluded.token_hash;
  return v_token;
end;
$$;
revoke all on function public.connect_studio_ai_provider(uuid,text) from public,anon,authenticated;
grant execute on function public.connect_studio_ai_provider(uuid,text) to authenticated;

create or replace function public.connect_studio_claude(p_project uuid)
returns text language sql security invoker set search_path='' as $$
  select public.connect_studio_ai_provider(p_project,'claude')
$$;

create or replace function public.sync_studio_claude_credits(p_token text,p_windows jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_connection uuid;
  v_provider text;
  v_window record;
  v_used numeric;
  v_reset timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_windows) is distinct from 'object'
     or octet_length(p_windows::text)>512 then return false;
  end if;
  select c.id,c.provider into v_connection,v_provider
    from aithya_private.claude_tokens t
    join public.studio_claude_connections c on c.id=t.connection_id
    join public.project_members m on m.project_id=c.project_id and m.user_id=c.user_id and m.status='accepted'
    join public.projects p on p.id=c.project_id and p.archived_at is null
    where t.token_hash=extensions.digest(p_token,'sha256') for update of c;
  if not found or not exists(
    select from aithya_private.claude_tokens t
    where t.connection_id=v_connection and t.token_hash=extensions.digest(p_token,'sha256')
  ) then return false; end if;

  perform aithya_private.claude_reset_notifications(v_connection);
  for v_window in select * from jsonb_each(p_windows) order by key loop
    if not ((v_provider='claude' and v_window.key in ('five_hour','seven_day'))
      or (v_provider='codex' and v_window.key in ('primary','secondary')))
      or jsonb_typeof(v_window.value->'used') is distinct from 'number'
      or (v_window.value->>'reset') is null
      or (v_window.value->>'reset') !~ '^[0-9]{1,11}$' then continue;
    end if;
    v_used := (v_window.value->>'used')::numeric;
    v_reset := to_timestamp((v_window.value->>'reset')::double precision);
    if v_used not between 0 and 100 or v_reset<=v_now or v_reset>v_now+interval '8 days' then continue; end if;
    insert into public.studio_claude_windows(connection_id,window_key,used,reset_at,synced_at)
    values(v_connection,v_window.key,v_used,v_reset,v_now)
    on conflict(connection_id,window_key) do update
      set used=excluded.used,
          reset_at=excluded.reset_at,synced_at=excluded.synced_at,
          notified_at=case when studio_claude_windows.reset_at=excluded.reset_at then studio_claude_windows.notified_at end
      where studio_claude_windows.reset_at<=excluded.reset_at and studio_claude_windows.synced_at<=excluded.synced_at
        and (studio_claude_windows.reset_at<excluded.reset_at or studio_claude_windows.used<>excluded.used
          or studio_claude_windows.synced_at<=excluded.synced_at-interval '1 minute');
  end loop;
  return true;
end;
$$;
revoke all on function public.sync_studio_claude_credits(text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_studio_claude_credits(text,jsonb) to anon,authenticated;


alter table public.studio_ai_accounts add column reminder_sent_for timestamptz;
create index studio_manual_credit_reset_idx on public.studio_ai_accounts(reset_at) where used>0;
create function aithya_private.manual_credit_reset_notifications()
returns void language sql set search_path='' as $$
  with due as (
    update public.studio_ai_accounts a set reminder_sent_for=a.reset_at
    where a.used>0 and a.reset_at between now()-interval '1 day' and now()
      and a.reminder_sent_for is distinct from a.reset_at
    returning a.project_id,a.user_id
  )
  insert into public.project_activity(project_id,recipient_id,event_type,description)
  select d.project_id,d.user_id,'credits.manual.reset','A manually tracked AI usage window reached its reset time.'
  from due d
  join public.projects p on p.id=d.project_id and p.archived_at is null
  join public.project_members m on m.project_id=d.project_id and m.user_id=d.user_id and m.status='accepted'
  left join public.studio_member_details pref on pref.project_id=d.project_id and pref.user_id=d.user_id
  where coalesce(pref.credit_alerts,true)
$$;
revoke all on function aithya_private.manual_credit_reset_notifications() from public,anon,authenticated;
select cron.schedule('aithya-claude-resets','* * * * *',
  'select aithya_private.claude_reset_notifications(); select aithya_private.manual_credit_reset_notifications()');

create or replace function public.project_notification_feed()
returns table(project_id uuid, project_name text, event_id bigint, event_type text, event_time timestamptz, unread boolean)
language sql stable security invoker set search_path=public as $$
  select p.id, p.name, a.id, a.event_type, a.created_at,
         a.id > coalesce(r.last_read_id, 0) and a.actor_id is distinct from (select auth.uid())
  from public.projects p
  cross join lateral (
    select n.id,n.event_type,n.created_at,n.actor_id
    from public.project_activity n
    where n.project_id=p.id
      and (n.event_type in ('credits.manual.reset','credits.codex.primary','credits.codex.secondary','credits.claude.five_hour','credits.claude.seven_day','milestone.overdue','projects.insert','projects.update','project_members.insert','project_members.update','requirement_items.insert','requirement_items.update','project_tasks.insert','project_tasks.update','project_documents.insert','project_ai_constraints.update','project_plans.insert','project_plans.update') or (n.event_type in ('chat.mention','chat.proposal') and exists(select from project_messages m join project_members me on me.project_id=m.project_id and me.user_id=auth.uid() where m.id::text=n.description and ((m.kind='task' and m.task->>'to'=auth.uid()::text) or position(lower('@'||me.full_name) in lower(m.body))>0))))
    order by n.id desc limit 10
  ) a
  left join public.project_notification_reads r on r.project_id=p.id and r.user_id=(select auth.uid())
  order by a.id desc limit 120
$$;

