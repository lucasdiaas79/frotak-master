-- Frotak - Operacao com embarcador (Ambev SE), fase 4: combustivel e desempenho.
--
-- O que muda (tudo atras dos modulos fuel_control e driver_performance):
--   1. Postos da rede com preco combinado de diesel S10 e Arla, e cerca do posto.
--   2. Perfil de combustivel do veiculo: tanque, meta de km/l, limite de Arla.
--   3. Abastecimento novo pelo app (driver_fuel_register): tanque cheio, posto da rede,
--      posicao, fila offline e conferencias gravadas junto com o cupom:
--        bloqueia: odometro menor que o anterior, litros acima do tanque;
--        alerta:   odometro impossivel (> 90 km/h de media), km do rastreador diverge,
--                  abastecimento muito proximo, preco acima do combinado, Arla fora da faixa,
--                  abastecimento longe do posto informado.
--      Alerta nao impede o registro: o motorista justifica e a central aprova ou recusa.
--   4. km/l de tanque cheio a tanque cheio por veiculo e por motorista.
--
-- O registro antigo (driver_app_register_fuel_document) continua igual para quem ja usa.

begin;

-- 1. Postos ---------------------------------------------------------------------------

create table public.fuel_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  brand text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  geofence_radius_m integer not null default 250 check (geofence_radius_m between 50 and 5000),
  diesel_price numeric(10, 3),
  arla_price numeric(10, 3),
  price_tolerance numeric(10, 3) not null default 0.02,
  payment_methods text[] not null default array['cartao_frota']::text[],
  is_network boolean not null default true,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fuel_stations_tenant_idx on public.fuel_stations (tenant_id) where active;

create trigger fuel_stations_set_updated_at
before update on public.fuel_stations
for each row execute function public.set_updated_at();

-- 2. Perfil do veiculo ----------------------------------------------------------------

create table public.vehicle_fuel_profiles (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete restrict,
  tank_capacity_liters numeric(8, 1) not null default 300 check (tank_capacity_liters > 0),
  arla_tank_liters numeric(8, 1) default 60,
  km_per_liter_target numeric(6, 2) check (km_per_liter_target is null or km_per_liter_target > 0),
  arla_ratio_max numeric(5, 2) not null default 8 check (arla_ratio_max between 0 and 30),
  max_avg_speed_kmh integer not null default 90,
  tracker_divergence_pct numeric(5, 2) not null default 12,
  tracker_divergence_km numeric(8, 1) not null default 15,
  min_hours_between numeric(5, 2) not null default 3,
  updated_at timestamptz not null default now()
);

create trigger vehicle_fuel_profiles_set_updated_at
before update on public.vehicle_fuel_profiles
for each row execute function public.set_updated_at();

-- 3. Colunas novas no abastecimento ---------------------------------------------------

alter table public.fuel_documents
  add column if not exists station_id uuid references public.fuel_stations(id) on delete set null,
  add column if not exists tank_full boolean,
  add column if not exists geo jsonb,
  add column if not exists client_event_id text,
  add column if not exists tracker_km numeric(10, 1),
  add column if not exists checks jsonb not null default '[]'::jsonb,
  add column if not exists review_status text not null default 'ok',
  add column if not exists driver_justification text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.fuel_documents
  drop constraint if exists fuel_documents_review_status_chk;
alter table public.fuel_documents
  add constraint fuel_documents_review_status_chk check (review_status in ('ok', 'pendente', 'aprovado', 'recusado'));

create unique index if not exists fuel_documents_driver_event_uidx
  on public.fuel_documents (driver_id, client_event_id) where client_event_id is not null;
create index if not exists fuel_documents_review_idx
  on public.fuel_documents (tenant_id, review_status) where review_status = 'pendente';

alter table public.fuel_records
  add column if not exists tank_full boolean,
  add column if not exists station_id uuid references public.fuel_stations(id) on delete set null;

create index if not exists fuel_records_vehicle_odometer_idx
  on public.fuel_records (vehicle_id, fuel_type, odometer);

-- 4. RLS ------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['fuel_stations', 'vehicle_fuel_profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.can_access_tenant(tenant_id)) with check (private.can_access_tenant(tenant_id))',
      t || '_tenant_access', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- 5. Funcoes de apoio -----------------------------------------------------------------

-- Distancia em km entre dois pontos (haversine).
create or replace function private.geo_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
returns double precision
language sql
immutable
set search_path = pg_catalog
as $$
  select 6371.0 * 2 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ));
