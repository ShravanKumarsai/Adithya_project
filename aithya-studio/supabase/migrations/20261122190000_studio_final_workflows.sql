create table public.studio_standups (
 project_id uuid references public.projects on delete cascade,
 user_id uuid default auth.uid() references auth.users on delete cascade,
 day date not null, done text not null check(length(trim(done)) between 1 and 1000),
 next text not null check(length(trim(next)) between 1 and 1000),
 primary key(project_id,user_id,day)
);
alter table public.studio_standups enable row level security;
grant select,insert,update on public.studio_standups to authenticated;
create policy "Team reads standups" on public.studio_standups for select to authenticated
 using(public.has_accepted_project_membership(project_id));
create policy "Members edit their standups" on public.studio_standups for all to authenticated
 using(user_id=auth.uid() and public.has_accepted_project_membership(project_id))
 with check(user_id=auth.uid() and public.has_accepted_project_membership(project_id));

create table public.studio_item_briefs (
 project_id uuid references public.projects on delete cascade,
 user_id uuid default auth.uid() references auth.users on delete cascade,
 item_key text check(length(item_key) between 1 and 80),
 brief jsonb not null default '{}' check(jsonb_typeof(brief)='object' and octet_length(brief::text)<=6000),
 studied boolean not null default false,
 primary key(project_id,user_id,item_key)
);
alter table public.studio_item_briefs enable row level security;
grant select,insert,update on public.studio_item_briefs to authenticated;
create policy "Members see their study notes" on public.studio_item_briefs for all to authenticated
 using(user_id=auth.uid() and public.has_accepted_project_membership(project_id))
 with check(user_id=auth.uid() and public.has_accepted_project_membership(project_id));

create function public.pin_studio_work(p_project uuid,p_owner uuid,p_title text,p_skill text,p_hours int) returns uuid
language plpgsql security invoker set search_path='' as $$
declare pinned uuid;
begin
 if not public.has_accepted_project_membership(p_project) or
 not exists(select from public.projects where id=p_project and archived_at is null and (p_owner=auth.uid() or leader_id=auth.uid())) or
 not exists(select from public.project_members m where m.project_id=p_project and m.user_id=p_owner and m.status='accepted') or
 p_hours not in (2,3,4,6,8,10) or p_skill not in ('React','Node','Python / ML','UI design','Databases','Pitching') or
 not exists(select from public.user_skills s where s.project_id=p_project and s.user_id=p_owner and lower(s.skill_name)=lower(p_skill)) then
 raise exception 'Choose a field held by this teammate and a listed duration';
 end if;
 insert into public.project_tasks(project_id,owner_id,title,skill,estimated_hours)
 values(p_project,p_owner,trim(p_title),p_skill,p_hours) returning id into pinned;
 return pinned;
end $$;
revoke all on function public.pin_studio_work(uuid,uuid,text,text,int) from public,anon;
grant execute on function public.pin_studio_work(uuid,uuid,text,text,int) to authenticated;

