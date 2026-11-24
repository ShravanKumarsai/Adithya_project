alter table public.project_members drop constraint project_members_status_check;
alter table public.project_members add constraint project_members_status_check
  check (status in ('invited', 'accepted', 'removed'));

-- Serialize task assignments with membership changes for the same assignee.
create or replace function public.validate_task_scope() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'A task cannot move between projects';
  end if;
  if new.owner_id is not null and not (
    tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id
    and old.status = 'done' and new.status = 'done'
  ) then
    -- A shared advisory lock serializes assignments with membership changes
    -- without giving project members extra UPDATE privileges on the roster.
    perform pg_advisory_xact_lock(hashtextextended(new.project_id::text || ':' || new.owner_id::text, 0));
    if not exists (select 1 from public.project_members where project_id = new.project_id
      and user_id = new.owner_id and status = 'accepted') then
      raise exception 'Choose an accepted member';
    end if;
  end if;
  if new.requirement_id is not null and not exists (
    select 1 from public.requirement_items where id = new.requirement_id and project_id = new.project_id
  ) then
    raise exception 'Requirement belongs to a different project';
  end if;
  return new;
end;
$$;

create function aithya_private.portal_team_action(
  p_project uuid, p_member uuid, p_action text, p_reassign uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  leader uuid;
begin
  if actor is null then raise exception 'Sign in first'; end if;
  select leader_id into leader from public.projects
    where id = p_project and archived_at is null for update;
  if leader is null or not exists (
    select 1 from public.project_members where project_id = p_project and user_id = actor and status = 'accepted'
  ) then raise exception 'Project unavailable'; end if;

  if (p_action in ('transfer', 'remove') and actor <> leader)
     or (p_action = 'leave' and actor is distinct from p_member)
     or coalesce(p_action, '') not in ('transfer', 'remove', 'leave') then
    raise exception 'This team action is unavailable';
  end if;
  if p_member is null or p_member = leader then
    raise exception 'Transfer leadership before leaving the team';
  end if;
  if not exists (
    select 1 from public.project_members where project_id = p_project and user_id = p_member and status = 'accepted'
  ) then raise exception 'Choose an active teammate'; end if;

  if p_action = 'transfer' then
    update public.project_members set is_leader = false,
      role = case when role = 'Project lead' then 'Team member' else role end
      where project_id = p_project and user_id = leader;
    update public.project_members set is_leader = true, role = 'Project lead'
      where project_id = p_project and user_id = p_member;
    update public.projects set leader_id = p_member where id = p_project;
    return;
  end if;

  p_reassign := coalesce(p_reassign, leader);
  if p_reassign = p_member or not exists (
    select 1 from public.project_members where project_id = p_project and user_id = p_reassign and status = 'accepted'
  ) then raise exception 'Choose another active teammate for open tasks'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_project::text || ':' || p_member::text, 0));
  update public.project_tasks set owner_id = p_reassign
    where project_id = p_project and owner_id = p_member and status <> 'done';
  update public.project_members set status = 'removed'
    where project_id = p_project and user_id = p_member;
end;
$$;

create function public.portal_team_action(
  p_project uuid, p_member uuid, p_action text, p_reassign uuid default null
) returns void
language sql security invoker set search_path = '' as $$
  select aithya_private.portal_team_action(p_project, p_member, p_action, p_reassign);
$$;

grant usage on schema aithya_private to authenticated;
revoke all on function aithya_private.portal_team_action(uuid, uuid, text, uuid),
  public.portal_team_action(uuid, uuid, text, uuid) from public, anon;
grant execute on function aithya_private.portal_team_action(uuid, uuid, text, uuid),
  public.portal_team_action(uuid, uuid, text, uuid) to authenticated;
