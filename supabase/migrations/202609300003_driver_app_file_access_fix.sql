-- Corrige acesso do app motorista aos arquivos ja existentes:
-- 1. Policies dos buckets deixam de quebrar quando o caminho nao comeca com uuid.
-- 2. Buckets aceitam os MIME types comuns das cameras e dos arquivos de CT-e.
-- 3. Contexto do app expoe aliases camelCase dos documentos sem alterar a regra do fluxo.

create or replace function private.storage_path_tenant_id(p_name text)
returns uuid
language sql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
  select case
    when p_name is not null
      and split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
    else null::uuid
  end;
$$;

revoke all on function private.storage_path_tenant_id(text) from public, anon, authenticated;
grant execute on function private.storage_path_tenant_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-fuel-documents',
  'driver-fuel-documents',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'freight-documents',
  'freight-documents',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/xml',
    'text/xml',
    'text/plain',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists driver_fuel_documents_select on storage.objects;
drop policy if exists driver_fuel_documents_insert on storage.objects;
drop policy if exists driver_fuel_documents_update on storage.objects;
drop policy if exists driver_fuel_documents_delete on storage.objects;

create policy driver_fuel_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

create policy driver_fuel_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

create policy driver_fuel_documents_update on storage.objects
for update to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
)
with check (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

create policy driver_fuel_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

drop policy if exists freight_documents_select on storage.objects;
drop policy if exists freight_documents_insert on storage.objects;
drop policy if exists freight_documents_update on storage.objects;
drop policy if exists freight_documents_delete on storage.objects;

create policy freight_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

create policy freight_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

create policy freight_documents_update on storage.objects
for update to authenticated
using (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and private.can_access_tenant(private.storage_path_tenant_id(name))
)
with check (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and private.can_access_tenant(private.storage_path_tenant_id(name))
);

create policy freight_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and private.can_access_tenant(private.storage_path_tenant_id(name))
);

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_driver_app_context()'::regprocedure);

  if position('''storageBucket'', fd.storage_bucket' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'select jsonb_agg(to_jsonb(fd) order by fd.created_at desc)
      from public.freight_documents fd',
      'select jsonb_agg(
        to_jsonb(fd) || jsonb_build_object(
          ''fileName'', fd.file_name,
          ''storageBucket'', fd.storage_bucket,
          ''storagePath'', fd.storage_path,
          ''mimeType'', fd.mime_type,
          ''sizeBytes'', fd.size_bytes,
          ''createdAt'', fd.created_at,
          ''updatedAt'', fd.updated_at
        )
        order by fd.created_at desc
      )
      from public.freight_documents fd'
    );
    execute v_definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
