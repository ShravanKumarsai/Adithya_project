begin;
create temporary table test_ids(label text primary key,id uuid);
insert into test_ids values('owner',gen_random_uuid()),('member',gen_random_uuid()),('outsider',gen_random_uuid()),('draft',gen_random_uuid());
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role)
select id,'aithya-test-'||id||'@example.invalid',now(),'{"full_name":"Test member"}','authenticated','authenticated' from test_ids where label in ('owner','member','outsider');
grant select,insert,update on test_ids to authenticated;
create temporary table test_tokens(token text);
grant select,insert on test_tokens to authenticated;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner'),true);
set local role authenticated;
select public.save_project_draft((select id from test_ids where label='draft'),'{"project":{"name":"Temporary test project","problem_statement":"Test RLS","start_date":"2026-11-21","submission_deadline":"2026-12-21","expected_deliverables":["Demo"]},"requirements":{},"ai":{},"members":[]}',0);
insert into test_ids select 'project',public.publish_project_draft((select id from test_ids where label='draft'));
do $$ begin
 if public.publish_project_draft((select id from test_ids where label='draft'))<>(select id from test_ids where label='project') then raise exception 'Duplicate publication';end if;
 if (select count(*) from public.project_members where project_id=(select id from test_ids where label='project'))<>1 then raise exception 'Leader membership missing';end if;
end $$;
insert into test_ids select 'membership',public.add_project_member((select id from test_ids where label='project'),'Invited member',(select 'aithya-test-'||id||'@example.invalid' from test_ids where label='member'),'Developer');
insert into test_tokens select public.issue_member_invitation((select id from test_ids where label='membership'));
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='outsider'),true);
do $$ begin
 if exists(select 1 from public.projects where id=(select id from test_ids where label='project')) then raise exception 'Project privacy failed';end if;
 if exists(select 1 from public.project_drafts where id=(select id from test_ids where label='draft')) then raise exception 'Draft privacy failed';end if;
 begin
  perform public.accept_member_invitation((select token from test_tokens),true);
  raise exception 'Wrong email accepted';
 exception when others then if SQLERRM='Wrong email accepted' then raise; end if;end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='member'),true);
select public.accept_member_invitation((select token from test_tokens),false);
select public.accept_member_invitation((select token from test_tokens),true);
do $$ begin
 if not exists(select 1 from public.projects where id=(select id from test_ids where label='project')) then raise exception 'Membership access failed';end if;
 begin perform public.accept_member_invitation((select token from test_tokens),true);raise exception 'Token reused';exception when others then if SQLERRM='Token reused' then raise;end if;end;
end $$;
select public.save_member_onboarding((select id from test_ids where label='project'),'{"full_name":"Invited member","interests":["UI"],"availability":"8 hours"}','[{"category":"Frontend","skill_name":"React","proficiency":"intermediate","evidence":"Example work"}]');
insert into public.member_availability(project_id,weekly_hours) values((select id from test_ids where label='project'),8);
insert into public.learning_goals(project_id,title) values((select id from test_ids where label='project'),'Learn RLS');
insert into public.project_tasks(project_id,title,owner_id) values((select id from test_ids where label='project'),'Verify access',(select id from test_ids where label='member'));
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner'),true);
do $$ begin
 if exists(select 1 from public.learning_goals where project_id=(select id from test_ids where label='project')) then raise exception 'Personal learning leaked';end if;
end $$;
select public.verify_project_member_skill((select id from test_ids where label='project'),(select id from public.user_skills where project_id=(select id from test_ids where label='project')),'intermediate','Reviewed example work');
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='member'),true);
select public.save_member_onboarding((select id from test_ids where label='project'),'{"full_name":"Invited member"}','[{"category":"Frontend","skill_name":"React","proficiency":"advanced","evidence":"Updated work"}]');
do $$ begin
 if not exists(select 1 from public.user_skills where project_id=(select id from test_ids where label='project') and verified_level='intermediate') then raise exception 'Verification lost on profile edit';end if;
 if not exists(select 1 from public.project_activity where project_id=(select id from test_ids where label='project')) then raise exception 'History missing';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='member'),true);
