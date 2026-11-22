insert into storage.buckets(id,name,public,file_size_limit) values('studio-direct','studio-direct',false,10485760)
on conflict(id) do nothing;
create policy studio_direct_download on storage.objects for select to authenticated
  using(bucket_id='studio-direct' and public.can_read_studio_thread(
    case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ((storage.foldername(name))[1])::uuid else null end));
create policy studio_direct_upload on storage.objects for insert to authenticated
  with check(bucket_id='studio-direct' and public.can_read_studio_thread(
    case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ((storage.foldername(name))[1])::uuid else null end)
    and (storage.foldername(name))[2]=auth.uid()::text);
create policy studio_direct_remove on storage.objects for delete to authenticated
  using(bucket_id='studio-direct' and owner_id=auth.uid()::text);
create table public.studio_thread_attachments(
  message_id uuid primary key references public.studio_thread_messages on delete cascade,
  thread_id uuid not null references public.studio_threads on delete cascade,
  path text not null unique,
  filename text not null check(length(filename) between 1 and 255),
  bytes integer not null check(bytes between 1 and 10485760)
);
alter table public.studio_thread_attachments enable row level security;
grant select,insert on public.studio_thread_attachments to authenticated;
create policy studio_direct_attachment_read on public.studio_thread_attachments for select to authenticated
  using(public.can_read_studio_thread(thread_id));
create policy studio_direct_attachment_add on public.studio_thread_attachments for insert to authenticated
  with check(public.can_read_studio_thread(thread_id)
    and path like thread_id::text||'/'||auth.uid()::text||'/%'
    and exists(select from public.studio_thread_messages m where m.id=message_id and m.thread_id=studio_thread_attachments.thread_id and m.author_id=auth.uid()));
alter publication supabase_realtime add table public.studio_thread_attachments;
