alter table public.project_tasks add column completed_at timestamptz;
create function public.stamp_studio_task_completion() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='done' then
    if tg_op='UPDATE' and old.status='done' then new.completed_at:=old.completed_at;
    else new.completed_at:=clock_timestamp(); end if;
  else new.completed_at:=null; end if;
  return new;
end $$;
create trigger stamp_studio_task_completion before insert or update on public.project_tasks
  for each row execute function public.stamp_studio_task_completion();

create table public.studio_work_log(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects on delete cascade,
 user_id uuid not null default auth.uid() references auth.users on delete cascade,
 work_day date not null default current_date,
 minutes integer not null check(minutes between 1 and 1440),
 created_at timestamptz not null default now()
);
create index on public.studio_work_log(project_id,user_id);
alter table public.studio_work_log enable row level security;
create policy read_team_time on public.studio_work_log for select to authenticated
  using(public.has_accepted_project_membership(project_id));
create policy log_own_time on public.studio_work_log for insert to authenticated
  with check(user_id=auth.uid() and work_day<=current_date and public.has_accepted_project_membership(project_id));
create policy remove_own_time on public.studio_work_log for delete to authenticated
  using(user_id=auth.uid() and public.has_accepted_project_membership(project_id));
grant select,delete on public.studio_work_log to authenticated;
grant insert(project_id,work_day,minutes) on public.studio_work_log to authenticated;
