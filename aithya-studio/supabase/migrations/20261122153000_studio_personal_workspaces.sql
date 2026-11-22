create table public.studio_member_details (
  project_id uuid references public.projects on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete cascade,
  expertise text not null default '' check(length(expertise)<=1800),
  history text not null default '' check(length(history)<=2500),
  past_hours numeric not null default 0 check(past_hours between 0 and 168),
  ratings jsonb not null default '{}' check(jsonb_typeof(ratings)='object' and octet_length(ratings::text)<=500),
  role_draft jsonb not null default '{}' check(jsonb_typeof(role_draft)='object' and octet_length(role_draft::text)<=1600),
  help_alerts boolean not null default true,
  credit_alerts boolean not null default true,
  github_login text not null default '' check(github_login='' or github_login ~ '^[A-Za-z0-9-]{1,39}$'),
  primary key(project_id,user_id)
);
alter table public.studio_member_details enable row level security;
grant select,insert,update on public.studio_member_details to authenticated;
create policy own_details on public.studio_member_details for all to authenticated
using(user_id=auth.uid() and public.has_accepted_project_membership(project_id))
with check(user_id=auth.uid() and public.has_accepted_project_membership(project_id));
create table public.studio_ai_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tool text not null check(tool in ('ChatGPT','Claude','Gemini','Copilot','Other')),
  handle text not null default '' check(length(handle)<=80),
  unit text not null check(unit in ('Messages','Requests','Tokens')),
  allowance integer not null check(allowance between 1 and 1000000000),
  used integer not null default 0 check(used between 0 and 1000000000),
  window_hours numeric not null check(window_hours between 0.25 and 720),
  reset_at timestamptz not null,
  shared boolean not null default false
);
alter table public.studio_ai_accounts enable row level security;
grant select,insert,update,delete on public.studio_ai_accounts to authenticated;
create policy read_shared_credits on public.studio_ai_accounts for select to authenticated
using(public.has_accepted_project_membership(project_id) and (shared or user_id=auth.uid()));
create policy manage_own_credits on public.studio_ai_accounts for all to authenticated
using(user_id=auth.uid() and public.has_accepted_project_membership(project_id))
with check(user_id=auth.uid() and public.has_accepted_project_membership(project_id));
create table public.studio_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  creator_id uuid not null default auth.uid() references auth.users on delete cascade,
  topic text not null check(length(trim(topic)) between 1 and 150),
  skill text not null default '' check(length(skill)<=60),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.studio_thread_members (
  thread_id uuid references public.studio_threads on delete cascade,
  user_id uuid references auth.users on delete cascade,
  last_read timestamptz not null default '-infinity',
  primary key(thread_id,user_id)
);
create table public.studio_thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.studio_threads on delete cascade,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check(length(trim(body)) between 1 and 6000),
  created_at timestamptz not null default now()
);
create index on public.studio_thread_messages(thread_id,created_at desc);
create function public.can_read_studio_thread(p_thread uuid) returns bool
language sql stable security definer set search_path='' as $$
  select exists(select from public.studio_threads t join public.studio_thread_members m on m.thread_id=t.id
    where t.id=p_thread and m.user_id=auth.uid() and public.has_accepted_project_membership(t.project_id))
