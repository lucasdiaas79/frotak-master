begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_driver_id uuid;
  v_vehicle_id uuid;
  v_freight_id uuid := gen_random_uuid();
  v_seen boolean;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_user_id, 'authenticated', 'authenticated', 'driver-storage-lab@example.com', now(), now(), now());

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  insert into public.tenants (slug, legal_name, status)
  values ('storage-wave0-lab', 'Storage Wave 0 Lab Ltda', 'active')
  returning id into v_tenant_id;

  insert into public.drivers (tenant_id, auth_user_id, name, phone, active)
  values (v_tenant_id, v_user_id, 'Motorista Storage Lab', '79999990003', true)
  returning id into v_driver_id;

  insert into public.vehicles (
    tenant_id, current_freight_id, plate, type, status, vehicle_situation,
    freight_stage, driver_id
  ) values (
    v_tenant_id, v_freight_id, 'LAB0A03', 'cavalo', 'parado-aguardando-carga',
    'parado', 'AGUARDANDO_NOTA', v_driver_id
  ) returning id into v_vehicle_id;

  v_seen := false;
  begin
    insert into public.freight_documents (
      tenant_id, vehicle_id, freight_id, driver_id, kind, source,
      file_name, storage_bucket, storage_path, status
    ) values (
      v_tenant_id, v_vehicle_id, v_freight_id, v_driver_id, 'nota_fiscal',
      'motorista_app', 'nota.pdf', 'outro-bucket',
      v_tenant_id || '/' || v_freight_id || '/nota_fiscal/nota.pdf', 'anexado'
    );
  exception when others then
    if sqlerrm like 'DRIVER_DOCUMENT_BUCKET_INVALID%' then v_seen := true; else raise; end if;
  end;
  if not v_seen then raise exception 'Expected invalid driver document bucket to fail'; end if;

  v_seen := false;
  begin
    insert into public.freight_documents (
      tenant_id, vehicle_id, freight_id, driver_id, kind, source,
      file_name, storage_bucket, storage_path, status
    ) values (
      v_tenant_id, v_vehicle_id, v_freight_id, v_driver_id, 'nota_fiscal',
      'motorista_app', 'nota.pdf', 'freight-documents',
      gen_random_uuid()::text || '/' || v_freight_id || '/nota_fiscal/nota.pdf', 'anexado'
    );
  exception when others then
    if sqlerrm like 'DRIVER_DOCUMENT_PATH_INVALID%' then v_seen := true; else raise; end if;
  end;
  if not v_seen then raise exception 'Expected cross-tenant path to fail'; end if;

  insert into public.freight_documents (
    tenant_id, vehicle_id, freight_id, driver_id, kind, source,
    file_name, storage_bucket, storage_path, status
  ) values (
    v_tenant_id, v_vehicle_id, v_freight_id, v_driver_id, 'nota_fiscal',
    'motorista_app', 'nota.pdf', 'freight-documents',
    v_tenant_id || '/' || v_freight_id || '/nota_fiscal/nota.pdf', 'anexado'
  );

  if not exists (
    select 1 from public.freight_documents
    where vehicle_id = v_vehicle_id and freight_id = v_freight_id
  ) then
    raise exception 'Expected valid active-freight document metadata to pass';
  end if;
end;
$$;

rollback;
