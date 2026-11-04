create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  interests text[] not null default '{}',
  preferred_technologies text[] not null default '{}',
  availability text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references auth.users (id) on delete restrict,
  name text not null,
  hackathon_name text not null default '',
  description text not null default '',
  problem_statement text not null default '',
  start_date date,
  submission_deadline date,
  theme text not null default '',
  expected_deliverables text[] not null default '{}',
  technology_stack text[] not null default '{}',
  workflow_status text not null default 'requires_generation'
    check (workflow_status in ('provided', 'requires_generation')),
  workflow_content text not null default '',
  onboarding_finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  full_name text not null default '',
  role text not null default 'Team member',
  preliminary_skills text[] not null default '{}',
  status text not null default 'invited' check (status in ('invited', 'accepted')),
  is_leader boolean not null default false,
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_leader or (user_id is not null and status = 'accepted'))
);

create unique index if not exists project_members_project_user_uidx
  on public.project_members (project_id, user_id) where user_id is not null;
create unique index if not exists project_members_project_email_uidx
  on public.project_members (project_id, lower(email)) where email is not null;
create index if not exists project_members_user_project_idx
  on public.project_members (user_id, project_id) where user_id is not null;
create index if not exists project_members_project_status_idx
  on public.project_members (project_id, status);

create table if not exists public.project_requirements (
  project_id uuid primary key references public.projects (id) on delete cascade,
  judging_criteria text[] not null default '{}',
  mandatory_requirements text[] not null default '{}',
  restrictions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_ai_constraints (
  project_id uuid primary key references public.projects (id) on delete cascade,
  permitted_ai_tools text[] not null default '{}',
  prohibited_ai_tools text[] not null default '{}',
  external_ai_apis_allowed boolean not null default false,
  ai_generated_code_allowed boolean not null default false,
  ai_generated_research_allowed boolean not null default false,
  privacy_restrictions text not null default '',
  other_requirements text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  document_type text not null check (document_type in ('rulebook', 'supporting', 'workflow')),
  file_name text not null,
  storage_path text not null unique,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_member_id uuid not null references public.project_members (id) on delete cascade,
  token_hash text not null unique,
  claim_status text not null default 'pending'
    check (claim_status in ('pending', 'claimed', 'revoked')),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists invitations_one_pending_per_member_uidx
  on public.invitations (project_member_id) where claim_status = 'pending';
create index if not exists invitations_project_status_idx
  on public.invitations (project_id, claim_status, expires_at);

create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  skill_name text not null,
  self_assessed_level text not null
    check (self_assessed_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  self_evidence text not null default '',
  verified_level text check (verified_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  verified_evidence text not null default '',
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, category, skill_name)
);
create index if not exists user_skills_project_user_idx
  on public.user_skills (project_id, user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id, email, full_name)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do update
  set email = excluded.email;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'projects', 'project_members',
    'project_requirements', 'project_ai_constraints', 'project_documents', 'user_skills']
  loop
    execute format('drop trigger if exists touch_updated_at on public.%I', table_name);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.create_project_with_members(
  p_project jsonb,
  p_requirements jsonb,
  p_ai_constraints jsonb,
  p_members jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_project_id uuid;
  member jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(length(trim(p_project ->> 'name')), 0) < 2 then
    raise exception 'Project name must contain at least 2 characters';
  end if;
  if coalesce(jsonb_typeof(p_members), '') <> 'array' then
    raise exception 'Team members must be supplied as a list';
  end if;
  if jsonb_array_length(p_members) > 24 then
    raise exception 'A team can contain at most 25 people';
  end if;

  insert into public.projects (
    leader_id, name, hackathon_name, description, problem_statement,
    start_date, submission_deadline, theme, expected_deliverables,
    technology_stack, workflow_status, workflow_content
  )
  values (
    actor_id,
    trim(p_project ->> 'name'),
    coalesce(p_project ->> 'hackathon_name', ''),
    coalesce(p_project ->> 'description', ''),
    coalesce(p_project ->> 'problem_statement', ''),
    nullif(p_project ->> 'start_date', '')::date,
    nullif(p_project ->> 'submission_deadline', '')::date,
    coalesce(p_project ->> 'theme', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_project -> 'expected_deliverables', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_project -> 'technology_stack', '[]'::jsonb))), '{}'),
    case when coalesce(p_project ->> 'workflow_status', '') = 'provided'
      then 'provided' else 'requires_generation' end,
    coalesce(p_project ->> 'workflow_content', '')
  )
  returning id into new_project_id;

  insert into public.project_members (
    project_id, user_id, full_name, role, status, is_leader
  )
  values (
    new_project_id,
    actor_id,
    coalesce((select full_name from public.profiles where id = actor_id), ''),
    'Project lead',
    'accepted',
    true
  );

  update public.project_members
  set profile_completed_at = now()
  where project_id = new_project_id and user_id = actor_id;

  for member in select value from jsonb_array_elements(p_members)
  loop
    if coalesce(length(trim(member ->> 'full_name')), 0) = 0 then
      raise exception 'Every team member needs a name';
    end if;
    insert into public.project_members (
      project_id, email, full_name, role, preliminary_skills
    )
    values (
      new_project_id,
      nullif(lower(trim(member ->> 'email')), ''),
      trim(member ->> 'full_name'),
      coalesce(nullif(trim(member ->> 'role'), ''), 'Team member'),
      coalesce(array(select jsonb_array_elements_text(coalesce(member -> 'skills', '[]'::jsonb))), '{}')
    );
  end loop;

  insert into public.project_requirements (
    project_id, judging_criteria, mandatory_requirements, restrictions
  )
  values (
    new_project_id,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_requirements -> 'judging_criteria', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_requirements -> 'mandatory_requirements', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_requirements -> 'restrictions', '[]'::jsonb))), '{}')
  );

  insert into public.project_ai_constraints (
    project_id, permitted_ai_tools, prohibited_ai_tools,
    external_ai_apis_allowed, ai_generated_code_allowed,
    ai_generated_research_allowed, privacy_restrictions, other_requirements
  )
  values (
    new_project_id,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_ai_constraints -> 'permitted_ai_tools', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_ai_constraints -> 'prohibited_ai_tools', '[]'::jsonb))), '{}'),
    coalesce((p_ai_constraints ->> 'external_ai_apis_allowed')::boolean, false),
    coalesce((p_ai_constraints ->> 'ai_generated_code_allowed')::boolean, false),
    coalesce((p_ai_constraints ->> 'ai_generated_research_allowed')::boolean, false),
    coalesce(p_ai_constraints ->> 'privacy_restrictions', ''),
    coalesce(p_ai_constraints ->> 'other_requirements', '')
  );

  return new_project_id;
