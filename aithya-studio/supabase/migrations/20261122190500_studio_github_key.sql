create table aithya_runtime.project_github_tokens(
 project_id uuid primary key references public.projects on delete cascade,
 nonce text not null, ciphertext text not null
);
grant select,insert,update,delete on aithya_runtime.project_github_tokens to aithya_vercel_app;
