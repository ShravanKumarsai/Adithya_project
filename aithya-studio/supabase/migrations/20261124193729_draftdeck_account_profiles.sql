create table if not exists public.studio_account_profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  intake jsonb not null check (jsonb_typeof(intake) = 'object' and octet_length(intake::text) <= 8000),
  saved_at timestamptz not null default now()
);
alter table public.studio_account_profiles enable row level security;
grant select, insert, update on public.studio_account_profiles to authenticated;
drop policy if exists studio_profile_self on public.studio_account_profiles;
create policy studio_profile_self on public.studio_account_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