create table public.studio_timeline_proposals(
 message_id uuid primary key references public.project_messages on delete cascade,
 project_id uuid not null references public.projects on delete cascade,
 milestone_id uuid references public.milestones on delete set null,
 approver_id uuid not null references auth.users on delete cascade,
 proposed_due date not null, original_due date not null,
 state text not null default 'proposed' check(state in ('proposed','approved','declined'))
);
alter table public.studio_timeline_proposals enable row level security;
grant select on public.studio_timeline_proposals to authenticated;
create policy "Team reads timeline proposals" on public.studio_timeline_proposals for select to authenticated
using(public.has_accepted_project_membership(project_id));
create function public.propose_studio_timeline(p_project uuid,p_milestone uuid,p_due date,p_approver uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare m public.milestones%rowtype; message uuid;
begin
 select * into m from public.milestones where project_id=p_project and id=p_milestone;
 if not found or not public.has_accepted_project_membership(p_project) or p_approver=auth.uid() or
 not exists(select from public.project_members where project_id=p_project and user_id=p_approver and status='accepted') or
 not exists(select from public.projects where id=p_project and archived_at is null) or p_due is null or p_due=m.due
 then raise exception 'Choose a milestone, a new date and another teammate'; end if;
 insert into public.project_messages(project_id,author_id,kind,body)
 values(p_project,auth.uid(),'text','Timeline proposal · '||m.name||' · '||m.due||' → '||p_due) returning id into message;
 insert into public.studio_timeline_proposals(message_id,project_id,milestone_id,approver_id,proposed_due,original_due)
 values(message,p_project,m.id,p_approver,p_due,m.due);
 return message;
end $$;
create function public.respond_studio_timeline(p_message uuid,p_accept boolean) returns text
language plpgsql security definer set search_path='' as $$
declare proposal public.studio_timeline_proposals%rowtype;
begin
 select * into proposal from public.studio_timeline_proposals where message_id=p_message for update;
 if not found or auth.uid() is distinct from proposal.approver_id or not public.has_accepted_project_membership(proposal.project_id)
 or not exists(select from public.projects where id=proposal.project_id and archived_at is null) then
 raise exception 'Only the selected teammate can respond';end if;
 if proposal.state<>'proposed' then return proposal.state; end if;
 if p_accept then
  update public.milestones set due=proposal.proposed_due
  where id=proposal.milestone_id and project_id=proposal.project_id and due=proposal.original_due;
  if not found then raise exception 'This milestone changed. Ask for a refreshed proposal';end if;
 end if;
 update public.studio_timeline_proposals set state=case when p_accept then 'approved' else 'declined' end
 where message_id=p_message returning state into proposal.state;
 return proposal.state;
end $$;
revoke all on function public.propose_studio_timeline(uuid,uuid,date,uuid),public.respond_studio_timeline(uuid,boolean) from public,anon;
grant execute on function public.propose_studio_timeline(uuid,uuid,date,uuid),public.respond_studio_timeline(uuid,boolean) to authenticated;
alter publication supabase_realtime add table public.studio_timeline_proposals;

create table public.studio_reports (
 project_id uuid primary key references public.projects on delete cascade,
 closed_at timestamptz not null default now(),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='array')
);
alter table public.studio_reports enable row level security;
grant select on public.studio_reports to authenticated;
create policy "Team reads closed reports" on public.studio_reports for select to authenticated
 using(public.has_accepted_project_membership(project_id));
create table public.studio_portfolio_history (
 project_id uuid references public.projects on delete cascade,
 user_id uuid references auth.users on delete cascade,
 project_name text not null, closed_at timestamptz not null,
 contribution jsonb not null check(jsonb_typeof(contribution)='object'),
 primary key(project_id,user_id)
);
alter table public.studio_portfolio_history enable row level security;
grant select on public.studio_portfolio_history to authenticated;
create policy "Members read their own project history" on public.studio_portfolio_history for select to authenticated
 using(user_id=auth.uid() and public.has_accepted_project_membership(project_id));
create function public.close_studio_report(p_project uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; closed timestamptz;
begin
 select * into p from public.projects where id=p_project and leader_id=auth.uid() for update;
 if not found or not public.has_accepted_project_membership(p_project) then raise exception 'Only the project lead can close a report';end if;
 select closed_at into closed from public.studio_reports where project_id=p_project;
 if found then return closed; end if;
 closed:=clock_timestamp();
 insert into public.studio_reports(project_id,closed_at,snapshot)
 select p_project,closed,coalesce(jsonb_agg(jsonb_build_object(
 'id',m.user_id,'name',m.full_name,'role',m.role,
 'assigned',(select count(*) from public.project_tasks where project_id=p_project and owner_id=m.user_id),
 'completed',(select count(*) from public.project_tasks where project_id=p_project and owner_id=m.user_id and status='done'),
 'onTime',(select count(*) from public.project_tasks where project_id=p_project and owner_id=m.user_id and status='done' and (completed_at at time zone 'UTC')::date<=due_date),
 'late',(select count(*) from public.project_tasks where project_id=p_project and owner_id=m.user_id and status='done' and (completed_at at time zone 'UTC')::date>due_date),
 'unknown',(select count(*) from public.project_tasks where project_id=p_project and owner_id=m.user_id and status='done' and due_date is not null and completed_at is null),
 'hours',(select round(coalesce(sum(minutes),0)::numeric/60,1) from public.studio_work_log where project_id=p_project and user_id=m.user_id),
 'studioCalls',(select count(*) from public.ai_runs where project_id=p_project and user_id=m.user_id and ok),
 'contributions',(select coalesce(jsonb_agg(title order by created_at),'[]') from public.project_tasks where project_id=p_project and owner_id=m.user_id and status='done')
 )), '[]')
 from public.project_members m where m.project_id=p_project and m.status='accepted' and m.user_id is not null;
 insert into public.studio_portfolio_history(project_id,user_id,project_name,closed_at,contribution)
 select p_project,(row->>'id')::uuid,p.name,closed,row-'id'-'name'
 from public.studio_reports r cross join lateral jsonb_array_elements(r.snapshot) row where r.project_id=p_project;
 return closed;
end $$;
revoke all on function public.close_studio_report(uuid) from public,anon;
grant execute on function public.close_studio_report(uuid) to authenticated;
