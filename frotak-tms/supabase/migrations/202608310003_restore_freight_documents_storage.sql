insert into storage.buckets (id, name, public)
values ('freight-documents', 'freight-documents', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "authenticated users can read freight document files" on storage.objects;
drop policy if exists "authenticated users can upload freight document files" on storage.objects;
drop policy if exists "authenticated users can update freight document files" on storage.objects;

create policy "authenticated users can read freight document files" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'freight-documents');

create policy "authenticated users can upload freight document files" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'freight-documents');

create policy "authenticated users can update freight document files" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'freight-documents')
  with check (bucket_id = 'freight-documents');
