create or replace function private.current_driver_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select d.tenant_id
  from public.drivers d
  where d.auth_user_id = auth.uid()
    and d.active = true
  limit 1
$$;

revoke all on function private.current_driver_tenant_id() from public, anon, authenticated;
grant execute on function private.current_driver_tenant_id() to authenticated;

create table if not exists public.fuel_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_plate text not null,
  driver_name text,
  station text not null,
  payment_method text,
  odometer numeric not null default 0,
  diesel_liters numeric not null default 0,
  diesel_amount numeric not null default 0,
  arla_liters numeric not null default 0,
  arla_amount numeric not null default 0,
  notes text,
  source text not null default 'driver_app',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_documents_any_item_chk check (
    (diesel_liters > 0 and diesel_amount > 0)
    or (arla_liters > 0 and arla_amount > 0)
  ),
  constraint fuel_documents_non_negative_chk check (
    diesel_liters >= 0
    and diesel_amount >= 0
    and arla_liters >= 0
    and arla_amount >= 0
  )
);

create table if not exists public.fuel_document_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  fuel_document_id uuid not null references public.fuel_documents(id) on delete cascade,
  kind text not null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint fuel_document_files_kind_chk check (kind in ('pump_photo', 'receipt_photo')),
  constraint fuel_document_files_size_chk check (size_bytes is null or size_bytes >= 0),
  constraint fuel_document_files_document_kind_uidx unique (fuel_document_id, kind)
);

alter table public.fuel_records
  add column if not exists fuel_document_id uuid references public.fuel_documents(id) on delete set null;

create index if not exists fuel_documents_tenant_id_idx on public.fuel_documents(tenant_id);
create index if not exists fuel_documents_vehicle_id_idx on public.fuel_documents(vehicle_id);
create index if not exists fuel_documents_recorded_at_idx on public.fuel_documents(recorded_at desc);
create index if not exists fuel_document_files_tenant_id_idx on public.fuel_document_files(tenant_id);
create index if not exists fuel_document_files_document_id_idx on public.fuel_document_files(fuel_document_id);
create index if not exists fuel_records_fuel_document_id_idx on public.fuel_records(fuel_document_id);

create trigger fuel_documents_set_updated_at before update on public.fuel_documents
for each row execute function public.set_updated_at();

alter table public.fuel_documents enable row level security;
alter table public.fuel_document_files enable row level security;

grant select, insert, update, delete on table
  public.fuel_documents,
  public.fuel_document_files
to authenticated;

create policy fuel_documents_tenant_access on public.fuel_documents
for all to authenticated
using (
  private.can_access_tenant(tenant_id)
  or private.current_driver_tenant_id() = tenant_id
)
with check (
  private.can_access_tenant(tenant_id)
  or private.current_driver_tenant_id() = tenant_id
);

create policy fuel_document_files_tenant_access on public.fuel_document_files
for all to authenticated
using (
  private.can_access_tenant(tenant_id)
  or private.current_driver_tenant_id() = tenant_id
)
with check (
  private.can_access_tenant(tenant_id)
  or private.current_driver_tenant_id() = tenant_id
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-fuel-documents',
  'driver-fuel-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy driver_fuel_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or private.current_driver_tenant_id() = ((storage.foldername(name))[1])::uuid
  )
);

create policy driver_fuel_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'driver-fuel-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or private.current_driver_tenant_id() = ((storage.foldername(name))[1])::uuid
  )
);

create policy driver_fuel_documents_update on storage.objects
for update to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or private.current_driver_tenant_id() = ((storage.foldername(name))[1])::uuid
  )
)
with check (
  bucket_id = 'driver-fuel-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or private.current_driver_tenant_id() = ((storage.foldername(name))[1])::uuid
  )
);

create policy driver_fuel_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and (
    private.can_access_tenant(((storage.foldername(name))[1])::uuid)
    or private.current_driver_tenant_id() = ((storage.foldername(name))[1])::uuid
  )
);

