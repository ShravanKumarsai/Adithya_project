create schema aithya_runtime;
revoke all on schema aithya_runtime from public, anon, authenticated;

create table aithya_runtime.workspace_projects (
  user_id text primary key, projects_json text not null,
  updated_at timestamptz not null default current_timestamp
);
create table aithya_runtime.project_notes (
  user_id text not null, repository text not null, revision integer not null,
  contents text not null, primary key (user_id, repository)
);
create table aithya_runtime.planning_rate (
  account_id text not null, day text not null, attempts integer not null,
  primary key (account_id, day)
);
create table aithya_runtime.project_gemini_keys (
  project_id uuid primary key references public.projects(id) on delete cascade,
  nonce text not null, ciphertext text not null
);
create table aithya_runtime.project_vercel_tokens (
  project_id uuid primary key references public.projects(id) on delete cascade,
  nonce text not null, ciphertext text not null
);
create table aithya_runtime.notebook_files (
  key text primary key, name text not null, bytes bytea not null
);
create role aithya_vercel_app nologin;
grant usage on schema aithya_runtime to aithya_vercel_app;
grant select, insert, update, delete on all tables in schema aithya_runtime to aithya_vercel_app;
create table aithya_runtime.rulebook_parts (
  account_id uuid not null,
  part smallint not null check (part between 0 and 2),
  scan_id uuid not null,
  mime text not null,
  bytes bytea not null check (octet_length(bytes) between 1 and 3145728),
  created_at timestamptz not null default current_timestamp,
  primary key (account_id, part)
);
grant select, insert, update, delete on aithya_runtime.rulebook_parts to aithya_vercel_app;
