alter table public.project_ai_constraints
  add column gemini_planning_allowed boolean not null default false;

create table public.project_notification_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  last_read_id bigint not null check (last_read_id > 0),
  primary key (user_id, project_id)
);
alter table public.project_notification_reads enable row level security;
create policy "Members manage own notification markers" on public.project_notification_reads
  for all to authenticated
  using (user_id = (select auth.uid()) and public.has_accepted_project_membership(project_id))
  with check (user_id = (select auth.uid()) and public.has_accepted_project_membership(project_id));
grant select, insert, update on public.project_notification_reads to authenticated;

create function public.project_notification_feed()
returns table(project_id uuid, project_name text, event_id bigint, event_type text, event_time timestamptz, unread boolean)
language sql stable security invoker set search_path=public as $$
  select p.id, p.name, a.id, a.event_type, a.created_at,
         a.id > coalesce(r.last_read_id, 0) and a.actor_id is distinct from (select auth.uid())
  from public.projects p
  cross join lateral (
    select n.id,n.event_type,n.created_at,n.actor_id
    from public.project_activity n
    where n.project_id=p.id
      and n.event_type in ('projects.insert','projects.update','project_members.insert','project_members.update','requirement_items.insert','requirement_items.update','project_tasks.insert','project_tasks.update','project_documents.insert','project_ai_constraints.update','project_plans.insert','project_plans.update')
    order by n.id desc limit 10
  ) a
  left join public.project_notification_reads r on r.project_id=p.id and r.user_id=(select auth.uid())
  order by a.id desc limit 120
$$;

create function public.mark_project_notifications_read(p_project_id uuid,p_event_id bigint)
returns void language sql security invoker set search_path=public as $$
  insert into public.project_notification_reads(project_id,last_read_id)
  select p_project_id, p_event_id from public.project_activity
  where id=p_event_id and project_id=p_project_id
  on conflict (user_id,project_id) do update
  set last_read_id=greatest(project_notification_reads.last_read_id,excluded.last_read_id)
$$;
revoke all on function public.project_notification_feed(),public.mark_project_notifications_read(uuid,bigint) from public,anon;
grant execute on function public.project_notification_feed(),public.mark_project_notifications_read(uuid,bigint) to authenticated;

create table public.project_plans (
  project_id uuid primary key references public.projects(id) on delete cascade,
  plan jsonb not null check (jsonb_typeof(plan)='object' and octet_length(plan::text)<=18000),
  model text not null check (length(model) between 1 and 80),
  updated_at timestamptz not null default now()
);
alter table public.project_plans enable row level security;
create policy "Members read saved plans" on public.project_plans
  for select to authenticated using (public.has_accepted_project_membership(project_id));
create policy "Leaders save plans" on public.project_plans
  for all to authenticated
  using (exists (select 1 from public.projects p where p.id=project_id and p.leader_id=(select auth.uid()) and p.archived_at is null))
  with check (exists (select 1 from public.projects p where p.id=project_id and p.leader_id=(select auth.uid()) and p.archived_at is null));
grant select,insert,update on public.project_plans to authenticated;
create trigger touch_plan before update on public.project_plans for each row execute function public.touch_updated_at();
create trigger record_plan_activity after insert or update on public.project_plans for each row execute function public.log_project_change();

create table public.portfolios (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  headline text not null default '' check (length(headline)<=160),
  bio text not null default '' check (length(bio)<=1600)
);
create table public.portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  subtitle text not null default '' check (length(subtitle)<=160),
  contribution text not null default '' check (length(contribution)<=1800),
  outcome text not null default '' check (length(outcome)<=1200),
  skills text not null default '' check (length(skills)<=400),
  proof_url text not null default '' check (length(proof_url)<=500 and (proof_url='' or proof_url ~ '^https://')),
  created_at timestamptz not null default now()
);
create index portfolio_entries_user_idx on public.portfolio_entries(user_id,created_at desc);
alter table public.portfolios enable row level security;
alter table public.portfolio_entries enable row level security;
create policy "Own portfolio" on public.portfolios
  for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "Own portfolio entries" on public.portfolio_entries
  for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert,update on public.portfolios to authenticated;
grant select,insert,update,delete on public.portfolio_entries to authenticated;
