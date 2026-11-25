-- Run on an isolated migrated database. All fixtures roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
values ('d4af0000-1111-4000-8000-000000000001','lead@example.test','{"full_name":"Fixture lead"}',now()),
       ('d4af0000-1111-4000-8000-000000000002','member@example.test','{"full_name":"Fixture member"}',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','d4af0000-1111-4000-8000-000000000001',true);
do $$
declare
  lead uuid := 'd4af0000-1111-4000-8000-000000000001';
  member uuid := 'd4af0000-1111-4000-8000-000000000002';
  draft uuid := 'd4af0000-2111-4000-8000-000000000001';
  payload jsonb := '{"project":{"name":"Finished DraftDeck","submission_deadline":"2026-01-25"},"ai":{},"work":{"tasks":["Record the demo"]}}';
  project uuid;
  pair text;
  invite text;
begin
  project := public.approve_studio_intake(draft,payload,0);
  invite := public.issue_member_invitation(public.add_project_member(project,'Fixture member','member@example.test','Developer'));
  pair := public.connect_draftdeck_account_credit('codex');
  if not public.sync_studio_claude_credits(pair,jsonb_build_object('primary',jsonb_build_object('used',25,'reset',floor(extract(epoch from now()+interval '1 hour'))))) then raise exception 'Personal pairing was rejected'; end if;
  if not exists(select from public.studio_claude_windows w join public.studio_claude_connections c on c.id=w.connection_id where c.project_id is null and c.user_id=lead and w.used=25)
  then raise exception 'Personal reading not stored'; end if;
  begin
    perform public.delete_finished_draftdeck_project(project,'Finished DraftDeck');
    raise exception 'Deleted before report' using errcode='XX000';
  exception when raise_exception then
    if sqlerrm <> 'Publish the final report for all participants before deleting' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',member::text,true);
  perform public.accept_member_invitation(invite,true);
  if exists(select from public.studio_claude_connections where project_id is null and user_id=lead)
  then raise exception 'Personal reading exposed to teammate'; end if;
  begin
    perform public.delete_finished_draftdeck_project(project,'Finished DraftDeck');
    raise exception 'Nonleader delete accepted' using errcode='XX000';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',lead::text,true);
  perform public.publish_draftdeck_final_report(project,'{"url":"https://example.test"}');
  perform public.delete_finished_draftdeck_project(project,'Finished DraftDeck');
  if exists(select from public.projects where id=project) then raise exception 'Project survived deletion'; end if;
  if not exists(select from public.studio_portfolio_history h where h.project_id=project and h.user_id=lead and h.final_report->'delivery'->>'url'='https://example.test')
  then raise exception 'Lead report missing'; end if;
  perform set_config('request.jwt.claim.sub',member::text,true);
  if not exists(select from public.studio_portfolio_history h where h.project_id=project and h.user_id=member and h.final_report->'delivery'->>'url'='https://example.test')
  then raise exception 'Participant report missing'; end if;
  if exists(select from public.studio_portfolio_history where project_id=project and user_id=lead) then raise exception 'Private history exposed'; end if;
end $$;
rollback;
