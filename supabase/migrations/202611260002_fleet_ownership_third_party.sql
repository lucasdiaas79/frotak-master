-- Frota própria x terceiros
--
-- 1. Campo "ownership" em veículos (cavalos), motoristas e carretas/caçambas:
--    'propria' (padrão) ou 'terceiro'. É o que o sistema usa para saber quem é terceiro.
-- 2. O frete e o histórico guardam a propriedade do veículo no momento do frete, para o
--    faturamento por frota própria x terceiros não mudar se o cadastro mudar depois.
-- 3. driver_link_advance_stage: os botões do link do motorista (terceiros) passam a mover
--    o card no Kanban, respeitando o mesmo fluxo de etapas do app oficial.
-- 4. get_fleet_profitability_by_ownership: receita, custo e resultado separados por
--    frota própria e terceiros, na mesma base da rentabilidade da frota.
--
-- Nada é apagado. Todos os registros existentes ficam como 'propria'.
-- Aplicar com: supabase db query --remote -f supabase/migrations/202611260002_fleet_ownership_third_party.sql

begin;

-- ------------------------------------------------------------------ 1. Propriedade

alter table public.vehicles add column if not exists ownership text not null default 'propria';
alter table public.drivers add column if not exists ownership text not null default 'propria';
alter table public.trailers add column if not exists ownership text not null default 'propria';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_ownership_chk') then
    alter table public.vehicles
      add constraint vehicles_ownership_chk check (ownership in ('propria', 'terceiro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drivers_ownership_chk') then
    alter table public.drivers
      add constraint drivers_ownership_chk check (ownership in ('propria', 'terceiro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trailers_ownership_chk') then
    alter table public.trailers
      add constraint trailers_ownership_chk check (ownership in ('propria', 'terceiro'));
  end if;
end;
$$;

create index if not exists vehicles_tenant_ownership_idx on public.vehicles (tenant_id, ownership);

-- ------------------------------------------------------------------ 2. Snapshot no frete

-- Os registros existentes recebem 'propria' pelo default da coluna (sem UPDATE, para não
-- disparar os triggers de sincronização de frete). Depois o default sai, para o trigger
-- abaixo gravar a propriedade do veículo em cada frete novo.
alter table public.freights add column if not exists ownership text default 'propria';
alter table public.freights alter column ownership drop default;
alter table public.freight_history add column if not exists ownership text default 'propria';
alter table public.freight_history alter column ownership drop default;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'freights_ownership_chk') then
    alter table public.freights
      add constraint freights_ownership_chk
      check (ownership is null or ownership in ('propria', 'terceiro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'freight_history_ownership_chk') then
    alter table public.freight_history
      add constraint freight_history_ownership_chk
      check (ownership is null or ownership in ('propria', 'terceiro'));
  end if;
end;
$$;

create or replace function private.freight_ownership_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.ownership is null then
    if tg_table_name = 'freight_history' and new.freight_id is not null then
      select f.ownership into new.ownership
      from public.freights f
      where f.id = new.freight_id;
    end if;
    if new.ownership is null and new.vehicle_id is not null then
      select v.ownership into new.ownership
      from public.vehicles v
      where v.id = new.vehicle_id;
    end if;
    new.ownership := coalesce(new.ownership, 'propria');
  end if;
  return new;
end;
$$;

drop trigger if exists freights_ownership_snapshot on public.freights;
create trigger freights_ownership_snapshot
  before insert on public.freights
  for each row execute function private.freight_ownership_snapshot();

drop trigger if exists freight_history_ownership_snapshot on public.freight_history;
create trigger freight_history_ownership_snapshot
  before insert on public.freight_history
  for each row execute function private.freight_ownership_snapshot();

-- Frete ativo acompanha a troca de cadastro (ex.: veículo marcado como terceiro no meio
-- do frete). Fretes concluídos não mudam.
create or replace function private.vehicle_ownership_to_active_freight()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.ownership is distinct from old.ownership and new.current_freight_id is not null then
    update public.freights
    set ownership = new.ownership,
        updated_at = now()
    where id = new.current_freight_id
      and tenant_id = new.tenant_id
      and coalesce(lifecycle_status, '') <> 'completed';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_ownership_to_active_freight on public.vehicles;
create trigger vehicles_ownership_to_active_freight
  after update of ownership on public.vehicles
  for each row execute function private.vehicle_ownership_to_active_freight();

-- ------------------------------------------------------------------ 3. Link do motorista move o Kanban
--
-- Chamado só pelo servidor (service role) depois de validar o token do link.
-- Mapa dos botões do link para as etapas:
--   chegou_origem  : DISPONIVEL ou EM_ROTA_CARREGAR            -> AGUARDANDO_NOTA
--   carregado      : CTE_GERADA_AG_CONFIRMACAO_MOTORISTA       -> EM_ROTA_ENTREGA
--   chegou_destino : CTE_GERADA_AG_CONFIRMACAO_MOTORISTA
--                    ou EM_ROTA_ENTREGA                        -> ENTREGUE_AG_FINALIZACAO
--   entregue       : EM_ROTA_ENTREGA                           -> ENTREGUE_AG_FINALIZACAO
-- "entregue" não finaliza sozinho: finalizar exige canhoto e toneladas descarregadas,
-- que a transportadora confere. Parada e ocorrência ficam só como registro.
-- Fora dessas combinações, nada muda e a função devolve moved = false.

create or replace function public.driver_link_advance_stage(
  p_link_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_link public.driver_trip_links;
  v_vehicle public.vehicles;
  v_from_status text;
  v_from_stage text;
  v_next_stage text;
  v_next_status text;
  v_next_situation text;
  v_event_type text;
  v_description text;
begin
  select * into v_link
  from public.driver_trip_links
  where id = p_link_id;

  if not found then
    raise exception 'driver link not found';
  end if;
  if v_link.revoked_at is not null or v_link.expires_at < now() then
    raise exception 'driver link expired';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = v_link.vehicle_id
    and tenant_id = v_link.tenant_id
  for update;

  if not found or v_vehicle.current_freight_id is distinct from v_link.freight_id then
    return jsonb_build_object('moved', false, 'reason', 'freight_not_active');
  end if;

  v_from_status := v_vehicle.status;
  v_from_stage := coalesce(v_vehicle.freight_stage, 'DISPONIVEL');

  v_next_stage := case
    when p_status = 'chegou_origem' and v_from_stage in ('DISPONIVEL', 'EM_ROTA_CARREGAR')
      then 'AGUARDANDO_NOTA'
    when p_status = 'carregado' and v_from_stage = 'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA'
      then 'EM_ROTA_ENTREGA'
    when p_status = 'chegou_destino'
      and v_from_stage in ('CTE_GERADA_AG_CONFIRMACAO_MOTORISTA', 'EM_ROTA_ENTREGA')
      then 'ENTREGUE_AG_FINALIZACAO'
    when p_status = 'entregue' and v_from_stage = 'EM_ROTA_ENTREGA'
      then 'ENTREGUE_AG_FINALIZACAO'
    else null
  end;

  if v_next_stage is null then
    return jsonb_build_object('moved', false, 'reason', 'no_transition', 'stage', v_from_stage);
  end if;

  v_next_status := case v_next_stage
    when 'AGUARDANDO_NOTA' then 'parado-aguardando-carga'
    when 'EM_ROTA_ENTREGA' then 'rota-descarregar'
    when 'ENTREGUE_AG_FINALIZACAO' then 'parado-descarregando'
    else v_vehicle.status
  end;

  v_next_situation := case
    when v_next_status in ('rota-carregar', 'rota-descarregar', 'rota-retornando') then 'em-rota'
    else 'parado'
  end;

  v_event_type := case v_next_stage
    when 'AGUARDANDO_NOTA' then 'driver_arrived_sender'
    when 'EM_ROTA_ENTREGA' then 'driver_documents_confirmed'
    when 'ENTREGUE_AG_FINALIZACAO' then 'driver_arrived_recipient'
    else 'driver_stage_confirmed'
  end;

  v_description := case v_next_stage
    when 'AGUARDANDO_NOTA' then 'Chegada ao remetente confirmada pelo motorista terceiro (link)'
    when 'EM_ROTA_ENTREGA' then 'Saída carregado confirmada pelo motorista terceiro (link)'
    when 'ENTREGUE_AG_FINALIZACAO' then 'Chegada ao destinatário confirmada pelo motorista terceiro (link)'
    else 'Etapa confirmada pelo link do motorista'
  end;

  update public.vehicles
  set status = v_next_status,
      vehicle_situation = v_next_situation,
      freight_stage = v_next_stage,
      workflow_flags = case
        when v_next_stage = 'EM_ROTA_ENTREGA'
          then jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '[]'::jsonb, true)
        else coalesce(workflow_flags, '{}'::jsonb)
      end,
      last_transition_source = 'driver_link',
      last_transition_by = null,
      last_transition_at = now(),
      updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id, v_vehicle.status,
    v_vehicle.freight_stage, v_vehicle.city, v_vehicle.state, 'Motorista', v_description,
    null, v_event_type, 'driver_link',
    jsonb_strip_nulls(jsonb_build_object(
      'driver_id', v_link.driver_id,
      'driver_link_id', v_link.id,
      'link_status', p_status,
      'from_status', v_from_status,
      'to_status', v_next_status,
      'from_freight_stage', v_from_stage,
      'to_freight_stage', v_next_stage
    ))
  );

  return jsonb_build_object(
    'moved', true,
    'from', v_from_stage,
    'to', v_next_stage
  );
end;
$$;

revoke all on function public.driver_link_advance_stage(uuid, text) from public, anon, authenticated;
grant execute on function public.driver_link_advance_stage(uuid, text) to service_role;

-- ------------------------------------------------------------------ 4. Faturamento por propriedade

create or replace function public.get_fleet_profitability_by_ownership(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_rows jsonb;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.view');

  with eligible_docs as (
    select fd.id, fd.direction
    from public.financial_documents fd
    where fd.workspace_id = p_workspace_id
      and fd.status in ('posted', 'partially_settled', 'settled')
      and fd.competence_date between p_start_date and p_end_date
  ),
  allocations as (
    select
      fd.direction,
      fa.amount,
      fa.freight_id,
      coalesce(f.ownership, v.ownership, 'propria') as ownership
    from eligible_docs fd
    join public.financial_allocations fa on fa.document_id = fd.id
    left join public.freights f on f.id = fa.freight_id
    left join public.vehicles v on v.id = coalesce(fa.vehicle_id, f.vehicle_id)
    where (fa.vehicle_id is not null or fa.freight_id is not null)
      and (fa.freight_id is null or f.lifecycle_status = 'completed')
  ),
  kinds(ownership) as (values ('propria'), ('terceiro')),
  grouped as (
    select
      k.ownership,
      coalesce(sum(a.amount) filter (where a.direction = 'receivable'), 0)::numeric(18,2) as revenue,
      coalesce(sum(a.amount) filter (where a.direction = 'payable'), 0)::numeric(18,2) as costs,
      count(distinct a.freight_id) filter (where a.direction = 'receivable') as freight_count
    from kinds k
    left join allocations a on a.ownership = k.ownership
    group by k.ownership
  )
  select jsonb_agg(
    jsonb_build_object(
      'ownership', ownership,
      'revenue', revenue,
      'costs', costs,
      'result', revenue - costs,
      'margin', case when revenue > 0 then round(((revenue - costs) / revenue) * 100, 2) else 0 end,
      'freightCount', freight_count
    )
    order by ownership
  )
  into v_rows
  from grouped;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

revoke all on function public.get_fleet_profitability_by_ownership(uuid, date, date) from public, anon;
grant execute on function public.get_fleet_profitability_by_ownership(uuid, date, date) to authenticated;

commit;
