-- Frotak - Operacao com embarcador (Ambev SE): configuracao, nota do motorista e
-- contexto unico do app.
--
--   1. driver_ops_settings: rotulo da operacao, embarcador, limite de velocidade,
--      pesos da nota e faixas de premio por tenant.
--   2. private.driver_score: nota do mes com consumo (tanque cheio a tanque cheio),
--      velocidade (rastreador), motor ocioso (sem dado ate ligar a leitura de ignicao),
--      pontualidade nas janelas, checklist e documentos/canhotos. Linha sem dado fica
--      de fora e a nota e recalculada sobre o que existe.
--   3. get_driver_ops_context: tudo o que o app precisa numa chamada, no formato das
--      telas do app (camelCase). Toda RPC do motorista devolve este contexto.

begin;

create table public.driver_ops_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  operation_label text not null default 'Operacao',
  shipper_name text,
  base_city text,
  time_zone text not null default 'America/Sao_Paulo',
  speed_limit_kmh integer not null default 80 check (speed_limit_kmh between 30 and 130),
  score_weights jsonb not null default
    '{"consumo":30,"velocidade":20,"ociosidade":15,"pontualidade":15,"checklist":10,"documentos":10}'::jsonb,
  prize_tiers jsonb not null default
    '[{"min":90,"amount":400,"label":"Ouro"},{"min":80,"amount":250,"label":"Prata"},{"min":70,"amount":120,"label":"Bronze"}]'::jsonb,
  emergency_phone text,
  updated_at timestamptz not null default now()
);

create trigger driver_ops_settings_set_updated_at before update on public.driver_ops_settings
for each row execute function public.set_updated_at();

alter table public.driver_ops_settings enable row level security;
create policy driver_ops_settings_tenant_access on public.driver_ops_settings
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
grant select, insert, update on public.driver_ops_settings to authenticated;

-- Nota do motorista ---------------------------------------------------------------------