end;
$$;

create or replace function public.save_member_onboarding(
  p_project_id uuid,
  p_profile jsonb,
  p_skills jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  skill jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = actor_id and status = 'accepted'
  ) then
    raise exception 'Accepted project membership required';
  end if;
  if coalesce(length(trim(p_profile ->> 'full_name')), 0) < 2 then
    raise exception 'Full name must contain at least 2 characters';
  end if;
  if coalesce(jsonb_typeof(p_skills), '') <> 'array' then
    raise exception 'Skills must be supplied as a list';
  end if;
  if jsonb_array_length(p_skills) = 0 then
    raise exception 'Add at least one skill';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_skills) as skills(value)
    where coalesce(length(trim(skills.value ->> 'skill_name')), 0) = 0
      or coalesce(skills.value ->> 'proficiency', '') not in ('beginner', 'intermediate', 'advanced', 'expert')
  ) then
    raise exception 'Every skill needs a name and a valid self-assessed proficiency';
  end if;

  update public.profiles
  set full_name = trim(coalesce(p_profile ->> 'full_name', '')),
      interests = coalesce(array(select jsonb_array_elements_text(coalesce(p_profile -> 'interests', '[]'::jsonb))), '{}'),
      preferred_technologies = coalesce(array(select jsonb_array_elements_text(coalesce(p_profile -> 'preferred_technologies', '[]'::jsonb))), '{}'),
      availability = coalesce(p_profile ->> 'availability', '')
  where id = actor_id;

  update public.project_members
  set full_name = trim(coalesce(p_profile ->> 'full_name', '')),
      profile_completed_at = now()
  where project_id = p_project_id and user_id = actor_id;

  delete from public.user_skills where project_id = p_project_id and user_id = actor_id;
  for skill in select value from jsonb_array_elements(p_skills)
  loop
    insert into public.user_skills (
      project_id, user_id, category, skill_name, self_assessed_level, self_evidence
    )
    values (
      p_project_id,
      actor_id,
      coalesce(nullif(trim(skill ->> 'category'), ''), 'Other'),
      trim(coalesce(skill ->> 'skill_name', '')),
      coalesce(skill ->> 'proficiency', 'beginner'),
      coalesce(skill ->> 'evidence', '')
    );
  end loop;
