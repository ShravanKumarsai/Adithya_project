grant update on public.project_ai_constraints to authenticated;
create policy "Leaders update AI policy" on public.project_ai_constraints for update to authenticated
using(exists(select 1 from public.projects where id=project_id and leader_id=auth.uid()))
with check(exists(select 1 from public.projects where id=project_id and leader_id=auth.uid()));
create unique index user_skills_case_unique on public.user_skills(project_id,user_id,lower(category),lower(skill_name));
create or replace function public.save_member_onboarding(p_project_id uuid,p_profile jsonb,p_skills jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare actor_id uuid:=auth.uid(); skill jsonb;
begin
 if actor_id is null or not public.has_accepted_project_membership(p_project_id) then raise exception 'Accepted membership required'; end if;
 if length(trim(coalesce(p_profile->>'full_name','')))<2 then raise exception 'Enter your full name'; end if;
 if jsonb_typeof(p_skills)<>'array' or jsonb_array_length(p_skills) not between 1 and 30 then raise exception 'Enter between 1 and 30 skills'; end if;
 if exists(select 1 from jsonb_array_elements(p_skills) s where length(trim(coalesce(s->>'skill_name','')))=0 or coalesce(s->>'proficiency','') not in ('beginner','intermediate','advanced','expert')) then raise exception 'Every skill needs a name and proficiency'; end if;
 if exists(select 1 from jsonb_array_elements(p_skills) s group by lower(trim(s->>'category')),lower(trim(s->>'skill_name')) having count(*)>1) then raise exception 'Duplicate skill'; end if;
 update public.profiles set full_name=trim(p_profile->>'full_name'),
 interests=array(select jsonb_array_elements_text(coalesce(p_profile->'interests','[]'))),
 preferred_technologies=array(select jsonb_array_elements_text(coalesce(p_profile->'preferred_technologies','[]'))),
 availability=coalesce(p_profile->>'availability','') where id=actor_id;
 update public.project_members set full_name=trim(p_profile->>'full_name'),profile_completed_at=now() where project_id=p_project_id and user_id=actor_id;
 for skill in select value from jsonb_array_elements(p_skills) loop
 update public.user_skills set self_assessed_level=skill->>'proficiency',self_evidence=coalesce(skill->>'evidence','')
 where project_id=p_project_id and user_id=actor_id and lower(category)=lower(trim(skill->>'category')) and lower(skill_name)=lower(trim(skill->>'skill_name'));
 if not found then
 insert into public.user_skills(project_id,user_id,category,skill_name,self_assessed_level,self_evidence)
 values(p_project_id,actor_id,trim(skill->>'category'),trim(skill->>'skill_name'),skill->>'proficiency',coalesce(skill->>'evidence',''));
 end if;
 end loop;
end;$$;
create function public.immutable_requirement_project() returns trigger language plpgsql set search_path=public as $$
begin
 if new.project_id<>old.project_id then raise exception 'Requirements cannot move between projects'; end if;
 return new;
end;$$;
create trigger immutable_requirement_project before update on public.requirement_items for each row execute function public.immutable_requirement_project();
revoke all on function public.immutable_requirement_project() from public,anon;
