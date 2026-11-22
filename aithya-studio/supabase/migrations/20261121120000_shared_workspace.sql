alter table public.projects add column archived_at timestamptz;
alter table public.projects add column repository text not null default '';
alter table public.projects add constraint project_dates_valid check (submission_deadline is null or start_date is null or submission_deadline >= start_date);
alter table public.projects add column incomplete_onboarding_acknowledged boolean not null default false;
alter table public.project_ai_constraints add column permitted_models text[] not null default '{}';
alter table public.project_ai_constraints add column data_handling text not null default '';
create table public.project_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 content jsonb not null default '{}',
 revision integer not null default 1,
 published_project_id uuid references public.projects(id),
 updated_at timestamptz not null default now()
);
create table public.requirement_items (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),
 description text not null default '',
 source text not null default 'manual' check(source in ('manual','official','suggestion')),
 source_document text not null default '',
 page_number integer check(page_number > 0),
 mandatory boolean not null default true,
 verified boolean not null default false,
 notes text not null default '',
 editor_id uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 check(source <> 'suggestion' or not verified)
);
create table public.project_tasks (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),
 owner_id uuid references auth.users(id),
 requirement_id uuid references public.requirement_items(id) on delete set null,
 status text not null default 'open' check(status in ('open','in_progress','review','done')),
 due_date date,
 estimated_hours numeric not null default 0 check(estimated_hours between 0 and 1000),
 created_at timestamptz not null default now()
);
create table public.member_availability (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 weekly_hours numeric not null default 0 check(weekly_hours between 0 and 168),
 available_days text not null default '',
 working_hours text not null default '',
 timezone text not null default '',
 commitments text not null default '',
 communication text not null default '',
 primary key(project_id,user_id)
);
create table public.learning_goals (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),
 resource_url text not null default '' check(resource_url='' or resource_url ~ '^https://'),
 completed boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.project_activity (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 actor_id uuid references auth.users(id),
 event_type text not null,
 description text not null,
 created_at timestamptz not null default now()
);
create index requirement_items_project_idx on public.requirement_items(project_id);
create index project_tasks_project_idx on public.project_tasks(project_id);
create index learning_goals_project_idx on public.learning_goals(project_id);
create index activity_project_time_idx on public.project_activity(project_id,created_at desc);
create index drafts_user_idx on public.project_drafts(user_id);

alter table public.project_drafts enable row level security;
alter table public.requirement_items enable row level security;
alter table public.project_tasks enable row level security;
alter table public.member_availability enable row level security;
alter table public.learning_goals enable row level security;
alter table public.project_activity enable row level security;

create policy "Own drafts" on public.project_drafts for select to authenticated using(user_id=auth.uid());
create policy "Read requirement items" on public.requirement_items for select to authenticated using(public.has_accepted_project_membership(project_id));
create policy "Leaders manage requirements" on public.requirement_items for all to authenticated
 using(exists(select 1 from public.projects where id=project_id and leader_id=auth.uid()))
 with check(editor_id=auth.uid() and exists(select 1 from public.projects where id=project_id and leader_id=auth.uid()));
create policy "Members read tasks" on public.project_tasks for select to authenticated using(public.has_accepted_project_membership(project_id));
create policy "Members create tasks" on public.project_tasks for insert to authenticated with check(public.has_accepted_project_membership(project_id));
create policy "Members update tasks" on public.project_tasks for update to authenticated using(public.has_accepted_project_membership(project_id)) with check(public.has_accepted_project_membership(project_id));
create policy "Read member availability" on public.member_availability for select to authenticated using(public.has_accepted_project_membership(project_id));
create policy "Update own availability" on public.member_availability for all to authenticated using(user_id=auth.uid() and public.has_accepted_project_membership(project_id)) with check(user_id=auth.uid() and public.has_accepted_project_membership(project_id));
create policy "Own learning goals" on public.learning_goals for all to authenticated using(user_id=auth.uid() and public.has_accepted_project_membership(project_id)) with check(user_id=auth.uid() and public.has_accepted_project_membership(project_id));
create policy "Members read activity" on public.project_activity for select to authenticated using(public.has_accepted_project_membership(project_id));
create policy "Leaders read invitation status" on public.invitations for select to authenticated using(exists(select 1 from public.projects where id=project_id and leader_id=auth.uid()));
grant select on public.project_drafts,public.project_activity to authenticated;
grant select(id,project_id,project_member_id,claim_status,expires_at,claimed_at,revoked_at,created_at) on public.invitations to authenticated;
grant select,insert,update,delete on public.requirement_items,public.member_availability,public.learning_goals to authenticated;
grant select,insert,update on public.project_tasks to authenticated;