end;
$$;

create or replace function public.verify_project_member_skill(
  p_project_id uuid,
  p_skill_id uuid,
  p_verified_level text,
  p_verified_evidence text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.projects
    where id = p_project_id and leader_id = auth.uid()
  ) then
    raise exception 'Only the project leader can verify member skills';
  end if;
  if coalesce(p_verified_level, '') not in ('beginner', 'intermediate', 'advanced', 'expert') then
    raise exception 'Choose a valid verified proficiency level';
  end if;
  if coalesce(length(trim(p_verified_evidence)), 0) < 8 then
    raise exception 'Add a short note describing the verification evidence';
  end if;

  update public.user_skills
  set verified_level = p_verified_level,
      verified_evidence = trim(p_verified_evidence),
      verified_at = now(),
      verified_by = auth.uid()
  where id = p_skill_id and project_id = p_project_id;
  if not found then
    raise exception 'Skill not found in this project';
  end if;
end;
$$;

create or replace function public.preview_project_invitation(
  p_token_hash text,
  p_user_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
begin
  select i.id, i.project_member_id, i.project_id, i.expires_at, i.claim_status,
         i.revoked_at, pm.email, pm.full_name, p.name as project_name
  into invite
  from public.invitations i
  join public.project_members pm on pm.id = i.project_member_id
  join public.projects p on p.id = i.project_id
  where i.token_hash = p_token_hash;

  if not found or invite.claim_status <> 'pending' or invite.revoked_at is not null
      or invite.expires_at <= now() then
    raise exception 'Invitation is invalid, expired, or revoked';
  end if;
  if invite.email is not null and lower(invite.email) <> lower(coalesce(p_user_email, '')) then
    raise exception 'Sign in with the email address this invitation was sent to';
  end if;

  return jsonb_build_object(
    'project_id', invite.project_id,
    'project_name', invite.project_name,
    'member_name', invite.full_name,
    'invited_email', invite.email
  );
end;
$$;

create or replace function public.claim_project_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_user_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;
  select i.id, i.project_member_id, i.project_id, i.expires_at, i.claim_status,
         i.revoked_at, pm.email, pm.user_id, pm.full_name, p.name as project_name
  into invite
  from public.invitations i
  join public.project_members pm on pm.id = i.project_member_id
  join public.projects p on p.id = i.project_id
  where i.token_hash = p_token_hash
  for update of i, pm;

  if not found or invite.claim_status <> 'pending' or invite.revoked_at is not null
      or invite.expires_at <= now() then
    raise exception 'Invitation is invalid, expired, or revoked';
  end if;
  if invite.email is not null and lower(invite.email) <> lower(coalesce(p_user_email, '')) then
    raise exception 'Sign in with the email address this invitation was sent to';
  end if;
  if invite.user_id is not null and invite.user_id <> p_user_id then
    raise exception 'This invitation has already been claimed';
  end if;
  if exists (
    select 1 from public.project_members
    where project_id = invite.project_id and user_id = p_user_id and id <> invite.project_member_id
  ) then
    raise exception 'This account is already a member of this project';
  end if;

  update public.project_members
  set user_id = p_user_id, status = 'accepted'
  where id = invite.project_member_id;
  update public.invitations
  set claim_status = 'claimed', claimed_at = now()
  where id = invite.id;

  return jsonb_build_object(
    'project_id', invite.project_id,
    'project_name', invite.project_name,
    'member_name', invite.full_name
  );
end;
$$;

create or replace function public.finalize_project_onboarding(
  p_project_id uuid,
  p_allow_incomplete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count integer;
  completed_count integer;
begin
  if not exists (
    select 1 from public.projects where id = p_project_id and leader_id = auth.uid()
  ) then
    raise exception 'Only the project leader can finalize onboarding';
  end if;

  select count(*), count(*) filter (where profile_completed_at is not null)
  into total_count, completed_count
  from public.project_members
  where project_id = p_project_id;
  if completed_count < total_count and not p_allow_incomplete then
    raise exception 'Confirm that you want to proceed with incomplete member profiles';
  end if;

  update public.projects set onboarding_finalized_at = now() where id = p_project_id;
  return jsonb_build_object('total', total_count, 'completed', completed_count);
end;
$$;

create or replace function public.has_accepted_project_membership(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and status = 'accepted'
  );
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_requirements enable row level security;
alter table public.project_ai_constraints enable row level security;
alter table public.project_documents enable row level security;
alter table public.invitations enable row level security;
alter table public.user_skills enable row level security;

create policy "Profiles readable by owner and project peers"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.project_members own_member
      join public.project_members peer on peer.project_id = own_member.project_id
      where own_member.user_id = auth.uid() and peer.user_id = profiles.id
        and public.has_accepted_project_membership(own_member.project_id)
    )
  );
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Project members read their projects"
  on public.projects for select to authenticated
  using (public.has_accepted_project_membership(projects.id));
