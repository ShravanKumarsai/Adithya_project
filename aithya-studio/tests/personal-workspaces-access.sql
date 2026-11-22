begin;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
insert into projects(id,leader_id) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into project_members(project_id,user_id,full_name,status,is_leader)
select '20000000-0000-4000-8000-000000000001',id,'Test member','accepted',id='10000000-0000-4000-8000-000000000001' from auth.users;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('aithya.thread',public.start_studio_thread('20000000-0000-4000-8000-000000000001','Local privacy check','React',array['10000000-0000-4000-8000-000000000002']::uuid[],'Opening message')::text,true);
insert into studio_ai_accounts(project_id,tool,unit,allowance,window_hours,reset_at,shared)
values ('20000000-0000-4000-8000-000000000001','Gemini','Requests',30,1,now()+interval '1 hour',false),
       ('20000000-0000-4000-8000-000000000001','Copilot','Requests',20,1,now()+interval '1 hour',true);
insert into studio_member_details(project_id,expertise) values('20000000-0000-4000-8000-000000000001','Private profile');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from studio_thread_messages)<>1 then raise exception 'Participant could not see thread';end if;
  if (select count(*) from studio_ai_accounts)<>1 or exists(select from studio_ai_accounts where not shared) then raise exception 'Private allowance exposed';end if;
  if exists(select from studio_member_details) then raise exception 'Private profile exposed';end if;
  begin
    perform public.transfer_studio_lead('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');
    raise exception 'Non-lead transferred project';
  exception when others then if sqlerrm='Non-lead transferred project' then raise;end if;end;
end $$;
insert into studio_thread_messages(thread_id,body) values(current_setting('aithya.thread')::uuid,'Verified reply');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select from studio_threads) or exists(select from studio_thread_messages) or exists(select from studio_thread_members) then raise exception 'Thread leaked to another project member';end if;
  begin insert into studio_thread_messages(thread_id,body) values(current_setting('aithya.thread')::uuid,'Blocked reply');raise exception 'Non-participant posted';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.transfer_studio_lead('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
do $$ begin
  if (select leader_id from projects where id='20000000-0000-4000-8000-000000000001')<>'10000000-0000-4000-8000-000000000002' then raise exception 'Transfer did not persist';end if;
end $$;
rollback;
select 'PASS · thread visibility, reply permissions, consent-based credits, private profiles and leadership transfer';
