-- Run against a migrated project. The fixture is rolled back.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('d4af0000-1111-4000-8000-000000000001','portal-lead@example.test','{"full_name":"Portal Lead"}'),
       ('d4af0000-1111-4000-8000-000000000002','portal-other@example.test','{"full_name":"Portal Other"}');

set local role authenticated;
select set_config('request.jwt.claim.sub','d4af0000-1111-4000-8000-000000000001',true);

do $$
declare
  proposal uuid := 'd4af0000-2111-4000-8000-000000000001';
  payload jsonb := '{"project":{"name":"Portal verification"},"requirements":{},"ai":{},"members":[]}';
  p uuid;
  task uuid;
  other_project uuid;
  bulletin uuid;
  latest bigint;
begin
  p := public.approve_portal_project(proposal, payload, 0);
  if p is null or public.approve_portal_project(proposal, payload, 0) is distinct from p then
    raise exception 'project approval is not idempotent';
  end if;
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
end $$;

rollback;
