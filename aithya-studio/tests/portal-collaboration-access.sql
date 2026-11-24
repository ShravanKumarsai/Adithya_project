-- Run against a migrated project. The fixture is rolled back.
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
values ('d4af0000-1111-4000-8000-000000000001','portal-lead@example.test','{"full_name":"Portal Lead"}',now()),
       ('d4af0000-1111-4000-8000-000000000002','portal-other@example.test','{"full_name":"Portal Other"}',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','d4af0000-1111-4000-8000-000000000001',true);

do $$
declare
  proposal uuid := 'd4af0000-2111-4000-8000-000000000001';
  payload jsonb := '{"project":{"name":"Portal verification","submission_deadline":"2027-02-03"},"requirements":{},"ai":{},"members":[],"sources":{"project.submission_deadline":{"name":"rulebook.pdf","page":3,"quote":"Submission deadline: 2027-02-03","confidence":"Label match"}}}';
  p uuid;
  task uuid;
  other_project uuid;
  guided_project uuid;
  guided_id uuid := 'd4af0000-2111-4000-8000-000000000003';
  guided jsonb := payload || '{"work":{"tasks":["Rehearse the demo"],"milestones":["2027-02-01 | Checkpoint","2027-02-30 | Invalid"],"roles":["Demo lead"]}}';
  bulletin uuid;
  latest bigint;
  lead uuid := 'd4af0000-1111-4000-8000-000000000001';
  teammate uuid := 'd4af0000-1111-4000-8000-000000000002';
  invitation_token text;
  joined jsonb;
begin
  p := public.approve_portal_project(proposal, payload, 0);
  if p is null or public.approve_portal_project(proposal, payload, 0) is distinct from p then
    raise exception 'project approval is not idempotent';
  end if;
  if public.portal_project_snapshot(p) #>> '{project,rulebook_sources,project.submission_deadline,page}' is distinct from '3'
  then raise exception 'approval did not persist the approved rulebook citation'; end if;
  guided_project := public.approve_studio_intake(guided_id,guided,0);
  if public.approve_studio_intake(guided_id,guided,0) is distinct from guided_project
    or (select count(*) from public.project_tasks where project_id=guided_project and title='Rehearse the demo')<>1
    or (select count(*) from public.milestones where project_id=guided_project and name='Checkpoint')<>1
    or public.portal_project_snapshot(guided_project) #>> '{project,intake_roles,0}' is distinct from 'Demo lead'
  then raise exception 'guided intake failed to persist its approved work'; end if;
  update public.project_tasks set priority='urgent',status='done' where project_id=guided_project;
  if not exists(select from public.project_activity where project_id=guided_project and event_type='task.major.completed')
  then raise exception 'major work completion missing from history'; end if;
  invitation_token := public.issue_studio_join_link(guided_project);
  perform set_config('request.jwt.claim.sub',teammate::text,true);
  insert into public.studio_account_profiles(user_id,intake) values(teammate,'{"skills":"React, SQL","interests":"Demo lead"}');
  joined := public.claim_studio_join_link(invitation_token,true);
  if joined->>'project_id' is distinct from guided_project::text
    or not exists(select from public.project_members where project_id=guided_project and user_id=teammate and status='accepted'
      and 'React'=any(preliminary_skills) and onboarding_role_suggestion='Demo lead')
  then raise exception 'guided invitation did not claim the member with consent'; end if;
  if not exists(select from public.project_notification_feed() where project_id=guided_project and event_type='task.major.completed')
  then raise exception 'team could not see completion notification'; end if;
  perform set_config('request.jwt.claim.sub',lead::text,true);
  if exists(select from public.studio_account_profiles where user_id=teammate)
  then raise exception 'team leader could read another account profile'; end if;
  if not exists(select from public.project_notification_feed() where project_id=guided_project and event_type='team.member.joined')
  then raise exception 'team could not see invitation acceptance'; end if;
  perform public.publish_studio_delivery(guided_project,'{"finalUrl":"https://example.test/demo"}');
  perform public.publish_studio_delivery(guided_project,'{"finalUrl":"https://example.test/retry"}');
  if not exists(select from public.studio_reports where project_id=guided_project and delivery->>'finalUrl'='https://example.test/demo')
    or (select count(*) from public.project_activity where project_id=guided_project and event_type='report.closed')<>1
    or not exists(select from public.studio_portfolio_history where project_id=guided_project and user_id=lead)
  then raise exception 'report publication was not idempotent or did not reach portfolio history'; end if;
  insert into public.project_tasks(project_id,title) values (p,'Prepare the demo') returning id, portal_version into task, latest;
  update public.project_tasks set title='Record the demo' where id=task and portal_version=latest;
  update public.project_tasks set title='Overwrite with a stale edit' where id=task and portal_version=latest;
  if found then raise exception 'stale task update unexpectedly succeeded'; end if;
  insert into public.project_messages(project_id,body,bulletin_type,thread_task)
    values (p,'Blocked on demo footage','blocker',task) returning id into bulletin;
  other_project := public.approve_portal_project('d4af0000-2111-4000-8000-000000000002', payload, 0);
  begin
    insert into public.project_messages(project_id,body,thread_task)
      values (other_project,'Wrong project thread',task);
    raise exception 'cross-project thread insert passed' using errcode='XX000';
  exception when raise_exception then
    if sqlerrm <> 'Choose a task from this project' then raise; end if;
  end;
  perform public.resolve_bulletin_post(bulletin, true);
  if not exists(select 1 from public.project_messages where id=bulletin and resolved_at is not null) then
    raise exception 'leader could not resolve bulletin post';
  end if;
  if (public.portal_project_snapshot(p)->'bulletin'->0->>'id')::uuid is distinct from bulletin then
    raise exception 'snapshot missed bulletin';
  end if;
  perform set_config('request.jwt.claim.sub','d4af0000-1111-4000-8000-000000000002',true);
  if public.portal_project_snapshot(p) is not null then raise exception 'outsider read project snapshot'; end if;
  if exists(select 1 from public.project_messages where id=bulletin) then raise exception 'outsider read bulletin'; end if;
  begin
    perform public.resolve_bulletin_post(bulletin, false);
    raise exception 'outsider resolved bulletin' using errcode='XX000';
  exception when raise_exception then
    if sqlerrm <> 'This post cannot be changed' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',lead::text,true);
  invitation_token := public.issue_member_invitation(public.add_project_member(p,'Portal Other','PORTAL-OTHER@EXAMPLE.TEST','Builder'));
  perform set_config('request.jwt.claim.sub',teammate::text,true);
  perform public.accept_member_invitation(invitation_token, true);
  begin
    perform public.portal_team_action(p,lead,'transfer');
    raise exception 'member transferred leadership' using errcode='XX000';
  exception when raise_exception then
    if sqlerrm <> 'This team action is unavailable' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',lead::text,true);
  update public.project_tasks set owner_id = lead where id = task;
  perform public.portal_team_action(p,teammate,'transfer');
  if public.portal_project_snapshot(p) #>> '{project,leader_id}' is distinct from teammate::text
  then raise exception 'leadership transfer was not recorded'; end if;
  perform public.portal_team_action(p,lead,'leave');
  if public.portal_project_snapshot(p) is not null then raise exception 'former lead retained project access'; end if;
  perform set_config('request.jwt.claim.sub',teammate::text,true);
  if not exists(select from public.project_tasks where id = task and owner_id = teammate)
  then raise exception 'leaving failed to reassign open tasks'; end if;
end $$;

rollback;
