create table if not exists public.studio_account_profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  intake jsonb not null check (jsonb_typeof(intake) = 'object' and octet_length(intake::text) <= 8000),
  saved_at timestamptz not null default now()
);
alter table public.studio_account_profiles enable row level security;
grant select, insert, update on public.studio_account_profiles to authenticated;
drop policy if exists studio_profile_self on public.studio_account_profiles;
create policy studio_profile_self on public.studio_account_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.project_members add column onboarding_role_suggestion text;

alter table public.project_tasks add column priority text not null default 'normal'
  check (priority in ('urgent','high','normal','low'));
alter table public.projects add column if not exists intake_roles text[] not null default '{}',
  add column studio_intake_applied boolean not null default false;

create or replace function public.approve_studio_intake(p_id uuid, p_content jsonb, p_revision integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare project uuid; applied uuid; drafts jsonb := p_content->'work';
begin
  select d.published_project_id into project from public.project_drafts d where d.id=p_id and d.user_id=(select auth.uid());
  if project is not null then return project; end if;
  project := public.approve_portal_project(p_id,p_content,p_revision);
  update public.projects p set
    studio_intake_applied=true,
    intake_roles=array(
      select left(trim(line),100) from jsonb_array_elements_text(
        case when jsonb_typeof(drafts->'roles')='array' then drafts->'roles' else '[]' end
      ) line where trim(line)<>'' limit 12
    )
  where p.id=project and p.leader_id=(select auth.uid()) and not p.studio_intake_applied returning p.id into applied;
  if applied is null then return project; end if;
  insert into public.project_tasks(project_id,title)
  select project,left(trim(line),200) from jsonb_array_elements_text(
    case when jsonb_typeof(drafts->'tasks')='array' then drafts->'tasks' else '[]' end
  ) line where trim(line)<>'' limit 25;
  insert into public.milestones(project_id,name,due)
  select project,left(trim(substring(line from position('|' in line)+1)),200),trim(split_part(line,'|',1))::date
  from jsonb_array_elements_text(
    case when jsonb_typeof(drafts->'milestones')='array' then drafts->'milestones' else '[]' end
  ) line where line ~ '^\d{4}-\d{2}-\d{2}\s+\|\s+.+$'
    and pg_input_is_valid(trim(split_part(line,'|',1)), 'date') limit 12;
  return project;
end;
$$;

create function public.issue_studio_join_link(p_project uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare slot uuid;
begin
  slot := public.add_project_member(p_project,'Invite ' || left(gen_random_uuid()::text,8),null,'Team member');
  return public.issue_member_invitation(slot);
end;
$$;

create function aithya_private.claim_studio_join_link(p_token text, p_share_profile boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  who uuid := auth.uid();
  accepted jsonb;
  intake jsonb;
  account_name text;
begin
  if who is null then raise exception 'Sign in to accept the invitation'; end if;
  accepted := public.accept_member_invitation(p_token,true);
  if p_share_profile then select s.intake into intake from public.studio_account_profiles s where s.user_id=who; end if;
  select nullif(trim(full_name),'') into account_name from public.profiles where id=who;
  update public.project_members m set
    full_name=case when m.full_name ~ '^Invite [a-f0-9]{8}$' then coalesce(account_name,'Teammate') else m.full_name end,
    preliminary_skills=case when coalesce(intake->>'skills','')<>'' then array(
      select left(trim(skill),100) from regexp_split_to_table(intake->>'skills', '([,;]|\n)+') skill where trim(skill)<>'' limit 24
    ) else m.preliminary_skills end,
    onboarding_role_suggestion=left(nullif(split_part(intake->>'interests', E'\n', 1),''),120)
  where m.project_id=(accepted->>'project_id')::uuid and m.user_id=who and m.status='accepted';
  return accepted;
end;
$$;

create function public.claim_studio_join_link(p_token text, p_share_profile boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select aithya_private.claim_studio_join_link(p_token,p_share_profile);
$$;

revoke all on function public.approve_studio_intake(uuid,jsonb,integer), public.issue_studio_join_link(uuid),
  aithya_private.claim_studio_join_link(text,boolean), public.claim_studio_join_link(text,boolean) from public,anon;
grant execute on function public.approve_studio_intake(uuid,jsonb,integer), public.issue_studio_join_link(uuid),
  aithya_private.claim_studio_join_link(text,boolean), public.claim_studio_join_link(text,boolean) to authenticated;

-- Major task and report activity is generated from the affected row.
create function public.studio_record_high_priority_completion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='done' and old.status is distinct from new.status and new.priority in ('high','urgent') then
    insert into public.project_activity(project_id,actor_id,event_type,description)
    values(new.project_id,auth.uid(),'task.major.completed',new.title);
  end if;
  return new;
end;
$$;
revoke all on function public.studio_record_high_priority_completion() from public,anon,authenticated;
create trigger studio_record_high_priority_completion after update of status on public.project_tasks
for each row execute function public.studio_record_high_priority_completion();

create function public.studio_record_member_join() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='accepted' and old.status is distinct from new.status then
    insert into public.project_activity(project_id,actor_id,event_type,description)
      values(new.project_id,new.user_id,'team.member.joined',new.full_name);
  end if;
  return new;
end;
$$;
revoke all on function public.studio_record_member_join() from public,anon,authenticated;
create trigger studio_record_member_join after update of status on public.project_members
for each row execute function public.studio_record_member_join();

create function public.studio_record_milestone_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.state='approved' and old.state is distinct from new.state then
    insert into public.project_activity(project_id,actor_id,event_type,description)
      values(new.project_id,auth.uid(),'milestone.approved','Timeline change approved');
  end if;
  return new;
end;
$$;
revoke all on function public.studio_record_milestone_approval() from public,anon,authenticated;
create trigger studio_record_milestone_approval after update of state on public.studio_timeline_proposals
for each row execute function public.studio_record_milestone_approval();

alter table public.studio_reports add column if not exists delivery jsonb not null default '{}'
  check (jsonb_typeof(delivery)='object' and octet_length(delivery::text)<=28000);

create function aithya_private.publish_studio_delivery(p_project uuid, p_delivery jsonb)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare closed timestamptz; already_closed boolean;
begin
  perform 1 from public.projects where id=p_project and leader_id=auth.uid() for update;
  if not found or not public.has_accepted_project_membership(p_project) then raise exception 'Only the project lead can publish the report'; end if;
  select exists(select 1 from public.studio_reports where project_id=p_project and delivery<>'{}') into already_closed;
  closed := public.close_studio_report(p_project);
  if already_closed then return closed; end if;
  update public.studio_reports set delivery=p_delivery where project_id=p_project;
  insert into public.project_activity(project_id,actor_id,event_type,description)
    values(p_project,auth.uid(),'report.closed','Final report published');
  return closed;
end;
$$;
create function public.publish_studio_delivery(p_project uuid, p_delivery jsonb)
returns timestamptz language sql security invoker set search_path='' as $$
  select aithya_private.publish_studio_delivery(p_project,p_delivery);
$$;
revoke all on function public.publish_studio_delivery(uuid,jsonb), aithya_private.publish_studio_delivery(uuid,jsonb) from public,anon;
grant execute on function public.publish_studio_delivery(uuid,jsonb), aithya_private.publish_studio_delivery(uuid,jsonb) to authenticated;

create or replace function public.project_notification_feed()
returns table(project_id uuid, project_name text, event_id bigint, event_type text, event_time timestamptz, unread boolean)
language sql stable security invoker set search_path='' as $$
  select p.id, p.name, a.id, a.event_type, a.created_at,
    a.id > coalesce(r.last_read_id,0) and a.actor_id is distinct from (select auth.uid())
  from public.projects p
  cross join lateral (
    select n.id,n.event_type,n.created_at,n.actor_id
    from public.project_activity n
    where n.project_id=p.id and (
      n.event_type in ('credits.manual.reset','credits.codex.primary','credits.codex.secondary','credits.claude.five_hour',
        'credits.claude.seven_day','milestone.overdue','milestone.approved','team.member.joined','task.major.completed',
        'report.closed','projects.insert','requirement_items.insert','requirement_items.update','project_documents.insert',
        'project_ai_constraints.update','project_plans.insert','project_plans.update')
      or (n.event_type in ('chat.mention','chat.proposal') and exists (
        select 1 from public.project_messages m join public.project_members me
          on me.project_id=m.project_id and me.user_id=(select auth.uid())
        where m.project_id=p.id and m.id::text=n.description and (
          (m.kind='task' and m.task->>'to'=(select auth.uid())::text)
          or position(lower('@'||me.full_name) in lower(m.body))>0
        )
      ))
    )
    order by n.id desc limit 10
  ) a
  left join public.project_notification_reads r on r.project_id=p.id and r.user_id=(select auth.uid())
  order by a.id desc limit 120
$$;
