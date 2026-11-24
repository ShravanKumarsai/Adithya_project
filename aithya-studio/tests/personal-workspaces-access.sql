begin;
create temp table personal_test(id uuid default gen_random_uuid(), tag text primary key);
insert into personal_test(tag) values ('lead'),('peer'),('outsider'),('project');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role)
select id,'personal-test-'||id||'@example.invalid',now(),'{}','authenticated','authenticated'
from personal_test where tag<>'project';
insert into public.projects(id,leader_id,name)
select p.id,u.id,'Personal workspace permissions test'
from personal_test p,personal_test u where p.tag='project' and u.tag='lead';
insert into public.project_members(project_id,user_id,full_name,status,is_leader)
select p.id,u.id,u.tag,'accepted',u.tag='lead'
from personal_test p,personal_test u where p.tag='project' and u.tag<>'project';
grant select on personal_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from personal_test where tag='lead'),true);
select set_config('aithya.thread',public.start_studio_thread((select id from personal_test where tag='project'),'Local privacy check','React',array[(select id from personal_test where tag='peer')]::uuid[],'Opening message')::text,true);
insert into studio_ai_accounts(project_id,tool,unit,allowance,window_hours,reset_at,shared)
values ((select id from personal_test where tag='project'),'Gemini','Requests',30,1,now()+interval '1 hour',false),
       ((select id from personal_test where tag='project'),'Copilot','Requests',20,1,now()+interval '1 hour',true);
insert into studio_member_details(project_id,expertise) values((select id from personal_test where tag='project'),'Private profile');
select set_config('request.jwt.claim.sub',(select id::text from personal_test where tag='peer'),true);
do $$ begin
  if (select count(*) from studio_thread_messages)<>1 then raise exception 'Participant could not see thread';end if;
  if (select count(*) from studio_ai_accounts)<>1 or exists(select from studio_ai_accounts where not shared) then raise exception 'Private allowance exposed';end if;
  if exists(select from studio_member_details) then raise exception 'Private profile exposed';end if;
end $$;
insert into studio_thread_messages(thread_id,body) values(current_setting('aithya.thread')::uuid,'Verified reply');
select set_config('request.jwt.claim.sub',(select id::text from personal_test where tag='outsider'),true);
do $$ begin
  if exists(select from studio_threads) or exists(select from studio_thread_messages) or exists(select from studio_thread_members) then raise exception 'Thread leaked to another project member';end if;
  begin insert into studio_thread_messages(thread_id,body) values(current_setting('aithya.thread')::uuid,'Blocked reply');raise exception 'Non-participant posted';
  exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS · thread visibility, reply permissions, consent-based credits, and private profiles';
