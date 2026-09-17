-- Frotak Wave 0 — endurecimento de documentos de frete.
-- Caminho canonico: {tenant_id}/{freight_id}/{kind}/{arquivo}

create or replace function private.validate_driver_freight_document_storage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.source <> 'motorista_app' then
    return new;
  end if;

  if new.storage_bucket <> 'freight-documents' then
    raise exception 'DRIVER_DOCUMENT_BUCKET_INVALID';
  end if;

  if new.freight_id is null
     or split_part(new.storage_path, '/', 1) <> new.tenant_id::text
     or split_part(new.storage_path, '/', 2) <> new.freight_id::text then
    raise exception 'DRIVER_DOCUMENT_PATH_INVALID';
  end if;

  if not exists (
    select 1
    from public.drivers d
    join public.vehicles v
      on v.tenant_id = d.tenant_id
     and v.driver_id = d.id
    where d.id = new.driver_id
      and d.auth_user_id = auth.uid()
      and d.active = true
      and d.tenant_id = new.tenant_id
      and v.id = new.vehicle_id
      and v.current_freight_id = new.freight_id
  ) then
    raise exception 'DRIVER_DOCUMENT_FREIGHT_ACCESS_DENIED';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_driver_freight_document_storage()
from public, anon, authenticated;

drop trigger if exists freight_documents_validate_driver_storage on public.freight_documents;
create trigger freight_documents_validate_driver_storage
before insert or update of storage_bucket, storage_path, freight_id, vehicle_id, driver_id, source
on public.freight_documents
for each row execute function private.validate_driver_freight_document_storage();

-- Back-office continua com acesso por tenant. Motorista so enxerga/insere dentro
-- do tenant + frete atualmente atribuido a ele.
drop policy if exists freight_documents_select on storage.objects;
create policy freight_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'freight-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1
      from public.drivers d
      join public.vehicles v
        on v.tenant_id = d.tenant_id
       and v.driver_id = d.id
      where d.auth_user_id = auth.uid()
        and d.active = true
        and d.tenant_id = ((storage.foldername(name))[1])::uuid
        and v.current_freight_id = ((storage.foldername(name))[2])::uuid
    )
  )
);

drop policy if exists freight_documents_insert on storage.objects;
create policy freight_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'freight-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1
      from public.drivers d
      join public.vehicles v
        on v.tenant_id = d.tenant_id
       and v.driver_id = d.id
      where d.auth_user_id = auth.uid()
        and d.active = true
        and d.tenant_id = ((storage.foldername(name))[1])::uuid
        and v.current_freight_id = ((storage.foldername(name))[2])::uuid
    )
  )
);

comment on function private.validate_driver_freight_document_storage() is
  'Impede que metadados enviados pelo app motorista apontem para bucket, tenant ou frete diferente do frete ativo autenticado.';
