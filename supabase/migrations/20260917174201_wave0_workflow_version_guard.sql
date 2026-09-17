-- Frotak Wave 0 — controle atomico da versao do workflow.
--
-- Objetivo:
-- - qualquer alteracao que mude o estado operacional/logico do frete incrementa
--   workflow_version na mesma transacao;
-- - atualizacoes puramente de telemetria/localizacao nao alteram a versao;
-- - o incremento fica centralizado no banco, evitando que cada RPC precise
--   lembrar de manipular workflow_version manualmente.

create or replace function private.bump_vehicle_workflow_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if
    old.current_freight_id is distinct from new.current_freight_id
    or old.status is distinct from new.status
    or old.vehicle_situation is distinct from new.vehicle_situation
    or old.freight_stage is distinct from new.freight_stage
    or old.driver_id is distinct from new.driver_id
    or old.trailer_id is distinct from new.trailer_id
    or old.sender_id is distinct from new.sender_id
    or old.recipient_id is distinct from new.recipient_id
    or old.product_id is distinct from new.product_id
    or old.freight_value is distinct from new.freight_value
    or old.freight_pricing_mode is distinct from new.freight_pricing_mode
    or old.freight_ton_price is distinct from new.freight_ton_price
    or old.unloaded_tons is distinct from new.unloaded_tons
    or old.workflow_flags is distinct from new.workflow_flags
  then
    new.workflow_version := old.workflow_version + 1;
  else
    -- Nao permita que um writer externo altere a versao sem mudar o estado.
    new.workflow_version := old.workflow_version;
  end if;

  return new;
end;
$$;

revoke all on function private.bump_vehicle_workflow_version() from public, anon, authenticated;

drop trigger if exists vehicles_bump_workflow_version on public.vehicles;
create trigger vehicles_bump_workflow_version
before update on public.vehicles
for each row execute function private.bump_vehicle_workflow_version();

comment on function private.bump_vehicle_workflow_version() is
  'Incrementa vehicles.workflow_version atomicamente quando o estado operacional do frete muda; ignora atualizacoes puramente de telemetria.';
