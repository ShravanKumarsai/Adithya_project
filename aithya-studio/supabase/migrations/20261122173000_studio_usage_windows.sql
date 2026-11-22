create table public.studio_ai_usage_windows(
  account_id uuid not null references public.studio_ai_accounts on delete cascade,
  reset_at timestamptz not null,
  tool text not null,
  unit text not null,
  used integer not null check(used between 0 and 1000000000),
  primary key(account_id,reset_at)
);
alter table public.studio_ai_usage_windows enable row level security;
grant select on public.studio_ai_usage_windows to authenticated;
create policy read_visible_usage_windows on public.studio_ai_usage_windows for select to authenticated
using(exists(
  select from public.studio_ai_accounts a where a.id=studio_ai_usage_windows.account_id
    and public.has_accepted_project_membership(a.project_id)
    and (a.user_id=(select auth.uid()) or a.shared is true)
));
create function public.record_studio_usage_window() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.studio_ai_usage_windows(account_id,reset_at,tool,unit,used)
  values(new.id,new.reset_at,new.tool,new.unit,new.used)
  on conflict(account_id,reset_at) do update set tool=excluded.tool,unit=excluded.unit,used=excluded.used;
  return new;
end $$;
revoke all on function public.record_studio_usage_window() from public,anon,authenticated;
create trigger record_studio_usage_window after insert or update of used,reset_at,tool,unit
on public.studio_ai_accounts for each row execute function public.record_studio_usage_window();
insert into public.studio_ai_usage_windows(account_id,reset_at,tool,unit,used)
select id,reset_at,tool,unit,used from public.studio_ai_accounts;