create or replace function public.driver_app_register_fuel_document(
  p_station text,
  p_odometer numeric,
  p_diesel_liters numeric default null,
  p_diesel_amount numeric default null,
  p_arla_liters numeric default null,
  p_arla_amount numeric default null,
  p_notes text default null,
  p_payment_method text default null,
  p_pump_photo_id uuid default null,
  p_pump_photo_file_name text default null,
  p_pump_photo_storage_bucket text default null,
  p_pump_photo_storage_path text default null,
  p_pump_photo_mime_type text default null,
  p_pump_photo_size_bytes bigint default null,
  p_receipt_photo_id uuid default null,
  p_receipt_photo_file_name text default null,
  p_receipt_photo_storage_bucket text default null,
  p_receipt_photo_storage_path text default null,
  p_receipt_photo_mime_type text default null,
  p_receipt_photo_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_document public.fuel_documents;
  v_record public.fuel_records;
  v_expense public.freight_expenses;
  v_diesel_liters numeric := coalesce(p_diesel_liters, 0);
  v_diesel_amount numeric := coalesce(p_diesel_amount, 0);
  v_arla_liters numeric := coalesce(p_arla_liters, 0);
  v_arla_amount numeric := coalesce(p_arla_amount, 0);
  v_record_ids uuid[] := '{}';
  v_expense_ids uuid[] := '{}';
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where tenant_id = v_driver.tenant_id
    and (
      driver_id = v_driver.id
      or id = v_driver.vehicle_id
    )
  order by
    (current_freight_id is not null) desc,
    updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  if nullif(trim(coalesce(p_station, '')), '') is null then
    raise exception 'station is required';
  end if;

  if coalesce(p_odometer, 0) <= 0 then
    raise exception 'odometer is required';
  end if;

  if v_diesel_liters < 0 or v_diesel_amount < 0 or v_arla_liters < 0 or v_arla_amount < 0 then
    raise exception 'fuel values cannot be negative';
  end if;

  if (v_diesel_liters > 0 and v_diesel_amount <= 0) or (v_diesel_liters <= 0 and v_diesel_amount > 0) then
    raise exception 'diesel liters and amount must be filled together';
  end if;

  if (v_arla_liters > 0 and v_arla_amount <= 0) or (v_arla_liters <= 0 and v_arla_amount > 0) then
    raise exception 'arla liters and amount must be filled together';
  end if;

  if (v_diesel_liters <= 0 or v_diesel_amount <= 0) and (v_arla_liters <= 0 or v_arla_amount <= 0) then
    raise exception 'at least one fuel item is required';
  end if;

  insert into public.fuel_documents (
    tenant_id,
    vehicle_id,
    driver_id,
    vehicle_plate,
    driver_name,
    station,
    payment_method,
    odometer,
    diesel_liters,
    diesel_amount,
    arla_liters,
    arla_amount,
    notes,
    source
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_driver.id,
    v_vehicle.plate,
    v_driver.name,
    trim(p_station),
    nullif(trim(coalesce(p_payment_method, '')), ''),
    p_odometer,
    v_diesel_liters,
    v_diesel_amount,
    v_arla_liters,
    v_arla_amount,
    nullif(trim(coalesce(p_notes, '')), ''),
    'driver_app'
  )
  returning * into v_document;

  if p_pump_photo_id is not null and nullif(trim(coalesce(p_pump_photo_storage_path, '')), '') is not null then
    insert into public.fuel_document_files (
      id,
      tenant_id,
      fuel_document_id,
      kind,
      file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      p_pump_photo_id,
      v_vehicle.tenant_id,
      v_document.id,
      'pump_photo',
      coalesce(nullif(trim(coalesce(p_pump_photo_file_name, '')), ''), 'foto-bomba'),
      coalesce(nullif(trim(coalesce(p_pump_photo_storage_bucket, '')), ''), 'driver-fuel-documents'),
      trim(p_pump_photo_storage_path),
      nullif(trim(coalesce(p_pump_photo_mime_type, '')), ''),
      p_pump_photo_size_bytes
    );
  end if;

  if p_receipt_photo_id is not null and nullif(trim(coalesce(p_receipt_photo_storage_path, '')), '') is not null then
    insert into public.fuel_document_files (
      id,
      tenant_id,
      fuel_document_id,
      kind,
      file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      p_receipt_photo_id,
      v_vehicle.tenant_id,
      v_document.id,
      'receipt_photo',
      coalesce(nullif(trim(coalesce(p_receipt_photo_file_name, '')), ''), 'foto-cupom'),
      coalesce(nullif(trim(coalesce(p_receipt_photo_storage_bucket, '')), ''), 'driver-fuel-documents'),
      trim(p_receipt_photo_storage_path),
      nullif(trim(coalesce(p_receipt_photo_mime_type, '')), ''),
      p_receipt_photo_size_bytes
    );
  end if;

  if v_diesel_liters > 0 and v_diesel_amount > 0 then
    insert into public.fuel_records (
      tenant_id,
      vehicle_id,
      driver_id,
      vehicle_plate,
      driver_name,
      station,
      fuel_type,
      liters,
      amount,
      odometer,
      notes,
      invoice_file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes,
      fuel_document_id
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.id,
      v_driver.id,
      v_vehicle.plate,
      v_driver.name,
      trim(p_station),
      'diesel_s10',
      v_diesel_liters,
      v_diesel_amount,
      p_odometer,
      nullif(trim(coalesce(p_notes, '')), ''),
      p_receipt_photo_file_name,
      p_receipt_photo_storage_bucket,
      p_receipt_photo_storage_path,
      p_receipt_photo_mime_type,
      p_receipt_photo_size_bytes,
      v_document.id
    )
    returning * into v_record;

    v_record_ids := array_append(v_record_ids, v_record.id);

    insert into public.freight_expenses (
      tenant_id,
      freight_id,
      vehicle_id,
      driver_id,
      fuel_record_id,
      category,
      description,
      amount,
      notes,
      source,
      recorded_by
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.current_freight_id,
      v_vehicle.id,
      v_driver.id,
      v_record.id,
      'diesel_s10',
      'Diesel S10',
      v_diesel_amount,
      nullif(trim(coalesce(p_notes, '')), ''),
      'driver_app',
      auth.uid()
    )
    returning * into v_expense;

    v_expense_ids := array_append(v_expense_ids, v_expense.id);
  end if;

  if v_arla_liters > 0 and v_arla_amount > 0 then
    insert into public.fuel_records (
      tenant_id,
      vehicle_id,
      driver_id,
      vehicle_plate,
      driver_name,
      station,
      fuel_type,
      liters,
      amount,
      odometer,
      notes,
      invoice_file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes,
      fuel_document_id
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.id,
      v_driver.id,
      v_vehicle.plate,
      v_driver.name,
      trim(p_station),
      'arla',
      v_arla_liters,
      v_arla_amount,
      p_odometer,
      nullif(trim(coalesce(p_notes, '')), ''),
      p_receipt_photo_file_name,
      p_receipt_photo_storage_bucket,
      p_receipt_photo_storage_path,
      p_receipt_photo_mime_type,
      p_receipt_photo_size_bytes,
      v_document.id
    )
    returning * into v_record;

    v_record_ids := array_append(v_record_ids, v_record.id);

    insert into public.freight_expenses (
      tenant_id,
      freight_id,
      vehicle_id,
      driver_id,
      fuel_record_id,
      category,
      description,
      amount,
      notes,
      source,
      recorded_by
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.current_freight_id,
      v_vehicle.id,
      v_driver.id,
      v_record.id,
      'arla',
      'Arla',
      v_arla_amount,
      nullif(trim(coalesce(p_notes, '')), ''),
      'driver_app',
      auth.uid()
    )
    returning * into v_expense;

    v_expense_ids := array_append(v_expense_ids, v_expense.id);
  end if;

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
    'Abastecimento registrado pelo aplicativo do motorista',
    auth.uid(),
    'driver_fuel_registered',
    'driver_app',
    jsonb_build_object(
      'driver_id',
      v_driver.id,
      'fuel_document_id',
      v_document.id,
      'fuel_record_ids',
      v_record_ids,
      'expense_ids',
      v_expense_ids,
      'has_pump_photo',
      p_pump_photo_id is not null,
      'has_receipt_photo',
      p_receipt_photo_id is not null
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_fuel_document(
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  uuid,
  text,
  text,
  text,
  text,
  bigint
) from public, anon, authenticated;

grant execute on function public.driver_app_register_fuel_document(
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  uuid,
  text,
  text,
  text,
  text,
  bigint
) to authenticated;

notify pgrst, 'reload schema';
