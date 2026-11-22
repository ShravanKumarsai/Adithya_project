alter table public.project_tasks add column skill text not null default '', add column blocked_by uuid references public.project_tasks(id) on delete set null;
create function public.check_task_dependency() returns trigger language plpgsql set search_path=public as $$
begin
 if new.blocked_by is not null then
  perform 1 from projects where id=new.project_id for update;
  if not exists(select from project_tasks where id=new.blocked_by and project_id=new.project_id) or exists(with recursive chain(id,blocked_by) as (select id,blocked_by from project_tasks where id=new.blocked_by union select t.id,t.blocked_by from project_tasks t join chain c on c.blocked_by=t.id) select from chain where id=new.id) then raise exception 'Choose an earlier task from this project'; end if;
 end if;
 return new;
end $$;
create trigger check_task_dependency before insert or update of blocked_by,project_id on public.project_tasks for each row execute function public.check_task_dependency();
grant delete on public.project_tasks to authenticated;
create policy "Leaders remove tasks" on public.project_tasks for delete to authenticated using(exists(select from public.projects p where p.id=project_id and p.leader_id=auth.uid()));
create table public.project_messages(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,
 author_id uuid default auth.uid() references auth.users on delete set null, kind text not null default 'text' check(kind in ('text','task','poll','ai','standup','decision','lesson','digest')),
 body text not null check(length(trim(body)) between 1 and 6000), task jsonb, poll text[],
 created_at timestamptz not null default now(),unique(id,project_id),
 check(kind<>'poll' or (poll is not null and cardinality(poll) between 2 and 5)),
 check(kind<>'task' or (task is not null and task ?& array['to','title','hours','state'] and task->>'state' in ('proposed','accepted','declined')))
);
create index on public.project_messages(project_id,created_at desc);
create table public.poll_votes(message_id uuid references public.project_messages on delete cascade,user_id uuid default auth.uid() references auth.users on delete cascade,option int not null,primary key(message_id,user_id));
create table public.milestones(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,name text not null check(length(trim(name)) between 1 and 200),due date not null,done boolean not null default false,created_by uuid default auth.uid() references auth.users on delete set null);
create table public.message_files(id uuid primary key default gen_random_uuid(),message_id uuid not null,project_id uuid not null,storage_path text unique not null,name text not null,size int not null check(size between 1 and 10485760),mime text not null,foreign key(message_id,project_id) references public.project_messages(id,project_id) on delete cascade);
create table public.ai_runs(id bigint generated always as identity primary key, project_id uuid not null references public.projects on delete cascade,user_id uuid not null references auth.users on delete cascade,task text not null,model text not null,ok boolean not null,created_at timestamptz not null default now());
grant usage on schema public to aithya_vercel_app;
grant insert on public.ai_runs to aithya_vercel_app;
grant usage on sequence public.ai_runs_id_seq to aithya_vercel_app;
do $$ declare t text; begin foreach t in array array['project_messages','milestones','message_files','ai_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using(public.has_accepted_project_membership(project_id))',t);
end loop; end $$;
create policy runtime_log on public.ai_runs for insert to aithya_vercel_app with check(true);
grant insert(project_id,body,kind,task,poll),update(body),delete on public.project_messages to authenticated;
create policy member_post on public.project_messages for insert to authenticated with check(author_id=auth.uid() and kind<>'digest' and public.has_accepted_project_membership(project_id) and (kind<>'task' or (task->>'state'='proposed' and exists(select from public.project_members m where m.project_id=project_messages.project_id and m.user_id=(task->>'to')::uuid and m.status='accepted'))));
create policy own_edit on public.project_messages for update to authenticated using(public.has_accepted_project_membership(project_id) and author_id=auth.uid() and created_at>now()-interval '5 minutes') with check(author_id=auth.uid());
create policy leader_remove on public.project_messages for delete to authenticated using(exists(select from public.projects p where p.id=project_id and p.leader_id=auth.uid()));
grant insert,update,delete on public.milestones to authenticated;
create policy leader_write on public.milestones for all to authenticated using(exists(select from public.projects p where p.id=project_id and p.leader_id=auth.uid())) with check(exists(select from public.projects p where p.id=project_id and p.leader_id=auth.uid()));
alter table public.poll_votes enable row level security;
grant select,insert,update(option) on public.poll_votes to authenticated;
create policy vote_read on public.poll_votes for select to authenticated using(exists(select from public.project_messages m where m.id=message_id));
create policy vote_insert on public.poll_votes for insert to authenticated with check(user_id=auth.uid() and exists(select from public.project_messages m where m.id=message_id and kind='poll' and option between 0 and cardinality(m.poll)-1));
create policy vote_change on public.poll_votes for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select from public.project_messages m where m.id=message_id and kind='poll' and option between 0 and cardinality(m.poll)-1));
create function public.respond_to_proposal(p_message uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public as $$
declare m public.project_messages;
begin
 select * into m from public.project_messages where id=p_message and kind='task' for update;
 if not found or auth.uid() is null or not public.has_accepted_project_membership(m.project_id) or (m.task->>'to')::uuid is distinct from auth.uid() then raise exception 'Only the assigned teammate can respond';end if;
 if m.task->>'state'<>'proposed' then return;end if;
 if p_accept then insert into public.project_tasks(project_id,title,owner_id,skill,estimated_hours,due_date) values(m.project_id,m.task->>'title',auth.uid(),coalesce(m.task->>'skill',''),greatest(1,least(12,(m.task->>'hours')::numeric)),nullif(m.task->>'due','')::date);end if;
 update public.project_messages set task=jsonb_set(task,'{state}',to_jsonb(case when p_accept then 'accepted'::text else 'declined' end)) where id=m.id;
end $$;
create function public.accept_proposed_task(message_id uuid) returns void language sql set search_path=public as $$select public.respond_to_proposal(message_id,true)$$;
revoke all on function public.respond_to_proposal(uuid,boolean),public.accept_proposed_task(uuid) from public;
grant execute on function public.respond_to_proposal(uuid,boolean),public.accept_proposed_task(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('team-chat','team-chat',false,15728640);
create policy chat_object_read on storage.objects for select to authenticated using(bucket_id='team-chat' and public.has_accepted_project_membership(((storage.foldername(name))[1])::uuid));
create policy chat_object_put on storage.objects for insert to authenticated with check(bucket_id='team-chat' and exists(select from public.project_messages m where m.id::text=(storage.foldername(name))[2] and m.project_id::text=(storage.foldername(name))[1] and m.author_id=auth.uid()));
create policy chat_object_cleanup on storage.objects for delete to authenticated using(bucket_id='team-chat' and owner_id=auth.uid()::text);
grant insert on public.message_files to authenticated;
create policy attach_own on public.message_files for insert to authenticated with check(exists(select from public.project_messages m where m.id=message_id and m.author_id=auth.uid() and storage_path like m.project_id::text||'/'||m.id::text||'/%'));
alter publication supabase_realtime add table public.project_messages,public.poll_votes,public.message_files;
create trigger milestone_history after insert or update on public.milestones for each row execute function public.log_project_change();
alter table public.projects add column digest_time time, add column submission_evidence jsonb not null default '{}';
create function public.chat_notification_log() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.kind='task' or position('@' in new.body)>0 then
 insert into project_activity(project_id,actor_id,event_type,description) values(new.project_id,new.author_id,case when new.kind='task' then 'chat.proposal' else 'chat.mention' end,new.id::text);
 end if; return new;
end $$;
create trigger chat_alert after insert on public.project_messages for each row execute function public.chat_notification_log();
create extension if not exists pg_cron;
create function public.studio_clock_events() returns void language plpgsql security definer set search_path=public as $$
begin
 insert into project_messages(project_id,kind,body)
 select p.id,'digest','Yesterday: '||(select count(*) from project_activity a where a.project_id=p.id and a.created_at>=current_date-1 and a.created_at<current_date and a.event_type='project_tasks.update')||' task updates. Blocked now: '||(select count(*) from project_tasks t join project_tasks b on b.id=t.blocked_by where t.project_id=p.id and t.status<>'done' and b.status<>'done')||'. Next: '||coalesce((select title from project_tasks t where t.project_id=p.id and t.status<>'done' order by due_date nulls last,created_at limit 1),'review submission evidence') from projects p where archived_at is null and digest_time is not null and digest_time<=current_time::time and not exists(select from project_messages m where m.project_id=p.id and m.kind='digest' and m.created_at>=current_date);
 insert into project_activity(project_id,event_type,description) select m.project_id,'milestone.overdue',m.id::text from milestones m join projects p on p.id=m.project_id where not done and due<current_date and p.archived_at is null and not exists(select from project_activity a where a.project_id=m.project_id and a.event_type='milestone.overdue' and a.description=m.id::text);
end $$;
revoke all on function public.studio_clock_events() from public,anon,authenticated;
select cron.schedule('aithya-team-digests','* * * * *','select public.studio_clock_events()');
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
      and (n.event_type in ('milestone.overdue','projects.insert','projects.update','project_members.insert','project_members.update','requirement_items.insert','requirement_items.update','project_tasks.insert','project_tasks.update','project_documents.insert','project_ai_constraints.update','project_plans.insert','project_plans.update') or (n.event_type in ('chat.mention','chat.proposal') and exists(select from project_messages m join project_members me on me.project_id=m.project_id and me.user_id=auth.uid() where m.id::text=n.description and ((m.kind='task' and m.task->>'to'=auth.uid()::text) or position(lower('@'||me.full_name) in lower(m.body))>0))))
    order by n.id desc limit 10
  ) a
  left join public.project_notification_reads r on r.project_id=p.id and r.user_id=(select auth.uid())
  order by a.id desc limit 120
$$;

create function public.cast_project_vote(p_message uuid,p_option int) returns void
language sql security invoker set search_path=public as $$
 insert into public.poll_votes(message_id,user_id,option) values(p_message,auth.uid(),p_option)
 on conflict(message_id,user_id) do update set option=excluded.option
$$;
revoke all on function public.cast_project_vote(uuid,int) from public;
grant execute on function public.cast_project_vote(uuid,int) to authenticated;