create policy "Project leaders update their projects"
  on public.projects for update to authenticated
  using (leader_id = auth.uid()) with check (leader_id = auth.uid());

create policy "Project members read team roster"
  on public.project_members for select to authenticated
  using (public.has_accepted_project_membership(project_members.project_id));

create policy "Project members read requirements"
  on public.project_requirements for select to authenticated
  using (public.has_accepted_project_membership(project_requirements.project_id));
create policy "Project members read AI constraints"
  on public.project_ai_constraints for select to authenticated
  using (public.has_accepted_project_membership(project_ai_constraints.project_id));
create policy "Project members read project documents"
  on public.project_documents for select to authenticated
  using (public.has_accepted_project_membership(project_documents.project_id));
create policy "Project leaders manage project documents"
  on public.project_documents for all to authenticated
  using (exists (
    select 1 from public.projects
    where id = project_documents.project_id and leader_id = auth.uid()
  ))
  with check (
    uploaded_by = auth.uid() and exists (
      select 1 from public.projects
      where id = project_documents.project_id and leader_id = auth.uid()
    )
  );

create policy "Project members read scoped skill profiles"
  on public.user_skills for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_accepted_project_membership(user_skills.project_id)
  );

revoke all on public.invitations from anon, authenticated;
revoke insert, delete on public.projects, public.project_members, public.project_requirements,
  public.project_ai_constraints, public.user_skills from anon, authenticated;
revoke insert, update, delete on public.project_documents from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.projects to authenticated;
grant select on public.project_members, public.project_requirements,
  public.project_ai_constraints, public.project_documents, public.user_skills to authenticated;
grant insert, update, delete on public.project_documents to authenticated;

revoke all on function public.create_project_with_members(jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.save_member_onboarding(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.preview_project_invitation(text, text) from public, anon, authenticated;
revoke all on function public.claim_project_invitation(text, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_project_onboarding(uuid, boolean) from public, anon;
revoke all on function public.verify_project_member_skill(uuid, uuid, text, text) from public, anon;
revoke all on function public.has_accepted_project_membership(uuid) from public, anon;
grant execute on function public.create_project_with_members(jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.save_member_onboarding(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.finalize_project_onboarding(uuid, boolean) to authenticated;
grant execute on function public.verify_project_member_skill(uuid, uuid, text, text) to authenticated;
grant execute on function public.has_accepted_project_membership(uuid) to authenticated;
grant execute on function public.preview_project_invitation(text, text) to service_role;
grant execute on function public.claim_project_invitation(text, uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-documents',
  'project-documents',
  false,
  15728640,
  array['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Project members read private project documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.project_members
      where project_id::text = (storage.foldername(name))[1]
        and user_id = auth.uid() and status = 'accepted'
    )
  );
create policy "Project leaders upload private project documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.projects
      where id::text = (storage.foldername(name))[1] and leader_id = auth.uid()
    )
  );
create policy "Project leaders update private project documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.projects
      where id::text = (storage.foldername(name))[1] and leader_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.projects
      where id::text = (storage.foldername(name))[1] and leader_id = auth.uid()
    )
  );
create policy "Project leaders delete private project documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.projects
      where id::text = (storage.foldername(name))[1] and leader_id = auth.uid()
    )
  );
