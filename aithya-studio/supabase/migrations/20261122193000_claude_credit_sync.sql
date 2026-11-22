create table public.studio_claude_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  shared boolean not null default false,
  unique (project_id,user_id)
);
create table public.studio_claude_windows (
  connection_id uuid not null references public.studio_claude_connections on delete cascade,
  window_key text not null check(window_key in ('five_hour','seven_day')),
  used numeric(5,2) not null check(used between 0 and 100),
  reset_at timestamptz not null,
  synced_at timestamptz not null,
  notified_at timestamptz,
  primary key (connection_id,window_key)
);
create index studio_claude_pending_resets on public.studio_claude_windows(reset_at) where notified_at is null;
create schema if not exists aithya_private;
revoke all on schema aithya_private from public, anon, authenticated;
create table aithya_private.claude_tokens (
  connection_id uuid primary key references public.studio_claude_connections on delete cascade,
  token_hash bytea not null unique
);
alter table aithya_private.claude_tokens enable row level security;
alter table public.studio_claude_connections enable row level security;
alter table public.studio_claude_windows enable row level security;
revoke all on public.studio_claude_connections, public.studio_claude_windows from anon, authenticated;
grant select,delete,update(shared) on public.studio_claude_connections to authenticated;
grant select on public.studio_claude_windows to authenticated;
create policy "See visible Claude connections" on public.studio_claude_connections for select to authenticated
  using ((shared or user_id=(select auth.uid())) and public.has_accepted_project_membership(project_id));
create policy "Remove own Claude connection" on public.studio_claude_connections for delete to authenticated
  using (user_id=(select auth.uid()) and public.has_accepted_project_membership(project_id));
create policy "Share own Claude connection" on public.studio_claude_connections for update to authenticated
  using (user_id=(select auth.uid()) and public.has_accepted_project_membership(project_id))
  with check (user_id=(select auth.uid()) and public.has_accepted_project_membership(project_id));
create policy "See visible Claude windows" on public.studio_claude_windows for select to authenticated
  using (exists(select from public.studio_claude_connections c where c.id=connection_id));

alter table public.project_activity add column recipient_id uuid references auth.users on delete cascade;
create policy "Only recipients see targeted activity" on public.project_activity as restrictive for select to authenticated
  using (recipient_id is null or recipient_id=(select auth.uid()));

create function aithya_private.claude_reset_notifications(p_connection uuid default null)
returns void language sql set search_path='' as $$
  with due as (
    update public.studio_claude_windows w
       set notified_at=now()
      from public.studio_claude_connections c
     where c.id=w.connection_id and (p_connection is null or c.id=p_connection)
       and w.reset_at<=now() and w.notified_at is null
    returning c.project_id,c.user_id,w.window_key,w.reset_at,w.used
  )
  insert into public.project_activity(project_id,recipient_id,event_type,description)
  select d.project_id,d.user_id,'credits.claude.'||d.window_key,'Claude usage window reached its reset time.'
  from due d
  join public.projects p on p.id=d.project_id and p.archived_at is null
  join public.project_members m on m.project_id=d.project_id and m.user_id=d.user_id and m.status='accepted'
  left join public.studio_member_details pref on pref.project_id=d.project_id and pref.user_id=d.user_id
  where d.used>0 and coalesce(pref.credit_alerts,true) and d.reset_at>now()-interval '1 day';
$$;
revoke all on function aithya_private.claude_reset_notifications(uuid) from public,anon,authenticated;

create function public.connect_studio_claude(p_project uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_token text;
  v_connection uuid;
begin
  if auth.uid() is null or not public.has_accepted_project_membership(p_project) then
    raise exception 'Join this project to connect Claude.' using errcode='42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.studio_claude_connections(project_id,user_id)
  values(p_project,auth.uid())
  on conflict(project_id,user_id) do update set user_id=excluded.user_id
  returning id into v_connection;
  insert into aithya_private.claude_tokens(connection_id,token_hash)
  values(v_connection,extensions.digest(v_token,'sha256'))
  on conflict(connection_id) do update set token_hash=excluded.token_hash;
  return v_token;
end;
$$;
revoke all on function public.connect_studio_claude(uuid) from public,anon,authenticated;
grant execute on function public.connect_studio_claude(uuid) to authenticated;

create function public.sync_studio_claude_credits(p_token text,p_windows jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_connection uuid;
  v_window record;
  v_used numeric;
  v_reset timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_windows) is distinct from 'object'
     or octet_length(p_windows::text)>512 then return false;
  end if;
  select c.id into v_connection
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
    if v_window.key not in ('five_hour','seven_day')
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

select cron.schedule('aithya-claude-resets','* * * * *','select aithya_private.claude_reset_notifications()');

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
      and (n.event_type in ('credits.claude.five_hour','credits.claude.seven_day','milestone.overdue','projects.insert','projects.update','project_members.insert','project_members.update','requirement_items.insert','requirement_items.update','project_tasks.insert','project_tasks.update','project_documents.insert','project_ai_constraints.update','project_plans.insert','project_plans.update') or (n.event_type in ('chat.mention','chat.proposal') and exists(select from project_messages m join project_members me on me.project_id=m.project_id and me.user_id=auth.uid() where m.id::text=n.description and ((m.kind='task' and m.task->>'to'=auth.uid()::text) or position(lower('@'||me.full_name) in lower(m.body))>0))))
    order by n.id desc limit 10
  ) a
  left join public.project_notification_reads r on r.project_id=p.id and r.user_id=(select auth.uid())
  order by a.id desc limit 120
$$;