$$;

-- Km rodados segundo o rastreador num intervalo (ignora saltos de GPS acima de 150 km/h).
create or replace function private.tracker_km(p_vehicle_id uuid, p_from timestamptz, p_to timestamptz)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with pts as (
    select lat, lng, recorded_at,
      lag(lat) over w as plat, lag(lng) over w as plng, lag(recorded_at) over w as pat
    from public.vehicle_positions
    where vehicle_id = p_vehicle_id and recorded_at between p_from and p_to
    window w as (order by recorded_at)
  ), legs as (
    select private.geo_km(plat, plng, lat, lng) as km,
      extract(epoch from recorded_at - pat) / 3600.0 as h
    from pts where plat is not null
  )
  select case when count(*) = 0 then null
    else round(sum(km) filter (where h <= 0 or km / nullif(h, 0) <= 150)::numeric, 1) end
  from legs;
$$;

revoke all on function private.tracker_km(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Veiculo do motorista: o vinculado a ele, preferindo o que tem frete ativo.
create or replace function private.driver_vehicle(p_driver public.drivers)
returns public.vehicles
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select v.*
  from public.vehicles v
  where v.tenant_id = p_driver.tenant_id
    and (v.driver_id = p_driver.id or v.id = p_driver.vehicle_id)
  order by (v.current_freight_id is not null) desc, (v.id = p_driver.vehicle_id) desc, v.updated_at desc
  limit 1;
$$;

revoke all on function private.driver_vehicle(public.drivers) from public, anon, authenticated;

-- km/l de tanque cheio a tanque cheio. Soma os litros depois do primeiro tanque cheio
-- ate o ultimo tanque cheio do periodo; parciais no meio entram no total de litros.
create or replace function private.fuel_full_to_full(
  p_vehicle_id uuid,
  p_driver_id uuid default null,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_rows record;
  v_prev_full_odo numeric;
  v_liters_since numeric := 0;
  v_km numeric := 0;
  v_liters numeric := 0;
  v_cycles jsonb := '[]'::jsonb;
begin
  for v_rows in
    select r.odometer, r.liters, coalesce(r.tank_full, true) as tank_full, r.recorded_at, r.driver_id
    from public.fuel_records r
    where r.vehicle_id = p_vehicle_id
      and r.fuel_type = 'diesel_s10'
      and r.recorded_at between p_from and p_to
    order by r.odometer, r.recorded_at
  loop
    if v_prev_full_odo is null then
      if v_rows.tank_full then
        v_prev_full_odo := v_rows.odometer;
      end if;
      continue;
    end if;
    v_liters_since := v_liters_since + v_rows.liters;
    if v_rows.tank_full then
      if v_rows.odometer > v_prev_full_odo and v_liters_since > 0
        and (p_driver_id is null or v_rows.driver_id = p_driver_id) then
        v_km := v_km + (v_rows.odometer - v_prev_full_odo);
        v_liters := v_liters + v_liters_since;
        v_cycles := v_cycles || jsonb_build_object(
          'to_odometer', v_rows.odometer,
          'km', v_rows.odometer - v_prev_full_odo,
          'liters', v_liters_since,
          'kml', round((v_rows.odometer - v_prev_full_odo) / v_liters_since, 2),
          'at', v_rows.recorded_at
        );
      end if;
      v_prev_full_odo := v_rows.odometer;
      v_liters_since := 0;
    end if;
  end loop;

  return jsonb_build_object(
    'km', v_km,
    'liters', v_liters,
    'average', case when v_liters > 0 then round(v_km / v_liters, 2) end,
    'cycles', v_cycles
  );
end;
$$;

revoke all on function private.fuel_full_to_full(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 6. Abastecimento pelo app -----------------------------------------------------------

create or replace function public.driver_fuel_register(
  p_odometer numeric,
  p_diesel_liters numeric default 0,
  p_diesel_amount numeric default 0,
  p_arla_liters numeric default 0,
  p_arla_amount numeric default 0,
  p_tank_full boolean default true,
  p_station_id uuid default null,
  p_station_name text default null,
  p_payment_method text default null,
  p_notes text default null,
  p_justification text default null,
  p_receipt_path text default null,
  p_pump_path text default null,
  p_geo jsonb default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_profile public.vehicle_fuel_profiles;
  v_station public.fuel_stations;
  v_station_name text;
  v_at timestamptz;
  v_geo jsonb;
  v_prev record;
  v_checks jsonb := '[]'::jsonb;
  v_tracker numeric;
  v_hours numeric;
  v_km numeric;
  v_price numeric;
  v_doc public.fuel_documents;
  v_record_id uuid;
  v_trip_cycle_id uuid;
  v_d_l numeric := coalesce(p_diesel_liters, 0);
  v_d_a numeric := coalesce(p_diesel_amount, 0);
  v_a_l numeric := coalesce(p_arla_liters, 0);
  v_a_a numeric := coalesce(p_arla_amount, 0);
begin
  v_driver := private.current_driver_with_module('fuel_control');
  v_at := private.ops_event_time(p_at);
  v_geo := private.ops_clean_geo(p_geo);

  if p_client_event_id is not null and exists (
    select 1 from public.fuel_documents where driver_id = v_driver.id and client_event_id = p_client_event_id
  ) then
    return public.get_driver_ops_context();
  end if;

  v_vehicle := private.driver_vehicle(v_driver);
  if v_vehicle.id is null then
    raise exception 'FUEL_VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(p_odometer, 0) <= 0 then
    raise exception 'FUEL_ODOMETER_REQUIRED' using errcode = '22023';
  end if;
  if v_d_l < 0 or v_d_a < 0 or v_a_l < 0 or v_a_a < 0
    or (v_d_l > 0) <> (v_d_a > 0) or (v_a_l > 0) <> (v_a_a > 0)
    or (v_d_l = 0 and v_a_l = 0) then
    raise exception 'FUEL_ITEMS_INVALID' using errcode = '22023';
  end if;

  select * into v_profile from public.vehicle_fuel_profiles where vehicle_id = v_vehicle.id;
  if not found then
    v_profile.tank_capacity_liters := 300;
    v_profile.arla_ratio_max := 8;
    v_profile.max_avg_speed_kmh := 90;
    v_profile.tracker_divergence_pct := 12;
    v_profile.tracker_divergence_km := 15;
    v_profile.min_hours_between := 3;
  end if;

  if p_station_id is not null then
    select * into v_station from public.fuel_stations
    where id = p_station_id and tenant_id = v_driver.tenant_id and active;
    if not found then
      raise exception 'FUEL_STATION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  v_station_name := coalesce(v_station.name, nullif(btrim(coalesce(p_station_name, '')), ''));
  if v_station_name is null then
    raise exception 'FUEL_STATION_REQUIRED' using errcode = '22023';
  end if;

  -- Abastecimento anterior do veiculo (pelo odometro).
  select odometer, recorded_at into v_prev
  from public.fuel_records
  where vehicle_id = v_vehicle.id and fuel_type = 'diesel_s10'
  order by recorded_at desc
  limit 1;

  -- Conferencias que bloqueiam.
  if v_prev.odometer is not null and p_odometer <= v_prev.odometer then
    raise exception 'FUEL_ODOMETER_LOWER:%', v_prev.odometer using errcode = '22023';
  end if;
  if v_d_l > v_profile.tank_capacity_liters * 1.03 then
    raise exception 'FUEL_ABOVE_TANK:%', v_profile.tank_capacity_liters using errcode = '22023';
  end if;

  -- Conferencias que alertam.
  if v_prev.odometer is not null then
    v_km := p_odometer - v_prev.odometer;
    v_hours := greatest(extract(epoch from v_at - v_prev.recorded_at) / 3600.0, 0.01);
    if v_km / v_hours > v_profile.max_avg_speed_kmh then
      v_checks := v_checks || jsonb_build_object('code', 'odometro_impossivel', 'level', 'alerta',
        'detail', format('%s km em %s h desde o ultimo abastecimento', round(v_km), round(v_hours, 1)));
    end if;
    if v_hours < v_profile.min_hours_between then
      v_checks := v_checks || jsonb_build_object('code', 'abastecimento_proximo', 'level', 'alerta',
        'detail', format('Ultimo abastecimento ha %s h', round(v_hours, 1)));
    end if;
    v_tracker := private.tracker_km(v_vehicle.id, v_prev.recorded_at, v_at);
    if v_tracker is not null and v_tracker > 0
      and abs(v_km - v_tracker) > v_profile.tracker_divergence_km
      and abs(v_km - v_tracker) / v_tracker * 100 > v_profile.tracker_divergence_pct then
      v_checks := v_checks || jsonb_build_object('code', 'rastreador_diverge', 'level', 'alerta',
        'detail', format('Odometro %s km, rastreador %s km', round(v_km), round(v_tracker)));
    end if;
  end if;

  if v_d_l > 0 and v_station.diesel_price is not null then
    v_price := round(v_d_a / v_d_l, 3);
    if v_price > v_station.diesel_price + v_station.price_tolerance then
      v_checks := v_checks || jsonb_build_object('code', 'preco_acima', 'level', 'alerta',
        'detail', format('Pago R$ %s/l, combinado R$ %s/l', v_price, v_station.diesel_price));
    end if;
  end if;

  if v_a_l > 0 and v_d_l > 0 and v_a_l / v_d_l * 100 > v_profile.arla_ratio_max then
    v_checks := v_checks || jsonb_build_object('code', 'arla_fora', 'level', 'alerta',
      'detail', format('Arla %s%% do diesel', round(v_a_l / v_d_l * 100, 1)));
  end if;

  if v_station.lat is not null and v_geo is not null
    and private.geo_km(v_station.lat, v_station.lng, (v_geo->>'lat')::float8, (v_geo->>'lng')::float8) * 1000 > v_station.geofence_radius_m * 4 then
    v_checks := v_checks || jsonb_build_object('code', 'fora_do_posto', 'level', 'alerta',
      'detail', 'Registro feito longe do posto informado');
  end if;

  if jsonb_array_length(v_checks) > 0 and btrim(coalesce(p_justification, '')) = '' then
    raise exception 'FUEL_JUSTIFICATION_REQUIRED' using errcode = '22023';
  end if;

  if v_vehicle.current_freight_id is not null then
    v_trip_cycle_id := private.trip_cycle_for_freight(v_vehicle.tenant_id, v_vehicle.current_freight_id);
  end if;

  insert into public.fuel_documents (
    tenant_id, vehicle_id, driver_id, vehicle_plate, driver_name, station, station_id, payment_method,
    odometer, diesel_liters, diesel_amount, arla_liters, arla_amount, notes, source, recorded_at,
    tank_full, geo, client_event_id, tracker_km, checks, review_status, driver_justification
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_driver.id, v_vehicle.plate, v_driver.name, v_station_name, v_station.id,
    nullif(btrim(coalesce(p_payment_method, '')), ''), p_odometer, v_d_l, v_d_a, v_a_l, v_a_a,
    nullif(btrim(coalesce(p_notes, '')), ''), 'driver_app', v_at,
    coalesce(p_tank_full, true), v_geo, p_client_event_id, v_tracker, v_checks,
    case when jsonb_array_length(v_checks) > 0 then 'pendente' else 'ok' end,
    nullif(btrim(coalesce(p_justification, '')), '')
  )
  returning * into v_doc;

  if nullif(btrim(coalesce(p_receipt_path, '')), '') is not null then
    insert into public.fuel_document_files (tenant_id, fuel_document_id, kind, file_name, storage_bucket, storage_path, mime_type)
    values (v_doc.tenant_id, v_doc.id, 'receipt_photo', 'foto-cupom', 'driver-ops', btrim(p_receipt_path), 'image/jpeg');
  end if;
  if nullif(btrim(coalesce(p_pump_path, '')), '') is not null then
    insert into public.fuel_document_files (tenant_id, fuel_document_id, kind, file_name, storage_bucket, storage_path, mime_type)
    values (v_doc.tenant_id, v_doc.id, 'pump_photo', 'foto-bomba', 'driver-ops', btrim(p_pump_path), 'image/jpeg');
  end if;

  if v_d_l > 0 then
    insert into public.fuel_records (
      tenant_id, vehicle_id, driver_id, freight_id, trip_cycle_id, vehicle_plate, driver_name, station, station_id,
      fuel_type, liters, amount, odometer, notes, fuel_document_id, recorded_at, tank_full,
      storage_bucket, storage_path
    )
    values (
      v_doc.tenant_id, v_vehicle.id, v_driver.id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.plate,
      v_driver.name, v_station_name, v_station.id, 'diesel_s10', v_d_l, v_d_a, p_odometer, v_doc.notes, v_doc.id,
      v_at, coalesce(p_tank_full, true),
      case when p_receipt_path is not null then 'driver-ops' end, nullif(btrim(coalesce(p_receipt_path, '')), '')
    )
    returning id into v_record_id;

    if v_vehicle.current_freight_id is not null then
      insert into public.freight_expenses (tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, fuel_record_id,
        category, description, amount, notes, source, recorded_by, recorded_at)
      values (v_doc.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id, v_driver.id, v_record_id,
        'diesel_s10', 'Diesel S10', v_d_a, v_doc.notes, 'driver_app', auth.uid(), v_at);
    end if;
  end if;

  if v_a_l > 0 then
    insert into public.fuel_records (
      tenant_id, vehicle_id, driver_id, freight_id, trip_cycle_id, vehicle_plate, driver_name, station, station_id,
      fuel_type, liters, amount, odometer, notes, fuel_document_id, recorded_at
    )
    values (
      v_doc.tenant_id, v_vehicle.id, v_driver.id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.plate,
      v_driver.name, v_station_name, v_station.id, 'arla', v_a_l, v_a_a, p_odometer, v_doc.notes, v_doc.id, v_at
    )
    returning id into v_record_id;

    if v_vehicle.current_freight_id is not null then
      insert into public.freight_expenses (tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, fuel_record_id,
        category, description, amount, notes, source, recorded_by, recorded_at)
      values (v_doc.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id, v_driver.id, v_record_id,
        'arla', 'Arla 32', v_a_a, v_doc.notes, 'driver_app', auth.uid(), v_at);
    end if;
  end if;

  -- Parada no posto conta como "outros trabalhos" na jornada.
  if private.tenant_has_module(v_driver.tenant_id, 'driver_journey') and exists (
    select 1 from public.driver_work_days where driver_id = v_driver.id and ended_at is null
  ) then
    perform private.journey_set_activity(v_driver, 'trabalho', 'etapa', 'Abastecimento em ' || v_station_name, v_at, p_geo, null, null, null);
  end if;

  return public.get_driver_ops_context();
end;
$$;

-- Central: aprova ou recusa um abastecimento com alerta.
create or replace function public.fuel_review(p_fuel_document_id uuid, p_approve boolean, p_note text default null)
returns public.fuel_documents
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_doc public.fuel_documents;
begin
  select * into v_doc from public.fuel_documents where id = p_fuel_document_id for update;
  if not found or not private.can_access_tenant(v_doc.tenant_id) then
    raise exception 'FUEL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.tenant_has_module(v_doc.tenant_id, 'fuel_control') then
    raise exception 'MODULE_DISABLED:fuel_control' using errcode = '42501';
  end if;
  update public.fuel_documents
  set review_status = case when p_approve then 'aprovado' else 'recusado' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_doc.id
  returning * into v_doc;
  return v_doc;
end;
$$;

-- Central: km/l de um veiculo (ou de um motorista nele) no periodo.
create or replace function public.fuel_efficiency(
  p_vehicle_id uuid,
  p_driver_id uuid default null,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.vehicles where id = p_vehicle_id;
  if v_tenant is null or not private.can_access_tenant(v_tenant) then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.fuel_full_to_full(p_vehicle_id, p_driver_id, p_from, p_to)
    || jsonb_build_object('target', (select km_per_liter_target from public.vehicle_fuel_profiles where vehicle_id = p_vehicle_id));
end;
$$;

revoke all on function public.driver_fuel_register(numeric, numeric, numeric, numeric, numeric, boolean, uuid, text, text, text, text, text, text, jsonb, timestamptz, text) from public, anon;
revoke all on function public.fuel_review(uuid, boolean, text) from public, anon;
revoke all on function public.fuel_efficiency(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.driver_fuel_register(numeric, numeric, numeric, numeric, numeric, boolean, uuid, text, text, text, text, text, text, jsonb, timestamptz, text) to authenticated;
grant execute on function public.fuel_review(uuid, boolean, text) to authenticated;
grant execute on function public.fuel_efficiency(uuid, uuid, timestamptz, timestamptz) to authenticated;

commit;