create function public.validate_task_scope() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='UPDATE' and new.project_id<>old.project_id then raise exception 'A task cannot move between projects'; end if;
 if new.owner_id is not null and not exists(select 1 from public.project_members where project_id=new.project_id and user_id=new.owner_id and status='accepted') then raise exception 'Choose an accepted member'; end if;
 if new.requirement_id is not null and not exists(select 1 from public.requirement_items where id=new.requirement_id and project_id=new.project_id) then raise exception 'Requirement belongs to a different project'; end if;
 return new;
end;$$;
create trigger validate_task_scope before insert or update on public.project_tasks for each row execute function public.validate_task_scope();

create function public.log_project_change() returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb; project uuid;
begin
 row_data:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 project:=case when TG_TABLE_NAME='projects' then (row_data->>'id')::uuid else (row_data->>'project_id')::uuid end;
 insert into public.project_activity(project_id,actor_id,event_type,description)
 values(project,auth.uid(),TG_TABLE_NAME||'.'||lower(TG_OP),
 replace(TG_TABLE_NAME,'_',' ')||' '||lower(TG_OP));
 return case when TG_OP='DELETE' then old else new end;
end;$$;
do $$ declare t text; begin
 foreach t in array array['projects','project_members','user_skills','project_documents','project_ai_constraints','requirement_items','project_tasks','member_availability','invitations'] loop
 execute format('create trigger record_activity after insert or update or delete on public.%I for each row execute function public.log_project_change()',t);
 end loop;
end;$$;

