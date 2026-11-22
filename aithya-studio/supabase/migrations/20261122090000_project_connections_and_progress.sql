alter table public.projects
  add column vercel_project_id text check (vercel_project_id ~ '^prj_[A-Za-z0-9]{8,64}$'),
  add column vercel_team_id text check (vercel_team_id ~ '^team_[A-Za-z0-9]{8,64}$'),
  add constraint vercel_team_requires_project check (vercel_team_id is null or vercel_project_id is not null);

create function public.project_task_totals()
returns table(project_id uuid, total bigint, done bigint, in_progress bigint, review bigint)
language sql stable security invoker set search_path = '' as $$
  select t.project_id, count(*), count(*) filter (where t.status = 'done'),
         count(*) filter (where t.status = 'in_progress'), count(*) filter (where t.status = 'review')
  from public.project_tasks t join public.projects p on p.id = t.project_id
  where p.archived_at is null group by t.project_id
$$;
revoke all on function public.project_task_totals() from public, anon;
grant execute on function public.project_task_totals() to authenticated;