$$;
revoke all on function public.can_read_studio_thread(uuid) from public,anon;
grant execute on function public.can_read_studio_thread(uuid) to authenticated;
alter table public.studio_threads enable row level security;
alter table public.studio_thread_members enable row level security;
alter table public.studio_thread_messages enable row level security;
grant select on public.studio_threads,public.studio_thread_members,public.studio_thread_messages to authenticated;
grant update(resolved) on public.studio_threads to authenticated;
grant update(last_read) on public.studio_thread_members to authenticated;
grant insert(thread_id,body) on public.studio_thread_messages to authenticated;
create policy read_thread on public.studio_threads for select to authenticated using(public.can_read_studio_thread(id));
create policy finish_thread on public.studio_threads for update to authenticated
using(public.can_read_studio_thread(id) and creator_id=auth.uid()) with check(public.can_read_studio_thread(id) and creator_id=auth.uid());
create policy read_thread_members on public.studio_thread_members for select to authenticated using(public.can_read_studio_thread(thread_id));
create policy own_read_marker on public.studio_thread_members for update to authenticated
using(user_id=auth.uid() and public.can_read_studio_thread(thread_id))
with check(user_id=auth.uid() and public.can_read_studio_thread(thread_id));
create policy read_thread_messages on public.studio_thread_messages for select to authenticated using(public.can_read_studio_thread(thread_id));
create policy post_thread_message on public.studio_thread_messages for insert to authenticated
with check(author_id=auth.uid() and public.can_read_studio_thread(thread_id));
create function public.start_studio_thread(p_project uuid,p_topic text,p_skill text,p_users uuid[],p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare thread uuid;
begin
  if not public.has_accepted_project_membership(p_project) or coalesce(cardinality(p_users),0) not between 1 and 7
  or exists(select from unnest(p_users) u where u is null or u=auth.uid() or not exists(select from public.project_members m where m.project_id=p_project and m.user_id=u and m.status='accepted'))
  then raise exception 'Choose accepted teammates from this project'; end if;
  insert into public.studio_threads(project_id,creator_id,topic,skill) values(p_project,auth.uid(),trim(p_topic),coalesce(p_skill,'')) returning id into thread;
  insert into public.studio_thread_members(thread_id,user_id) select thread,u from (select distinct unnest(array_append(p_users,auth.uid())) u) members;
  if length(trim(coalesce(p_body,'')))>0 then
    insert into public.studio_thread_messages(thread_id,author_id,body) values(thread,auth.uid(),trim(p_body));
  end if;
  return thread;
end $$;
revoke all on function public.start_studio_thread(uuid,text,text,uuid[],text) from public,anon;
grant execute on function public.start_studio_thread(uuid,text,text,uuid[],text) to authenticated;
create table public.studio_mentor_history(
  id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  question text not null check(length(question) between 1 and 2000), answer text not null check(length(answer) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.studio_mentor_history enable row level security;
grant select,insert,delete on public.studio_mentor_history to authenticated;
create policy own_mentor_history on public.studio_mentor_history for all to authenticated
using(user_id=auth.uid() and public.has_accepted_project_membership(project_id))
with check(user_id=auth.uid() and public.has_accepted_project_membership(project_id));
create function public.transfer_studio_lead(p_project uuid,p_member uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select from public.projects where id=p_project and leader_id=auth.uid() and archived_at is null for update)
      or p_member is null or p_member=auth.uid() or not exists(select from public.project_members where project_id=p_project and user_id=p_member and status='accepted')
  then raise exception 'Choose an accepted teammate as the new leader'; end if;
  update public.project_members set is_leader=(user_id=p_member) where project_id=p_project and user_id in (auth.uid(),p_member);
  update public.projects set leader_id=p_member where id=p_project;
end $$;
revoke all on function public.transfer_studio_lead(uuid,uuid) from public,anon;
grant execute on function public.transfer_studio_lead(uuid,uuid) to authenticated;
alter publication supabase_realtime add table public.studio_thread_messages,public.studio_thread_members;
create table aithya_runtime.project_github_tokens(project_id uuid primary key references public.projects on delete cascade,nonce text not null,ciphertext text not null);
grant select,insert,update,delete on aithya_runtime.project_github_tokens to aithya_vercel_app;
alter table public.ai_runs add column input_tokens integer, add column output_tokens integer;

create function public.apply_studio_plan(p_project uuid,p_requirements text[],p_tasks jsonb,p_milestones jsonb,p_roles text[]) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; requirement_title text;
begin
 if not exists(select from public.projects where id=p_project and leader_id=auth.uid() and archived_at is null) then raise exception 'Only the project lead can apply a project plan';end if;
 if coalesce(cardinality(p_requirements),0)>8 or jsonb_array_length(p_tasks)>8 or jsonb_array_length(p_milestones)>5 or coalesce(cardinality(p_roles),0)>8 then raise exception 'Review the plan size before saving';end if;
 foreach requirement_title in array p_requirements loop
   insert into public.requirement_items(project_id,title,source) select p_project,requirement_title,'suggestion'
   where not exists(select from public.requirement_items r where r.project_id=p_project and lower(r.title)=lower(requirement_title));
 end loop;
 for item in select value from jsonb_array_elements(p_tasks) loop
   insert into public.project_tasks(id,project_id,title,owner_id,skill,estimated_hours,blocked_by)
     values((item->>'id')::uuid,p_project,item->>'title',(item->>'owner_id')::uuid,item->>'skill',(item->>'estimated_hours')::numeric,(item->>'blocked_by')::uuid);
 end loop;
 for item in select value from jsonb_array_elements(p_milestones) loop
   insert into public.milestones(project_id,name,due) values(p_project,item->>'name',(item->>'due')::date);
 end loop;
 if cardinality(p_roles)>0 then
   insert into public.project_messages(project_id,kind,body) values(p_project,'decision',left('Suggested roles for team review: '||array_to_string(p_roles, E'\n'),6000));
 end if;
end $$;
revoke all on function public.apply_studio_plan(uuid,text[],jsonb,jsonb,text[]) from public,anon;
grant execute on function public.apply_studio_plan(uuid,text[],jsonb,jsonb,text[]) to authenticated;