create or replace function private.driver_score(
  p_driver_id uuid,
  p_from timestamptz default date_trunc('month', now()),
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_settings public.driver_ops_settings;
  v_w jsonb;
  v_vehicle public.vehicles;
  v_fuel jsonb;
  v_kml numeric;
  v_target numeric;
  v_ratio numeric;
  v_lines jsonb := '[]'::jsonb;
  v_pts integer;
  v_max integer;
  v_n integer;
  v_m integer;
  v_sum integer := 0;
  v_sum_max integer := 0;
  v_total integer;
  v_tier jsonb;
  v_tz text;
begin
  select * into v_driver from public.drivers where id = p_driver_id;
  if not found then
    return null;
  end if;
  select * into v_settings from public.driver_ops_settings where tenant_id = v_driver.tenant_id;
  v_w := coalesce(v_settings.score_weights,
    '{"consumo":30,"velocidade":20,"ociosidade":15,"pontualidade":15,"checklist":10,"documentos":10}'::jsonb);
  v_tz := coalesce(v_settings.time_zone, 'America/Sao_Paulo');
  v_vehicle := private.driver_vehicle(v_driver);

  -- Consumo
  v_max := coalesce((v_w->>'consumo')::int, 30);
  if v_vehicle.id is not null then
    v_fuel := private.fuel_full_to_full(v_vehicle.id, v_driver.id, p_from - interval '30 days', p_to);
    v_kml := (v_fuel->>'average')::numeric;
    select km_per_liter_target into v_target from public.vehicle_fuel_profiles where vehicle_id = v_vehicle.id;
  end if;
  if v_kml is not null and v_target is not null then
    v_ratio := least(1.1, v_kml / v_target);
    v_pts := round(v_max * greatest(0, least(1, (v_ratio - 0.85) / 0.2)));
    v_lines := v_lines || jsonb_build_object('key', 'consumo', 'label', 'Consumo (km/l)', 'points', v_pts, 'max', v_max,
      'available', true, 'why', format('Media %s km/l, meta %s km/l (%s%% da meta).', v_kml, v_target, round(v_ratio * 100)));
    v_sum := v_sum + v_pts; v_sum_max := v_sum_max + v_max;
  else
    v_lines := v_lines || jsonb_build_object('key', 'consumo', 'label', 'Consumo (km/l)', 'points', 0, 'max', v_max,
      'available', false, 'why', 'Faltam dois abastecimentos de tanque cheio ou a meta do veiculo.');
  end if;

  -- Velocidade: episodios acima do limite (blocos de 10 min com alguma leitura acima).
  v_max := coalesce((v_w->>'velocidade')::int, 20);
  if v_vehicle.id is not null and exists (
    select 1 from public.vehicle_positions where vehicle_id = v_vehicle.id and recorded_at between p_from and p_to and speed is not null
  ) then
    select count(distinct floor(extract(epoch from recorded_at) / 600)) into v_n
    from public.vehicle_positions
    where vehicle_id = v_vehicle.id and recorded_at between p_from and p_to
      and speed > coalesce(v_settings.speed_limit_kmh, 80);
    v_pts := greatest(0, v_max - v_n * 4);
    v_lines := v_lines || jsonb_build_object('key', 'velocidade', 'label', 'Velocidade', 'points', v_pts, 'max', v_max,
      'available', true, 'why', format('%s excesso(s) acima de %s km/h no periodo (-4 cada).', v_n, coalesce(v_settings.speed_limit_kmh, 80)));
    v_sum := v_sum + v_pts; v_sum_max := v_sum_max + v_max;
  else
    v_lines := v_lines || jsonb_build_object('key', 'velocidade', 'label', 'Velocidade', 'points', 0, 'max', v_max,
      'available', false, 'why', 'Sem posicoes do rastreador no periodo.');
  end if;

  -- Motor ocioso: depende da leitura de ignicao do rastreador (ainda nao mapeada).
  v_max := coalesce((v_w->>'ociosidade')::int, 15);
  v_lines := v_lines || jsonb_build_object('key', 'ociosidade', 'label', 'Motor ligado parado', 'points', 0, 'max', v_max,
    'available', false, 'why', 'Aguardando a leitura de ignicao do rastreador.');

  -- Pontualidade nas janelas.
  v_max := coalesce((v_w->>'pontualidade')::int, 15);
  select count(*), count(*) filter (where (s.arrived_at at time zone v_tz)::time > s.window_to)
    into v_n, v_m
  from public.delivery_route_stops s
  join public.delivery_routes r on r.id = s.route_id
  where r.driver_id = v_driver.id and s.kind = 'entrega' and s.window_to is not null
    and s.arrived_at between p_from and p_to;
  if v_n > 0 then
    v_pts := greatest(0, v_max - v_m * 3);
    v_lines := v_lines || jsonb_build_object('key', 'pontualidade', 'label', 'Pontualidade nas janelas', 'points', v_pts, 'max', v_max,
      'available', true, 'why', format('%s de %s chegadas fora da janela (-3 cada).', v_m, v_n));
    v_sum := v_sum + v_pts; v_sum_max := v_sum_max + v_max;
  else
    v_lines := v_lines || jsonb_build_object('key', 'pontualidade', 'label', 'Pontualidade nas janelas', 'points', 0, 'max', v_max,
      'available', false, 'why', 'Nenhuma entrega com janela no periodo.');
  end if;

  -- Checklist: dias trabalhados com checklist de saida.
  v_max := coalesce((v_w->>'checklist')::int, 10);
  select count(distinct d.work_date),
         count(distinct d.work_date) filter (where exists (
           select 1 from public.vehicle_checklists c
           where c.driver_id = v_driver.id and c.moment = 'saida'
             and (c.performed_at at time zone v_tz)::date = d.work_date))
    into v_n, v_m
  from public.driver_work_days d
  where d.driver_id = v_driver.id and d.started_at between p_from and p_to;
  if v_n > 0 then
    v_pts := round(v_max * v_m::numeric / v_n);
    v_lines := v_lines || jsonb_build_object('key', 'checklist', 'label', 'Checklist do veiculo', 'points', v_pts, 'max', v_max,
      'available', true, 'why', format('Checklist de saida em %s de %s dias.', v_m, v_n));
    v_sum := v_sum + v_pts; v_sum_max := v_sum_max + v_max;
  else
    v_lines := v_lines || jsonb_build_object('key', 'checklist', 'label', 'Checklist do veiculo', 'points', 0, 'max', v_max,
      'available', false, 'why', 'Nenhum dia de trabalho no periodo.');
  end if;

  -- Documentos vencidos e canhotos sem assinatura nem foto.
  v_max := coalesce((v_w->>'documentos')::int, 10);
  select count(*) into v_n from public.driver_compliance_documents
  where driver_id = v_driver.id and expires_at < (now() at time zone v_tz)::date;
  select count(*) into v_m
  from public.delivery_route_stops s join public.delivery_routes r on r.id = s.route_id
  where r.driver_id = v_driver.id and s.kind = 'entrega' and s.status in ('entregue', 'parcial')
    and s.finished_at between p_from and p_to
    and s.signature_data is null and cardinality(s.pod_photo_paths) = 0;
  v_pts := greatest(0, v_max - v_n * 5 - v_m);
  v_lines := v_lines || jsonb_build_object('key', 'documentos', 'label', 'Documentos e canhotos', 'points', v_pts, 'max', v_max,
    'available', true, 'why', format('%s documento(s) vencido(s) (-5 cada) e %s canhoto(s) sem assinatura ou foto (-1 cada).', v_n, v_m));
  v_sum := v_sum + v_pts; v_sum_max := v_sum_max + v_max;

  v_total := case when v_sum_max > 0 then round(v_sum * 100.0 / v_sum_max) else 0 end;
  select t into v_tier
  from jsonb_array_elements(coalesce(v_settings.prize_tiers,
    '[{"min":90,"amount":400,"label":"Ouro"},{"min":80,"amount":250,"label":"Prata"},{"min":70,"amount":120,"label":"Bronze"}]'::jsonb)) t
  where v_total >= (t->>'min')::int
  order by (t->>'min')::int desc
  limit 1;

  return jsonb_build_object('total', v_total, 'lines', v_lines, 'tier', v_tier, 'kmPerLiter', v_kml,
    'from', p_from, 'to', p_to);
end;
$$;

revoke all on function private.driver_score(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Central: nota de um motorista.
create or replace function public.driver_score_report(p_driver_id uuid, p_from timestamptz default date_trunc('month', now()), p_to timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.drivers where id = p_driver_id;
  if v_tenant is null or not private.can_access_tenant(v_tenant) then
    raise exception 'DRIVER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.tenant_has_module(v_tenant, 'driver_performance') then
    raise exception 'MODULE_DISABLED:driver_performance' using errcode = '42501';
  end if;
  return private.driver_score(p_driver_id, p_from, p_to);
end;
$$;

revoke all on function public.driver_score_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.driver_score_report(uuid, timestamptz, timestamptz) to authenticated;

-- Contexto do app -------------------------------------------------------------------------

create or replace function private.ops_stop_json(s public.delivery_route_stops)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', s.id, 'order', s.seq, 'kind', s.kind, 'name', s.name, 'document', s.document,
    'address', coalesce(s.address, ''), 'city', coalesce(s.city, ''),
    'geo', jsonb_build_object('lat', s.lat, 'lng', s.lng), 'radiusMeters', s.radius_m,
    'window', case when s.window_from is not null and s.window_to is not null then
      jsonb_build_object('from', to_char(s.window_from, 'HH24:MI'), 'to', to_char(s.window_to, 'HH24:MI')) end,
    'dock', s.dock, 'invoices', s.invoices, 'returnablesExpected', s.returnables_expected,
    'payment', s.payment_expected, 'status', s.status,
    'arrivedAt', s.arrived_at, 'unloadStartedAt', s.unload_started_at, 'finishedAt', s.finished_at,
    'arrivalGeo', s.arrival_geo, 'departureGeo', s.departure_geo, 'arrivalSource', s.arrival_source,
    'delivered', case when s.finished_at is not null and s.kind in ('entrega', 'destino') then jsonb_build_object(
      'boxesDelivered', coalesce(s.boxes_delivered, 0), 'refusalReason', s.refusal_reason, 'refusalNote', s.refusal_note,
      'receiverName', s.receiver_name, 'signature', case when s.signature_data is not null then 'enviada' end,
      'podPhoto', cardinality(s.pod_photo_paths) > 0, 'returnables', s.returnables_collected, 'payment', s.payment_received) end
  ));
$$;

create or replace function public.get_driver_ops_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_tenant public.tenants;
  v_settings public.driver_ops_settings;
  v_profile public.vehicle_fuel_profiles;
  v_tz text;
  v_modules text[];
  v_active_route uuid;
  v_last_fuel timestamptz;
  v_odometer numeric;
begin
  v_driver := private.current_driver();
  v_vehicle := private.driver_vehicle(v_driver);
  select * into v_tenant from public.tenants where id = v_driver.tenant_id;
  select * into v_settings from public.driver_ops_settings where tenant_id = v_driver.tenant_id;
  select * into v_profile from public.vehicle_fuel_profiles where vehicle_id = v_vehicle.id;
  v_tz := coalesce(v_settings.time_zone, 'America/Sao_Paulo');

  select coalesce(array_agg(code order by code), '{}') into v_modules
  from unnest(array['driver_journey', 'driver_safety', 'fuel_control', 'delivery_routes', 'driver_performance']) code
  where private.tenant_has_module(v_driver.tenant_id, code);

  select id into v_active_route from public.delivery_routes
  where driver_id = v_driver.id and status in ('em_andamento', 'agendada')
  order by (status = 'em_andamento') desc, scheduled_at
  limit 1;

  select max(recorded_at), max(odometer) into v_last_fuel, v_odometer
  from public.fuel_records where vehicle_id = v_vehicle.id and fuel_type = 'diesel_s10';

  return jsonb_build_object(
    'source', 'frotak',
    'serverTime', now(),
    'modules', to_jsonb(v_modules),
    'tenant', jsonb_build_object(
      'id', v_tenant.id,
      'name', coalesce(v_tenant.trade_name, v_tenant.legal_name),
      'operation', coalesce(v_settings.operation_label, 'Operacao'),
      'shipper', coalesce(v_settings.shipper_name, ''),
      'city', coalesce(v_settings.base_city, ''),
      'timeZone', v_tz,
      'emergencyPhone', v_settings.emergency_phone
    ),
    'driver', jsonb_build_object('id', v_driver.id, 'name', v_driver.name, 'phone', coalesce(v_driver.phone, '')),
    'vehicle', case when v_vehicle.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'id', v_vehicle.id, 'plate', v_vehicle.plate,
      'model', btrim(coalesce(v_vehicle.brand, '') || ' ' || coalesce(v_vehicle.model, '')),
      'year', v_vehicle.manufacture_year,
      'tankLiters', coalesce(v_profile.tank_capacity_liters, 300),
      'kmPerLiterTarget', v_profile.km_per_liter_target,
      'odometer', greatest(coalesce(v_odometer, 0), coalesce((
        select max(greatest(coalesce(end_odometer, 0), coalesce(start_odometer, 0)))
        from public.delivery_routes where vehicle_id = v_vehicle.id), 0)),
      'trackerKmSinceLastFuel', case when v_last_fuel is not null then private.tracker_km(v_vehicle.id, v_last_fuel, now()) end,
      'lastPosition', case when v_vehicle.lat is not null then jsonb_build_object('lat', v_vehicle.lat, 'lng', v_vehicle.lng, 'at', v_vehicle.last_position_at) end
    )) end,

    'previousDayEndedAt', (
      select max(ended_at) from public.driver_work_days where driver_id = v_driver.id and ended_at is not null
    ),
    'workDays', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', d.id, 'date', d.work_date, 'startedAt', d.started_at, 'endedAt', d.ended_at,
        'confirmedByDriverAt', d.confirmed_by_driver_at,
        'segments', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', p.id, 'activity', p.activity, 'startAt', p.started_at, 'endAt', p.ended_at,
            'source', p.source, 'reason', p.reason, 'geo', p.geo,
            'adjustment', case when p.original_started_at is not null then jsonb_build_object(
              'by', 'motorista', 'reason', p.adjustment_reason, 'originalStartAt', p.original_started_at,
              'at', p.adjustment_requested_at, 'status', p.adjustment_status) end,
            'synced', true
          )) order by p.started_at)
          from public.driver_punches p where p.work_day_id = d.id
        ), '[]'::jsonb)
      )) order by d.started_at)
      from public.driver_work_days d
      where d.driver_id = v_driver.id and d.started_at > now() - interval '8 days'
    ), '[]'::jsonb),

    'activeTripId', v_active_route,
    'trips', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', r.id, 'code', r.code, 'kind', r.kind, 'title', r.title, 'shipper', coalesce(r.shipper_name, ''),
        'scheduledAt', r.scheduled_at, 'status', r.status, 'startedAt', r.started_at, 'finishedAt', r.finished_at,
        'startOdometer', r.start_odometer, 'endOdometer', r.end_odometer,
        'currentStopIndex', r.current_stop_index, 'totalBoxes', r.total_boxes,
        'totalWeightKg', r.total_weight_kg, 'distanceKm', coalesce(r.distance_km, 0),
        'stops', coalesce((
          select jsonb_agg(private.ops_stop_json(s) order by s.seq)
          from public.delivery_route_stops s where s.route_id = r.id
        ), '[]'::jsonb)
      )) order by r.scheduled_at)
      from public.delivery_routes r
      where r.driver_id = v_driver.id
        and (r.status in ('agendada', 'em_andamento') or r.finished_at > now() - interval '2 days')
    ), '[]'::jsonb),

    'stations', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', st.id, 'name', st.name, 'brand', coalesce(st.brand, ''), 'city', coalesce(st.city, ''),
        'geo', jsonb_build_object('lat', st.lat, 'lng', st.lng),
        'negotiatedDieselPrice', st.diesel_price, 'negotiatedArlaPrice', st.arla_price,
        'paymentTerms', array_to_string(st.payment_methods, ', '), 'accredited', st.is_network
      )) order by st.name)
      from public.fuel_stations st where st.tenant_id = v_driver.tenant_id and st.active
    ), '[]'::jsonb),

    'fuelRecords', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', fd.id, 'at', fd.recorded_at, 'stationId', fd.station_id, 'stationName', fd.station,
        'odometer', fd.odometer, 'dieselLiters', fd.diesel_liters,
        'dieselPrice', case when fd.diesel_liters > 0 then round(fd.diesel_amount / fd.diesel_liters, 3) else 0 end,
        'arlaLiters', fd.arla_liters,
        'arlaPrice', case when fd.arla_liters > 0 then round(fd.arla_amount / fd.arla_liters, 3) else 0 end,
        'tankFull', coalesce(fd.tank_full, true), 'payment', coalesce(fd.payment_method, 'cartao_frota'),
        'photos', jsonb_build_object(
          'pump', exists (select 1 from public.fuel_document_files f where f.fuel_document_id = fd.id and f.kind = 'pump_photo'),
          'receipt', exists (select 1 from public.fuel_document_files f where f.fuel_document_id = fd.id and f.kind = 'receipt_photo'),
          'panel', false),
        'readBy', 'manual', 'geo', fd.geo,
        'alerts', coalesce((
          select jsonb_agg(jsonb_build_object('code', c->>'code', 'level', 'aviso', 'message', c->>'detail'))
          from jsonb_array_elements(fd.checks) c
        ), '[]'::jsonb),
        'reviewStatus', fd.review_status,
        'synced', true
      )) order by fd.recorded_at)
      from public.fuel_documents fd
      where fd.vehicle_id = v_vehicle.id and fd.recorded_at > now() - interval '60 days'
    ), '[]'::jsonb),
    'fuelEfficiency', case when v_vehicle.id is not null then private.fuel_full_to_full(v_vehicle.id, null, now() - interval '60 days', now()) end,

    'checklistTemplate', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i->>'id', 'group', coalesce(i->>'group', 'Geral'), 'label', i->>'label',
        'critical', coalesce((i->>'critical')::boolean, false)))
      from public.vehicle_checklist_templates t, jsonb_array_elements(t.items) i
      where t.tenant_id = v_driver.tenant_id and t.active
    ), '[]'::jsonb),
    'checklists', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c.id, 'moment', c.moment, 'tripId', c.route_id, 'at', c.performed_at, 'odometer', c.odometer,
        'answers', c.answers, 'approved', c.approved, 'synced', true
      )) order by c.performed_at)
      from public.vehicle_checklists c
      where c.driver_id = v_driver.id and c.performed_at > now() - interval '3 days'
    ), '[]'::jsonb),

    'occurrences', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', o.id, 'kind', o.kind, 'at', o.occurred_at, 'note', coalesce(o.note, ''),
        'photo', cardinality(o.photo_paths) > 0, 'geo', o.geo, 'tripId', o.route_id, 'stopId', o.stop_id,
        'severity', o.severity, 'status', o.status,
        'thread', coalesce((
          select jsonb_agg(jsonb_build_object('at', m.created_at, 'from', m.author_kind, 'text', m.body) order by m.created_at)
          from public.driver_occurrence_messages m where m.occurrence_id = o.id
        ), '[]'::jsonb),
        'synced', true
      )) order by o.occurred_at desc)
      from public.driver_occurrences o
      where o.driver_id = v_driver.id and (o.status <> 'resolvida' or o.occurred_at > now() - interval '30 days')
    ), '[]'::jsonb),

    'documents', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', dc.id, 'kind', dc.kind, 'label', dc.label, 'number', dc.number,
        'expiresAt', dc.expires_at, 'blocking', dc.blocking, 'photo', dc.file_path is not null, 'status', dc.status
      )) order by dc.expires_at)
      from public.driver_compliance_documents dc where dc.driver_id = v_driver.id
    ), '[]'::jsonb),

    'notices', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', n.id, 'at', n.published_at, 'title', n.title, 'body', n.body, 'from', n.author_label,
        'requiresAck', n.requires_ack, 'tag', n.tag,
        'ackAt', (select a.acked_at from public.driver_notice_acks a where a.notice_id = n.id and a.driver_id = v_driver.id)
      )) order by n.published_at desc)
      from public.driver_notices n
      where n.tenant_id = v_driver.tenant_id and n.published_at <= now()
        and (n.expires_at is null or n.expires_at > now())
    ), '[]'::jsonb),

    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'date', (r.scheduled_at at time zone v_tz)::date, 'label', to_char(r.scheduled_at at time zone v_tz, 'DD/MM HH24:MI'),
        'detail', r.title, 'kind', 'viagem') order by r.scheduled_at)
      from public.delivery_routes r
      where r.driver_id = v_driver.id and r.status = 'agendada' and r.scheduled_at > now() - interval '12 hours'
    ), '[]'::jsonb),

    'score', case when 'driver_performance' = any (v_modules) then private.driver_score(v_driver.id) end,
    'team', case when 'driver_performance' = any (v_modules) then coalesce((
      select jsonb_agg(x order by (x->>'score')::int desc)
      from (
        select jsonb_build_object(
          'name', split_part(d.name, ' ', 1) || case when d.id = v_driver.id then '' else ' ' || left(split_part(d.name, ' ', 2), 1) || '.' end,
          'score', coalesce((private.driver_score(d.id)->>'total')::int, 0),
          'kmPerLiter', (private.driver_score(d.id)->>'kmPerLiter')::numeric,
          'self', d.id = v_driver.id) as x
        from public.drivers d
        where d.tenant_id = v_driver.tenant_id and d.active
        order by d.id = v_driver.id desc, d.name
        limit 30
      ) q
    ), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.get_driver_ops_context() from public, anon;
grant execute on function public.get_driver_ops_context() to authenticated;

commit;