do $$ begin
 begin
  perform public.save_complete_member_profile(
   (select id from test_ids where label='project'),
   '{"full_name":"Should Roll Back"}',
   '[{"category":"Frontend","skill_name":"React","proficiency":"advanced"}]',
   '{"weekly_hours":200}'
  );
  raise exception 'Invalid hours accepted';
 exception when check_violation then null;
 end;
 if exists(select 1 from public.profiles where id=auth.uid() and full_name='Should Roll Back') then raise exception 'Partial profile save';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner'),true);
insert into storage.objects(bucket_id,name) values('project-documents',(select id::text from test_ids where label='project')||'/access-check.txt');
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='member'),true);
do $$ begin
 if not exists(select 1 from storage.objects where name=(select id::text from test_ids where label='project')||'/access-check.txt') then raise exception 'Member document read failed';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='outsider'),true);
do $$ begin
 if exists(select 1 from storage.objects where name=(select id::text from test_ids where label='project')||'/access-check.txt') then raise exception 'Document leaked';end if;
 if exists(select 1 from public.project_tasks where project_id=(select id from test_ids where label='project')) then raise exception 'Tasks leaked';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner'),true);
insert into test_ids select 'pending',public.add_project_member((select id from test_ids where label='project'),'Pending tester','','Tester');
insert into test_tokens select public.issue_member_invitation((select id from test_ids where label='pending'));
select public.revoke_member_invitation((select id from public.invitations where project_member_id=(select id from test_ids where label='pending') and claim_status='pending'));
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='outsider'),true);
do $$ declare t record;begin
 for t in select token from test_tokens loop
 begin perform public.accept_member_invitation(t.token,false);raise exception 'Revoked or claimed token accepted';
 exception when others then if SQLERRM='Revoked or claimed token accepted' then raise;end if;end;
 end loop;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner'),true);
with m as (insert into public.project_messages(project_id,kind,body,task) select id,'task','Proposal',jsonb_build_object('to',(select id from test_ids where label='member'),'title','Atomic proposal','hours',2,'skill','React','state','proposed') from test_ids where label='project' returning id)
insert into test_ids select 'proposal',id from m;
with m as (insert into public.project_messages(project_id,kind,body,poll) select id,'poll','Choose',array['A','B'] from test_ids where label='project' returning id)
insert into test_ids select 'poll',id from m;
insert into storage.objects(bucket_id,name) select 'team-chat',p.id::text||'/'||m.id::text||'/file' from test_ids p,test_ids m where p.label='project' and m.label='poll';
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='outsider'),true);
do $$ begin
 if exists(select from public.project_messages where id=(select id from test_ids where label='proposal')) or exists(select from storage.objects where bucket_id='team-chat' and name like (select id::text from test_ids where label='project')||'/%') then raise exception 'Chat access leaked';end if;
 begin perform public.accept_proposed_task((select id from test_ids where label='proposal'));raise exception 'Outsider accepted';exception when others then if sqlerrm='Outsider accepted' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='member'),true);
select public.accept_proposed_task((select id from test_ids where label='proposal'));
select public.accept_proposed_task((select id from test_ids where label='proposal'));
select public.cast_project_vote((select id from test_ids where label='poll'),0);
select public.cast_project_vote((select id from test_ids where label='poll'),1);
do $$ begin
 if (select count(*) from project_tasks where project_id=(select id from test_ids where label='project') and title='Atomic proposal')<>1 then raise exception 'Duplicate task';end if;
 if (select count(*) from poll_votes where message_id=(select id from test_ids where label='poll') and option=1 and user_id=auth.uid())<>1 then raise exception 'Vote change failed';end if;
 begin insert into poll_votes(message_id,user_id,option) select p.id,u.id,0 from test_ids p,test_ids u where p.label='poll' and u.label='owner';raise exception 'Impersonated voter';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: draft publishing idempotency, membership, invitation email binding, one-time claims, profile edits, personal learning isolation, verification retention, history, atomic profile rollback, document isolation, and revoked invitations' as result;
