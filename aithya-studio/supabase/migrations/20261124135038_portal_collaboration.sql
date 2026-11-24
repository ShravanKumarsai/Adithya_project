alter table public.project_messages
  add column bulletin_type text check (bulletin_type in ('announcement', 'decision', 'blocker', 'question', 'poll')),
  add column resolved_at timestamptz,
  add column thread_task uuid references public.project_tasks(id) on delete set null,
  add constraint bulletin_poll_kind check (bulletin_type is null or (bulletin_type = 'poll') = (kind = 'poll'));

create index if not exists portal_bulletin_recent on public.project_messages(project_id, created_at desc)
  where bulletin_type is not null;
create index if not exists portal_task_messages on public.project_messages(project_id, thread_task, created_at desc)
  where bulletin_type is null;
create index if not exists portal_message_task_reference on public.project_messages(thread_task)
  where thread_task is not null;

grant insert(id, bulletin_type, thread_task) on public.project_messages to authenticated;
grant update(resolved_at) on public.project_messages to authenticated;

create function public.portal_validate_message_task() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.thread_task is not null and not exists (
    select 1 from public.project_tasks t where t.id = new.thread_task and t.project_id = new.project_id
  ) then
    raise exception 'Choose a task from this project';
  end if;
  return new;
end;
$$;
revoke all on function public.portal_validate_message_task() from public;
create trigger portal_validate_message_task before insert or update of thread_task, project_id
on public.project_messages for each row execute function public.portal_validate_message_task();

-- Separate resolve and edit privileges. The trigger prevents an expanded resolve policy
-- from authorizing an edit to a different person's message or bypassing the chat edit window.
create policy portal_bulletin_resolve on public.project_messages
for update to authenticated using (
  bulletin_type is not null and public.has_accepted_project_membership(project_id)
  and (author_id = (select auth.uid()) or exists (
    select 1 from public.projects p where p.id = project_id and p.leader_id = (select auth.uid())
  ))
) with check (
  bulletin_type is not null and public.has_accepted_project_membership(project_id)
  and (author_id = (select auth.uid()) or exists (
    select 1 from public.projects p where p.id = project_id and p.leader_id = (select auth.uid())
  ))
);

create function public.portal_check_message_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.resolved_at is distinct from old.resolved_at and old.bulletin_type is null then
      raise exception 'Only bulletin posts can be resolved';
    end if;
    if new.body is distinct from old.body and (
      old.author_id is distinct from (select auth.uid()) or old.created_at <= now() - interval '5 minutes'
    ) then
      raise exception 'Message editing is closed';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.portal_check_message_update() from public;
create trigger portal_check_message_update before update on public.project_messages
for each row execute function public.portal_check_message_update();

create function public.resolve_bulletin_post(p_id uuid, p_resolved boolean) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.project_messages set resolved_at = case when p_resolved then clock_timestamp() end
  where id = p_id and bulletin_type is not null;
  if not found then raise exception 'This post cannot be changed'; end if;
end;
$$;

create function public.approve_portal_project(p_id uuid, p_content jsonb, p_revision integer) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare published uuid;
begin
  select published_project_id into published from public.project_drafts where id = p_id and user_id = (select auth.uid());
  if published is not null then return published; end if;
  perform public.save_project_draft(p_id, p_content, p_revision);
  return public.publish_project_draft(p_id);
exception when raise_exception then
  select published_project_id into published from public.project_drafts where id = p_id and user_id = (select auth.uid());
  if published is not null then return published; end if;
  raise;
end;
$$;

alter table public.project_tasks add column portal_version bigint not null default 1;
create function public.bump_portal_task_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.portal_version := old.portal_version + 1;
  return new;
end;
$$;
revoke all on function public.bump_portal_task_version() from public;
create trigger bump_portal_task_version before update on public.project_tasks
for each row execute function public.bump_portal_task_version();

create function public.portal_project_snapshot(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'project', to_jsonb(p),
    'members', (select coalesce(jsonb_agg(m order by m.created_at), '[]') from public.project_members m where m.project_id = p.id),
    'requirements', (select coalesce(jsonb_agg(r order by r.created_at), '[]') from public.requirement_items r where r.project_id = p.id),
    'rules', (select to_jsonb(r) from public.project_requirements r where r.project_id = p.id),
    'ai', (select to_jsonb(a) from public.project_ai_constraints a where a.project_id = p.id),
    'skills', (select coalesce(jsonb_agg(s), '[]') from public.user_skills s where s.project_id = p.id),
    'availability', (select coalesce(jsonb_agg(a), '[]') from public.member_availability a where a.project_id = p.id),
    'tasks', (select coalesce(jsonb_agg(t order by t.created_at), '[]') from public.project_tasks t where t.project_id = p.id),
    'milestones', (select coalesce(jsonb_agg(m order by m.due), '[]') from public.milestones m where m.project_id = p.id),
    'documents', (select coalesce(jsonb_agg(d order by d.created_at), '[]') from public.project_documents d where d.project_id = p.id),
    'learning', (select coalesce(jsonb_agg(g order by g.created_at), '[]') from public.learning_goals g where g.project_id = p.id),
    'activity', (select coalesce(jsonb_agg(a order by a.created_at desc), '[]') from (
      select * from public.project_activity where project_id = p.id order by created_at desc limit 40
    ) a),
    'invitations', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc), '[]') from (
      select id, project_member_id, claim_status, expires_at, created_at
      from public.invitations where project_id = p.id and p.leader_id = (select auth.uid())
    ) i),
    'bulletin', (select coalesce(jsonb_agg(b order by b.created_at desc), '[]') from (
      select id, author_id, left(body, 160) as body, created_at, bulletin_type
      from public.project_messages where project_id = p.id and bulletin_type is not null
        and created_at >= now() - interval '7 days'
      order by created_at desc limit 12
    ) b),
    'personalReady', true,
    'portalReady', true
  )
  from public.projects p where p.id = p_id;
$$;

revoke all on function public.approve_portal_project(uuid, jsonb, integer),
  public.portal_project_snapshot(uuid), public.resolve_bulletin_post(uuid, boolean) from public, anon;
grant execute on function public.approve_portal_project(uuid, jsonb, integer),
  public.portal_project_snapshot(uuid), public.resolve_bulletin_post(uuid, boolean) to authenticated;

-- The existing leader-only RLS policy also applies to undo of a first plan.
grant delete on public.project_plans to authenticated;
