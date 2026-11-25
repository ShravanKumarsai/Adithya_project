alter table public.projects add column if not exists intake_roles text[] not null default '{}';

-- Install the compatible publisher only when the complete intake feature is absent.
do $migration$
begin
  if to_regprocedure('public.approve_studio_intake(uuid,jsonb,integer)') is not null then return; end if;

  create function public.approve_studio_intake(p_id uuid, p_content jsonb, p_revision integer)
  returns uuid language plpgsql security invoker set search_path = '' as $publish$
  declare
    project uuid;
    work jsonb := p_content->'work';
    owner uuid := auth.uid();
  begin
    if owner is null then raise exception 'Sign in first'; end if;

    perform pg_advisory_xact_lock(hashtextextended('draftdeck.publish:' || p_id::text, 0));
    select d.published_project_id into project
    from public.project_drafts d where d.id = p_id and d.user_id = owner;
    if project is not null then return project; end if;

    perform public.save_project_draft(p_id, p_content, p_revision);
    project := public.publish_project_draft(p_id);

    update public.projects set intake_roles = array(
      select left(trim(line), 100)
      from jsonb_array_elements_text(case when jsonb_typeof(work->'roles') = 'array' then work->'roles' else '[]'::jsonb end) line
      where trim(line) <> '' limit 12
    ) where id = project and leader_id = owner;

    insert into public.project_tasks(project_id, title)
    select project, left(trim(line), 200)
    from jsonb_array_elements_text(case when jsonb_typeof(work->'tasks') = 'array' then work->'tasks' else '[]'::jsonb end) line
    where trim(line) <> '' limit 25;

    insert into public.milestones(project_id, name, due)
    select project, left(trim(substring(line from position('|' in line) + 1)), 200), trim(split_part(line, '|', 1))::date
    from jsonb_array_elements_text(case when jsonb_typeof(work->'milestones') = 'array' then work->'milestones' else '[]'::jsonb end) line
    where line ~ '^\d{4}-\d{2}-\d{2}\s+\|\s+.+$'
      and pg_input_is_valid(trim(split_part(line, '|', 1)), 'date') limit 12;

    return project;
  end;
  $publish$;

  revoke all on function public.approve_studio_intake(uuid,jsonb,integer) from public, anon;
  grant execute on function public.approve_studio_intake(uuid,jsonb,integer) to authenticated;
end;
$migration$;
