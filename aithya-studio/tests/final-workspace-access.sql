begin;
create temp table final_test(tag text primary key,id uuid);
insert into final_test values ('lead',gen_random_uuid()),('peer',gen_random_uuid()),('outsider',gen_random_uuid()),('project',gen_random_uuid()),('milestone',gen_random_uuid());
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role)
select id,'final-test-'||id||'@example.invalid',now(),'{}','authenticated','authenticated' from final_test where tag in('lead','peer','outsider');
insert into public.projects(id,leader_id,name)
select p.id,a.id,'Final workflow test' from final_test p,final_test a where p.tag='project' and a.tag='lead';
insert into public.project_members(project_id,user_id,full_name,status,is_leader)
select p.id,a.id,a.tag,'accepted',a.tag='lead' from final_test p,final_test a where p.tag='project' and a.tag in('lead','peer');
insert into public.user_skills(project_id,user_id,category,skill_name,self_assessed_level)
select p.id,a.id,'General','React','advanced' from final_test p,final_test a where p.tag='project' and a.tag in('lead','peer');
insert into public.milestones(id,project_id,name,due)
select m.id,p.id,'Prototype',current_date+2 from final_test m,final_test p where p.tag='project' and m.tag='milestone';
grant select,insert on final_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from final_test where tag='lead'),true);
insert into final_test select 'proposal',public.propose_studio_timeline((select id from final_test where tag='project'),(select id from final_test where tag='milestone'),current_date+3,(select id from final_test where tag='peer'));
insert into public.studio_standups(project_id,day,done,next) select id,current_date,'Reviewed brief','Draft tasks' from final_test where tag='project';
insert into public.studio_item_briefs(project_id,item_key,studied) select id,'case',true from final_test where tag='project';
select set_config('request.jwt.claim.sub',(select id::text from final_test where tag='peer'),true);
do $$ begin
 if exists(select from public.studio_item_briefs where project_id=(select id from final_test where tag='project')) then raise exception 'Private study notes leaked';end if;
 begin perform public.pin_studio_work((select id from final_test where tag='project'),(select id from final_test where tag='lead'),'Invalid pin','React',2);raise exception 'Member pinned for a teammate';exception when others then if sqlerrm='Member pinned for a teammate' then raise;end if;end;
 begin perform public.pin_studio_work((select id from final_test where tag='project'),auth.uid(),'Invalid field','Pitching',2);raise exception 'Unregistered field allowed';exception when others then if sqlerrm='Unregistered field allowed' then raise;end if;end;
end $$;
select public.pin_studio_work((select id from final_test where tag='project'),auth.uid(),'Pinned UI','React',4);
select set_config('request.jwt.claim.sub',(select id::text from final_test where tag='outsider'),true);
do $$ begin
 if exists(select from public.studio_timeline_proposals where project_id=(select id from final_test where tag='project')) then raise exception 'Timeline proposal leaked';end if;
 begin perform public.respond_studio_timeline((select id from final_test where tag='proposal'),true);raise exception 'Outsider approved';exception when others then if sqlerrm='Outsider approved' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from final_test where tag='peer'),true);
select public.respond_studio_timeline((select id from final_test where tag='proposal'),true);
select public.respond_studio_timeline((select id from final_test where tag='proposal'),true);
do $$ begin
 if not exists(select from public.milestones where id=(select id from final_test where tag='milestone') and due=current_date+3) then raise exception 'Milestone did not move';end if;
 begin perform public.close_studio_report((select id from final_test where tag='project'));raise exception 'Peer closed report';exception when others then if sqlerrm='Peer closed report' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from final_test where tag='lead'),true);
select public.close_studio_report((select id from final_test where tag='project'));
select public.close_studio_report((select id from final_test where tag='project'));
do $$ begin
 if (select count(*) from public.studio_reports where project_id=(select id from final_test where tag='project'))<>1 then raise exception 'Duplicate report';end if;
 if (select count(*) from public.studio_portfolio_history where project_id=(select id from final_test where tag='project'))<>1 then raise exception 'Portfolio privacy failed';end if;
end $$;
rollback;
select 'PASS: private study notes, pin authorization, timeline approval scope and replay, closed report replay, and private portfolio history';
