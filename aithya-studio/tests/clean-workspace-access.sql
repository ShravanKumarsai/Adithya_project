begin;
create temp table clean_test(tag text primary key,id uuid);
insert into clean_test values ('lead',gen_random_uuid()),('peer',gen_random_uuid()),('outsider',gen_random_uuid()),('project',gen_random_uuid()),('task',gen_random_uuid());
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role)
select id,'clean-test-'||id||'@example.invalid',now(),'{}','authenticated','authenticated' from clean_test where tag in('lead','peer','outsider');
insert into public.projects(id,leader_id,name)
select p.id,a.id,'Transactional workspace test' from clean_test p,clean_test a where p.tag='project' and a.tag='lead';
insert into public.project_members(project_id,user_id,full_name,status,is_leader)
select p.id,a.id,a.tag,'accepted',a.tag='lead' from clean_test p,clean_test a where p.tag='project' and a.tag in('lead','peer');
grant select,insert on clean_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from clean_test where tag='lead'),true);
insert into clean_test select 'thread',public.start_studio_thread(
 (select id from clean_test where tag='project'),'Fixture','Testing',array[(select id from clean_test where tag='peer')],'Private sample');
insert into public.studio_work_log(project_id,minutes) select id,45 from clean_test where tag='project';
insert into public.project_tasks(id,project_id,title,status)
select t.id,p.id,'Test task','open' from clean_test t,clean_test p where t.tag='task' and p.tag='project';
update public.project_tasks set status='done' where id=(select id from clean_test where tag='task');
do $$ begin
 if not exists(select from public.project_tasks where id=(select id from clean_test where tag='task') and completed_at is not null) then raise exception 'Completion timestamp missing';end if;
end $$;
insert into public.studio_ai_accounts(project_id,tool,unit,allowance,used,window_hours,reset_at,shared)
select id,'ChatGPT','Messages',100,10,3,now()+interval '3 hours',false from clean_test where tag='project';
select set_config('request.jwt.claim.sub',(select id::text from clean_test where tag='peer'),true);
do $$ begin
 if not exists(select from public.studio_thread_messages where thread_id=(select id from clean_test where tag='thread')) then raise exception 'Participant could not read private thread';end if;
 if exists(select from public.studio_ai_usage_windows w join public.studio_ai_accounts a on a.id=w.account_id where a.project_id=(select id from clean_test where tag='project')) then raise exception 'Private usage visible';end if;
 if not exists(select from public.studio_work_log where project_id=(select id from clean_test where tag='project') and minutes=45) then raise exception 'Shared time missing';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from clean_test where tag='lead'),true);
update public.studio_ai_accounts set shared=true,used=5,reset_at=reset_at+interval '3 hours' where project_id=(select id from clean_test where tag='project');
insert into storage.objects(bucket_id,name) select 'studio-direct',t.id||'/'||p.id||'/sample.txt' from clean_test t,clean_test p where t.tag='thread' and p.tag='lead';
select set_config('request.jwt.claim.sub',(select id::text from clean_test where tag='peer'),true);
do $$ begin
 if (select sum(w.used) from public.studio_ai_usage_windows w join public.studio_ai_accounts a on a.id=w.account_id where a.project_id=(select id from clean_test where tag='project')) is distinct from 15::bigint then raise exception 'Shared usage history incorrect';end if;
 if not exists(select from storage.objects where bucket_id='studio-direct' and name like (select id::text from clean_test where tag='thread')||'/%') then raise exception 'Participant attachment unavailable';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from clean_test where tag='outsider'),true);
do $$ begin
 if exists(select from public.studio_thread_messages where thread_id=(select id from clean_test where tag='thread'))
 or exists(select from public.studio_work_log where project_id=(select id from clean_test where tag='project'))
 or exists(select from public.studio_ai_accounts where project_id=(select id from clean_test where tag='project'))
 or exists(select from storage.objects where bucket_id='studio-direct' and name like (select id::text from clean_test where tag='thread')||'/%')
 then raise exception 'Project data leaked to an outsider';end if;
end $$;
rollback;
select 'PASS: completion tracking, work logs, private threads and files, usage privacy, and rollover totals';
