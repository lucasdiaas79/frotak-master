-- Frotak Wave 0 — concorrência otimista do workflow.
--
-- O trigger 202609170001 centraliza o incremento de workflow_version.
-- Esta migration fecha o outro lado do contrato: writers manuais podem informar
-- a versão que leram e a operação falha se o veículo já tiver sido alterado.

-- Remove somente a assinatura antiga do RPC para evitar overload ambíguo no PostgREST.
drop function if exists public.set_vehicle_status(uuid, text, text, text, text);

create or replace function public.set_vehicle_status(
  p_vehicle_id uuid,
  p_status text,
  p_source text default 'Operador',
  p_description text default null,
  p_freight_stage text default null,
  p_expected_version integer default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_situation text;
begin
  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and private.can_access_tenant(tenant_id)
  for update;

  if not found then
    raise exception 'vehicle not found or not accessible';
  end if;

  if p_expected_version is not null and v_vehicle.workflow_version <> p_expected_version then
    raise exception 'WORKFLOW_VERSION_CONFLICT expected=% actual=%',
      p_expected_version,
      v_vehicle.workflow_version
      using errcode = '40001';
  end if;

  v_situation := case
    when p_status in ('rota-carregar', 'rota-descarregar', 'rota-retornando') then 'em-rota'
    when p_status = 'parado-quebrado' then 'quebrado'
    when p_status in ('manutencao', 'disponivel-oficina') then 'manutencao'
    when p_status = 'disponivel-patio' then 'disponivel-patio'
    else 'parado'
  end;

  update public.vehicles
  set
    status = p_status,
    vehicle_situation = v_situation,
    freight_stage = coalesce(p_freight_stage, freight_stage),
    last_transition_source = p_source,
    last_transition_by = auth.uid(),
    last_transition_at = now(),
    updated_at = now()
  where id = p_vehicle_id
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
    coalesce(p_source, 'Operador'),
    p_description,
    auth.uid(),
    'status_updated',
    'app',
    jsonb_build_object(
      'expected_workflow_version', p_expected_version,
      'result_workflow_version', v_vehicle.workflow_version
    )
  );

  return v_vehicle;
end;
$$;

revoke all on function public.set_vehicle_status(uuid, text, text, text, text, integer)
from public, anon, authenticated;
grant execute on function public.set_vehicle_status(uuid, text, text, text, text, integer)
to authenticated;

comment on function public.set_vehicle_status(uuid, text, text, text, text, integer) is
  'Atualiza o estado operacional com lock de linha e, quando informado, rejeita workflow_version obsoleto.';