create function public.save_project_draft(p_id uuid,p_content jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.project_drafts;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if octet_length(p_content::text)>50000 then raise exception 'Draft is too large'; end if;
 if p_revision=0 then
 insert into public.project_drafts(id,user_id,content) values(p_id,auth.uid(),p_content)
 on conflict do nothing returning * into saved;
 else
 update public.project_drafts set content=p_content,revision=revision+1,updated_at=now()
 where id=p_id and user_id=auth.uid() and revision=p_revision and published_project_id is null returning * into saved;
 end if;
 if saved.id is null then raise exception 'Draft changed in another tab. Reopen it before editing'; end if;
 return jsonb_build_object('id',saved.id,'revision',saved.revision);
end;$$;

create function public.publish_project_draft(p_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare draft public.project_drafts; result uuid; c jsonb;
begin
 select * into draft from public.project_drafts where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Draft unavailable'; end if;
 if draft.published_project_id is not null then return draft.published_project_id; end if;
 c:=draft.content;
 result:=public.create_project_with_members(c->'project',coalesce(c->'requirements','{}'),coalesce(c->'ai','{}'),coalesce(c->'members','[]'));
 update public.projects set repository=coalesce(c->'project'->>'repository','') where id=result;
 update public.project_ai_constraints set permitted_models=array(select jsonb_array_elements_text(coalesce(c->'ai'->'permitted_models','[]'))),data_handling=coalesce(c->'ai'->>'data_handling','') where project_id=result;
 update public.project_drafts set published_project_id=result where id=p_id;
 return result;
end;$$;

create function public.add_project_member(p_project_id uuid,p_name text,p_email text,p_role text) returns uuid
language plpgsql security definer set search_path=public as $$
declare member_id uuid;
begin
 perform 1 from public.projects where id=p_project_id and leader_id=auth.uid() for update;
 if not found then raise exception 'Project leader access required'; end if;
 if length(trim(p_name))<2 then raise exception 'Enter a full name'; end if;
 if exists(select 1 from public.project_members where project_id=p_project_id and lower(trim(full_name))=lower(trim(p_name))) then raise exception 'A member with this name already exists'; end if;
 if (select count(*) from public.project_members where project_id=p_project_id)>=25 then raise exception 'Team limit reached'; end if;
 insert into public.project_members(project_id,full_name,email,role) values(p_project_id,trim(p_name),nullif(lower(trim(p_email)),''),coalesce(nullif(trim(p_role),''),'Member')) returning id into member_id;
 return member_id;
end;$$;

create function public.issue_member_invitation(p_member_id uuid) returns text language plpgsql security definer set search_path=public,extensions as $$
declare m public.project_members; token text;
begin
 select * into m from public.project_members where id=p_member_id for update;
 if not exists(select 1 from public.projects where id=m.project_id and leader_id=auth.uid()) then raise exception 'Project leader access required'; end if;
 if m.user_id is not null or m.is_leader then raise exception 'Member has already joined'; end if;
 if (select count(*) from public.invitations where created_by=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'Invitation limit reached. Try again later'; end if;
 update public.invitations set claim_status='revoked',revoked_at=now() where project_member_id=m.id and claim_status='pending';
 token:=encode(gen_random_bytes(32),'hex');
 insert into public.invitations(project_id,project_member_id,token_hash,expires_at,created_by)
 values(m.project_id,m.id,encode(digest(token,'sha256'),'hex'),now()+interval '7 days',auth.uid());
 return token;
end;$$;
create function public.revoke_member_invitation(p_invitation_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.invitations i set claim_status='revoked',revoked_at=now()
 where i.id=p_invitation_id and claim_status='pending' and exists(select 1 from public.projects where id=i.project_id and leader_id=auth.uid());
 if not found then raise exception 'Pending invitation unavailable'; end if;
end;$$;
create function public.accept_member_invitation(p_token text,p_confirm boolean) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare email text; result jsonb; hashed text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if length(p_token)<>64 then raise exception 'Invalid invitation'; end if;
 select u.email into email from auth.users u where id=auth.uid() and email_confirmed_at is not null;
 if email is null then raise exception 'Verify your email before accepting an invitation'; end if;
 hashed:=encode(digest(p_token,'sha256'),'hex');
 result:=public.preview_project_invitation(hashed,email);
 if p_confirm then result:=public.claim_project_invitation(hashed,auth.uid(),email); end if;
 return result;
end;$$;
create or replace function public.finalize_project_onboarding(p_project_id uuid,p_allow_incomplete boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare total_count integer; completed_count integer;
begin
 perform 1 from public.projects where id=p_project_id and leader_id=auth.uid() for update;
 if not found then raise exception 'Project leader access required'; end if;
 select count(*),count(*) filter(where status='accepted' and profile_completed_at is not null) into total_count,completed_count from public.project_members where project_id=p_project_id;
 if completed_count<total_count and not p_allow_incomplete then raise exception 'Confirm proceeding with incomplete profiles'; end if;
 update public.projects set onboarding_finalized_at=now(),incomplete_onboarding_acknowledged=completed_count<total_count where id=p_project_id;
 return jsonb_build_object('total',total_count,'completed',completed_count);
end;$$;

revoke all on function public.log_project_change() from public,anon,authenticated;
revoke all on function public.validate_task_scope() from public,anon;
revoke all on function public.create_profile_for_new_user() from public,anon,authenticated;
revoke all on function public.save_project_draft(uuid,jsonb,integer),public.publish_project_draft(uuid),public.add_project_member(uuid,text,text,text),public.issue_member_invitation(uuid),public.revoke_member_invitation(uuid),public.accept_member_invitation(text,boolean) from public,anon;
grant execute on function public.save_project_draft(uuid,jsonb,integer),public.publish_project_draft(uuid),public.add_project_member(uuid,text,text,text),public.issue_member_invitation(uuid),public.revoke_member_invitation(uuid),public.accept_member_invitation(text,boolean) to authenticated;
