-- Frotak - app motorista: envio real de nota fiscal e fluxo para aguardando CT-e.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'freight-documents',
  'freight-documents',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists freight_documents_select on storage.objects;
drop policy if exists freight_documents_insert on storage.objects;
drop policy if exists freight_documents_update on storage.objects;
drop policy if exists freight_documents_delete on storage.objects;

create policy freight_documents_select on storage.objects
for select
to authenticated
using (
  bucket_id = 'freight-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.tenant_id = ((storage.foldername(name))[1])::uuid
    )
  )
);

create policy freight_documents_insert on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'freight-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.tenant_id = ((storage.foldername(name))[1])::uuid
    )
  )
);

create policy freight_documents_update on storage.objects
for update
to authenticated
using (
  bucket_id = 'freight-documents'
  and private.can_access_tenant(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'freight-documents'
  and private.can_access_tenant(((storage.foldername(name))[1])::uuid)
);

create policy freight_documents_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'freight-documents'
  and private.can_access_tenant(((storage.foldername(name))[1])::uuid)
);

create or replace function public.driver_app_register_document(
  p_kind text,
  p_file_name text,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_storage_bucket text default null,
  p_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_document public.freight_documents;
  v_storage_bucket text;
  v_storage_path text;
  v_next_status text;
  v_next_stage text;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where tenant_id = v_driver.tenant_id
    and driver_id = v_driver.id
    and current_freight_id is not null
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'active freight not found for authenticated driver';
  end if;

  v_storage_bucket := coalesce(nullif(trim(p_storage_bucket), ''), 'freight-documents');
  v_storage_path := coalesce(
    nullif(trim(p_storage_path), ''),
    concat(
      v_vehicle.tenant_id,
      '/',
      v_vehicle.current_freight_id,
      '/',
      p_kind,
      '/',
      extract(epoch from now())::bigint,
      '-',
      regexp_replace(coalesce(p_file_name, 'documento'), '[^a-zA-Z0-9._-]+', '-', 'g')
    )
  );

  insert into public.freight_documents (
    tenant_id,
    vehicle_id,
    freight_id,
    driver_id,
    kind,
    source,
    file_name,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    status
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_driver.id,
    p_kind,
    'motorista_app',
    coalesce(nullif(trim(p_file_name), ''), 'documento'),
    v_storage_bucket,
    v_storage_path,
    p_mime_type,
    p_size_bytes,
    case when p_kind = 'nota_fiscal' then 'em-conferencia' else 'anexado' end
  )
  returning * into v_document;

  v_next_status := v_vehicle.status;
  v_next_stage := coalesce(v_vehicle.freight_stage, 'DISPONIVEL');

  if p_kind = 'nota_fiscal' then
    v_next_status := 'aguardando-cte';
    v_next_stage := 'NOTA_APROVADA_AG_CTE';
  end if;

  update public.vehicles
  set
    status = v_next_status,
    vehicle_situation = case
      when v_next_status in ('rota-carregar', 'rota-descarregar', 'rota-retornando') then 'em-rota'
      when v_next_status = 'parado-quebrado' then 'quebrado'
      when v_next_status in ('manutencao', 'disponivel-oficina') then 'manutencao'
      when v_next_status = 'disponivel-patio' then 'disponivel-patio'
      else 'parado'
    end,
    freight_stage = v_next_stage,
    workflow_flags = case
      when p_kind = 'nota_fiscal' then jsonb_set(
        coalesce(workflow_flags, '{}'::jsonb),
        '{pending_documents}',
        '["cte_mdfe"]'::jsonb,
        true
      )
      else coalesce(workflow_flags, '{}'::jsonb)
    end,
    last_transition_source = 'driver_app',
    last_transition_by = auth.uid(),
    last_transition_at = now(),
    updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  insert into public.fleet_events (
    tenant_id,
    vehicle_id,
    freight_id,
    status,
    freight_stage,
    city,
    state,
    source,
    description,
    created_by,
    event_type,
    action_origin,
    metadata
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_vehicle.status,
    v_vehicle.freight_stage,
    v_vehicle.city,
    v_vehicle.state,
    'Motorista',
    case
      when p_kind = 'nota_fiscal' and p_file_name = 'nota-enviada-por-email.txt'
        then 'Nota fiscal informada como enviada por email pelo aplicativo do motorista'
      else 'Documento anexado pelo aplicativo do motorista'
    end,
    auth.uid(),
    case when p_kind = 'nota_fiscal' then 'driver_invoice_sent' else 'driver_document_uploaded' end,
    'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'document_id', v_document.id,
      'kind', p_kind,
      'storage_bucket', v_storage_bucket,
      'storage_path', v_storage_path
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_document(text, text, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.driver_app_register_document(text, text, text, bigint, text, text)
  to authenticated;

notify pgrst, 'reload schema';
