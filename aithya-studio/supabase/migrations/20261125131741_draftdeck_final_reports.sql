alter table public.studio_reports add column if not exists delivery jsonb not null default '{}'
  check (jsonb_typeof(delivery)='object' and octet_length(delivery::text)<=28000);

-- Keep each participant's report receipt when the underlying workspace is removed.
alter table public.studio_portfolio_history
  drop constraint studio_portfolio_history_project_id_fkey,
  add column final_report jsonb not null default '{}';

drop policy "Members read their own project history" on public.studio_portfolio_history;
create policy "Members read their own project history" on public.studio_portfolio_history
  for select to authenticated using(user_id=(select auth.uid()));

update public.studio_portfolio_history h set final_report=jsonb_build_object(
  'closed_at',r.closed_at,'delivery',r.delivery,'members',r.snapshot)
from public.studio_reports r where r.project_id=h.project_id;

create function aithya_private.publish_draftdeck_final_report(p_project uuid,p_delivery jsonb)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare closed timestamptz;
begin
  closed := public.close_studio_report(p_project);
  update public.studio_reports set delivery=p_delivery
    where project_id=p_project and delivery='{}'::jsonb;
  update public.studio_portfolio_history h set final_report=jsonb_build_object(
    'closed_at',r.closed_at,'delivery',r.delivery,'members',r.snapshot)
  from public.studio_reports r where h.project_id=p_project and r.project_id=h.project_id;
  return closed;
end;
$$;

create function aithya_private.delete_finished_draftdeck_project(p_project uuid,p_name text)
returns void language plpgsql security definer set search_path='' as $$
declare project public.projects;
begin
  select * into project from public.projects where id=p_project and leader_id=auth.uid() for update;
  if not found or not public.has_accepted_project_membership(p_project)
  then raise exception 'Only the project lead can delete this project' using errcode='42501'; end if;
  if p_name is distinct from project.name then raise exception 'Enter the exact project name'; end if;
  if project.submission_deadline is null or clock_timestamp() < ((project.submission_deadline + 1)::timestamp at time zone 'Asia/Kolkata')
  then raise exception 'Project deletion is available after the submission deadline'; end if;
  if not exists(select from public.studio_reports r where r.project_id=p_project)
     or not exists(select from public.studio_portfolio_history h where h.project_id=p_project and h.user_id=auth.uid() and h.final_report<>'{}'::jsonb)
     or exists(select from public.studio_reports r cross join lateral jsonb_array_elements(r.snapshot) member
       where r.project_id=p_project and not exists(select from public.studio_portfolio_history h
         where h.project_id=p_project and h.user_id=(member->>'id')::uuid and h.final_report<>'{}'::jsonb))
  then raise exception 'Publish the final report for all participants before deleting'; end if;
  delete from public.project_drafts where published_project_id=p_project;
  delete from public.projects where id=p_project;
end;
$$;
create function public.publish_draftdeck_final_report(p_project uuid,p_delivery jsonb)
returns timestamptz language sql security invoker set search_path='' as $$
  select aithya_private.publish_draftdeck_final_report(p_project,p_delivery);
$$;
create function public.delete_finished_draftdeck_project(p_project uuid,p_name text)
returns void language sql security invoker set search_path='' as $$
  select aithya_private.delete_finished_draftdeck_project(p_project,p_name);
$$;
grant usage on schema aithya_private to authenticated;
revoke all on function public.publish_draftdeck_final_report(uuid,jsonb),public.delete_finished_draftdeck_project(uuid,text),
  aithya_private.publish_draftdeck_final_report(uuid,jsonb),aithya_private.delete_finished_draftdeck_project(uuid,text) from public,anon;
grant execute on function public.publish_draftdeck_final_report(uuid,jsonb),public.delete_finished_draftdeck_project(uuid,text),
  aithya_private.publish_draftdeck_final_report(uuid,jsonb),aithya_private.delete_finished_draftdeck_project(uuid,text) to authenticated;

-- Project-wide cascades cannot log activity against a project that no longer exists.
create or replace function public.log_project_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; project uuid;
begin
  row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  project := case when tg_table_name='projects' then (row_data->>'id')::uuid else (row_data->>'project_id')::uuid end;
  if tg_op='DELETE' and not exists(select 1 from public.projects where id=project) then return old; end if;
  insert into public.project_activity(project_id,actor_id,event_type,description)
    values(project,auth.uid(),tg_table_name||'.'||lower(tg_op),replace(tg_table_name,'_',' ')||' '||lower(tg_op));
  return case when tg_op='DELETE' then old else new end;
end;
$$;
