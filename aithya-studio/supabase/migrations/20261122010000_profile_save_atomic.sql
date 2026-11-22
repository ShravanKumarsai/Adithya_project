create function public.save_complete_member_profile(p_project_id uuid,p_profile jsonb,p_skills jsonb,p_availability jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
 perform public.save_member_onboarding(p_project_id,p_profile,p_skills);
 insert into public.member_availability(project_id,user_id,weekly_hours,available_days,working_hours,timezone,commitments,communication)
 values(p_project_id,auth.uid(),coalesce((p_availability->>'weekly_hours')::numeric,0),coalesce(p_availability->>'available_days',''),coalesce(p_availability->>'working_hours',''),coalesce(p_availability->>'timezone',''),coalesce(p_availability->>'commitments',''),coalesce(p_availability->>'communication',''))
 on conflict(project_id,user_id) do update set weekly_hours=excluded.weekly_hours,available_days=excluded.available_days,working_hours=excluded.working_hours,timezone=excluded.timezone,commitments=excluded.commitments,communication=excluded.communication;
end;$$;
revoke all on function public.save_complete_member_profile(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_complete_member_profile(uuid,jsonb,jsonb,jsonb) to authenticated;
alter table public.projects add constraint project_name_nonempty check(length(trim(name)) between 2 and 200);
