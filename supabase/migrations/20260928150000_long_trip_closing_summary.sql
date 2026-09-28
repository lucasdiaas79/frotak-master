-- Consolida o caixa do tiro longo no encerramento e preserva o resumo para o Historico.

alter table public.driver_trip_cycles
  add column if not exists total_cash_entries numeric(18,2),
  add column if not exists total_expenses numeric(18,2),
  add column if not exists closing_balance numeric(18,2),
  add column if not exists freight_count integer,
  add column if not exists completed_freight_count integer,
  add column if not exists summary_calculated_at timestamptz;

create or replace function private.close_open_driver_trip_cycle(
  p_tenant_id uuid,
  p_driver_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_cycle_id uuid;
  v_total_entries numeric(18,2);
  v_total_expenses numeric(18,2);
  v_freight_count integer;
  v_completed_freight_count integer;
begin
  if p_tenant_id is null or p_driver_id is null then
    return null;
  end if;

  select id
    into v_cycle_id
  from public.driver_trip_cycles
  where tenant_id = p_tenant_id
    and driver_id = p_driver_id
    and status = 'open'
  for update;

  if not found then
    return null;
  end if;

  select coalesce(sum(amount), 0)::numeric(18,2)
    into v_total_entries
  from public.freight_cash_entries
  where tenant_id = p_tenant_id
    and trip_cycle_id = v_cycle_id;

  select coalesce(sum(amount), 0)::numeric(18,2)
    into v_total_expenses
  from public.freight_expenses
  where tenant_id = p_tenant_id
    and trip_cycle_id = v_cycle_id;

  select
    count(*)::integer,
    count(*) filter (where lifecycle_status = 'completed')::integer
    into v_freight_count, v_completed_freight_count
  from public.freights
  where tenant_id = p_tenant_id
    and trip_cycle_id = v_cycle_id;

  update public.driver_trip_cycles
  set status = 'closed',
      closed_at = now(),
      close_reason = coalesce(nullif(btrim(p_reason), ''), 'driver_return_completed'),
      total_cash_entries = v_total_entries,
      total_expenses = v_total_expenses,
      closing_balance = round((v_total_entries - v_total_expenses)::numeric, 2),
      freight_count = v_freight_count,
      completed_freight_count = v_completed_freight_count,
      summary_calculated_at = now(),
      metadata = metadata || jsonb_build_object(
        'closingSummary', jsonb_build_object(
          'totalCashEntries', v_total_entries,
          'totalExpenses', v_total_expenses,
          'closingBalance', round((v_total_entries - v_total_expenses)::numeric, 2),
          'freightCount', v_freight_count,
          'completedFreightCount', v_completed_freight_count,
          'calculatedAt', now()
        )
      ),
      updated_at = now()
  where id = v_cycle_id
    and tenant_id = p_tenant_id;

  return v_cycle_id;
end;
$$;

revoke all on function private.close_open_driver_trip_cycle(uuid, uuid, text)
  from public, anon, authenticated;

-- Ao concluir o ultimo frete planejado, mantem o veiculo na etapa de comando
-- final. Assim a central pode solicitar o retorno e o motorista fecha o ciclo
-- apenas quando realmente chegar ao patio.
create or replace function private.promote_next_long_trip_freight_after_clear()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_trip_cycle_id uuid;
  v_next_freight_id uuid;
begin
  if old.current_freight_id is null
    or new.current_freight_id is not null
    or old.driver_id is null
    or private.tenant_driver_app_mode(old.tenant_id) <> 'long_trip_multi_freight' then
    return new;
  end if;

  select f.trip_cycle_id
    into v_trip_cycle_id
  from public.freights f
  where f.tenant_id = old.tenant_id
    and f.id = old.current_freight_id
  limit 1;

  if v_trip_cycle_id is null then
    return new;
  end if;

  update public.freights
  set lifecycle_status = 'completed',
      operational_status = old.status,
      freight_stage = old.freight_stage,
      completed_at = coalesce(completed_at, now()),
      unloaded_tons = coalesce(unloaded_tons, old.unloaded_tons),
      freight_value = coalesce(old.freight_value, freight_value),
      updated_at = now()
  where tenant_id = old.tenant_id
    and id = old.current_freight_id;

  v_next_freight_id := private.activate_next_long_trip_freight(
    old.tenant_id,
    v_trip_cycle_id,
    old.id,
    old.driver_id
  );

  if v_next_freight_id is null then
    update public.vehicles
    set status = 'parado-aguardando-comando',
        vehicle_situation = 'parado',
        freight_stage = 'ENTREGA_FINALIZADA',
        updated_at = now()
    where tenant_id = old.tenant_id
      and id = old.id
      and current_freight_id is null;

    insert into public.fleet_events (
      tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
      source, description, event_type, action_origin, metadata
    )
    values (
      old.tenant_id, old.id, old.current_freight_id,
      'parado-aguardando-comando', 'ENTREGA_FINALIZADA', old.city, old.state,
      'Sistema', 'Tiro longo sem proximo frete planejado. Motorista aguardando comando.',
      'long_trip_queue_empty', 'system',
      jsonb_build_object('trip_cycle_id', v_trip_cycle_id, 'driver_id', old.driver_id)
    );
  end if;

  return new;
end;
$$;

revoke all on function private.promote_next_long_trip_freight_after_clear()
  from public, anon, authenticated;

-- O ultimo frete do tiro longo ja foi arquivado na descarga. Nesse estado o
-- motorista ainda precisa conseguir confirmar a chegada ao patio e fechar o ciclo.
create or replace function public.driver_app_complete_return(
  p_vehicle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_history_id uuid;
  v_trip_cycle_id uuid;
  v_is_long_trip boolean;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and tenant_id = v_driver.tenant_id
    and driver_id = v_driver.id
  for update;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  v_is_long_trip := private.tenant_driver_app_mode(v_vehicle.tenant_id) = 'long_trip_multi_freight';

  if coalesce(v_vehicle.freight_stage, '') <> 'ENTREGA_FINALIZADA'
    or v_vehicle.status <> 'rota-retornando' then
    raise exception 'return cannot be completed from current driver stage';
  end if;

  if v_vehicle.current_freight_id is not null then
    select f.trip_cycle_id
      into v_trip_cycle_id
    from public.freights f
    where f.tenant_id = v_vehicle.tenant_id
      and f.id = v_vehicle.current_freight_id
    limit 1;

    insert into public.freight_history (
      tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, trailer_id, sender_id,
      recipient_id, product_id, vehicle_plate, freight_value, freight_pricing_mode,
      freight_ton_price, unloaded_tons, freight_tax_rate, finish_reason,
      final_status, final_freight_stage
    )
    values (
      v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id,
      v_vehicle.driver_id, v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id,
      v_vehicle.product_id, v_vehicle.plate, v_vehicle.freight_value,
      v_vehicle.freight_pricing_mode, v_vehicle.freight_ton_price, v_vehicle.unloaded_tons,
      v_vehicle.freight_tax_rate, 'retorno_confirmado_motorista', v_vehicle.status,
      v_vehicle.freight_stage
    )
    returning id into v_history_id;
  elsif v_is_long_trip then
    select tc.id
      into v_trip_cycle_id
    from public.driver_trip_cycles tc
    where tc.tenant_id = v_vehicle.tenant_id
      and tc.driver_id = v_driver.id
      and (tc.vehicle_id = v_vehicle.id or tc.vehicle_id is null)
      and tc.status = 'open'
    order by tc.started_at desc
    limit 1
    for update;

    if v_trip_cycle_id is null then
      raise exception 'open trip cycle not found for authenticated driver';
    end if;
  else
    raise exception 'active freight not found for authenticated driver';
  end if;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id, 'disponivel-patio',
    'DISPONIVEL', v_vehicle.city, v_vehicle.state, 'Motorista',
    'Retorno ao patio confirmado pelo motorista', auth.uid(), 'driver_return_completed',
    'driver_app', jsonb_strip_nulls(jsonb_build_object(
      'driver_id', v_driver.id,
      'history_id', v_history_id,
      'trip_cycle_id', v_trip_cycle_id
    ))
  );

  perform private.close_open_driver_trip_cycle(
    v_vehicle.tenant_id,
    v_vehicle.driver_id,
    'retorno_confirmado_motorista'
  );

  update public.vehicles
  set current_freight_id = null,
      sender_id = null,
      recipient_id = null,
      product_id = null,
      freight_value = null,
      freight_pricing_mode = 'fixed',
      freight_ton_price = null,
      unloaded_tons = null,
      freight_tax_rate = 0,
      status = 'disponivel-patio',
      vehicle_situation = 'disponivel-patio',
      freight_stage = 'DISPONIVEL',
      workflow_flags = jsonb_set(
        coalesce(workflow_flags, '{}'::jsonb),
        '{pending_documents}',
        '[]'::jsonb,
        true
      ),
      last_transition_source = 'driver_app',
      last_transition_by = auth.uid(),
      last_transition_at = now(),
      updated_at = now()
  where id = v_vehicle.id
    and tenant_id = v_vehicle.tenant_id;

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_complete_return(uuid) from public, anon, authenticated;
grant execute on function public.driver_app_complete_return(uuid) to authenticated;

-- Preenche resumos de ciclos que ja estavam encerrados sem alterar movimentos.
with summaries as (
  select
    tc.id,
    coalesce((
      select sum(ce.amount)
      from public.freight_cash_entries ce
      where ce.tenant_id = tc.tenant_id and ce.trip_cycle_id = tc.id
    ), 0)::numeric(18,2) as total_entries,
    coalesce((
      select sum(fe.amount)
      from public.freight_expenses fe
      where fe.tenant_id = tc.tenant_id and fe.trip_cycle_id = tc.id
    ), 0)::numeric(18,2) as total_expenses,
    (
      select count(*)::integer
      from public.freights f
      where f.tenant_id = tc.tenant_id and f.trip_cycle_id = tc.id
    ) as freight_count,
    (
      select count(*)::integer
      from public.freights f
      where f.tenant_id = tc.tenant_id
        and f.trip_cycle_id = tc.id
        and f.lifecycle_status = 'completed'
    ) as completed_freight_count
  from public.driver_trip_cycles tc
  where tc.status = 'closed'
    and tc.summary_calculated_at is null
)
update public.driver_trip_cycles tc
set total_cash_entries = summary.total_entries,
    total_expenses = summary.total_expenses,
    closing_balance = round((summary.total_entries - summary.total_expenses)::numeric, 2),
    freight_count = summary.freight_count,
    completed_freight_count = summary.completed_freight_count,
    summary_calculated_at = coalesce(tc.closed_at, tc.updated_at, now()),
    metadata = tc.metadata || jsonb_build_object(
      'closingSummary', jsonb_build_object(
        'totalCashEntries', summary.total_entries,
        'totalExpenses', summary.total_expenses,
        'closingBalance', round((summary.total_entries - summary.total_expenses)::numeric, 2),
        'freightCount', summary.freight_count,
        'completedFreightCount', summary.completed_freight_count,
        'calculatedAt', coalesce(tc.closed_at, tc.updated_at, now())
      )
    ),
    updated_at = now()
from summaries summary
where tc.id = summary.id;

comment on column public.driver_trip_cycles.closing_balance is
  'Saldo congelado do mini DRE no encerramento do ciclo: entradas menos despesas.';

notify pgrst, 'reload schema';
