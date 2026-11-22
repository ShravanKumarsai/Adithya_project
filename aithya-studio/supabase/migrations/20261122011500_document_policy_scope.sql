alter policy "Project leaders upload private project documents" on storage.objects
with check (
 bucket_id='project-documents' and exists (
  select 1 from public.projects p
  where p.id::text=(storage.foldername(storage.objects.name))[1] and p.leader_id=auth.uid()
 )
);
alter policy "Project leaders update private project documents" on storage.objects
using (
 bucket_id='project-documents' and exists (
  select 1 from public.projects p
  where p.id::text=(storage.foldername(storage.objects.name))[1] and p.leader_id=auth.uid()
 )
)
with check (
 bucket_id='project-documents' and exists (
  select 1 from public.projects p
  where p.id::text=(storage.foldername(storage.objects.name))[1] and p.leader_id=auth.uid()
 )
);
alter policy "Project leaders delete private project documents" on storage.objects
using (
 bucket_id='project-documents' and exists (
  select 1 from public.projects p
  where p.id::text=(storage.foldername(storage.objects.name))[1] and p.leader_id=auth.uid()
 )
);
