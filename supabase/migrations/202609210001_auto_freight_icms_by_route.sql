-- ICMS automatico por rota do frete.
-- A origem/destino operacional define a aliquota; o financeiro continua
-- recebendo o valor liquido pelo gatilho de frete liquido ja existente.

alter table public.vehicles
  add column if not exists freight_tax_rate numeric(7,4) not null default 0,
  add column if not exists freight_tax_rule_source text,
  add column if not exists freight_origin_uf text,
  add column if not exists freight_destination_uf text;

alter table public.freights
  add column if not exists freight_tax_rate numeric(7,4) not null default 0,
  add column if not exists freight_tax_rule_source text,
  add column if not exists origin_uf text,
  add column if not exists destination_uf text;

alter table public.freight_history
  add column if not exists freight_tax_rate numeric(7,4) not null default 0,
  add column if not exists freight_tax_rule_source text,
  add column if not exists origin_uf text,
  add column if not exists destination_uf text;

do $$
begin
  alter table public.vehicles
    drop constraint if exists vehicles_freight_tax_rate_chk,
    add constraint vehicles_freight_tax_rate_chk
      check (freight_tax_rate >= 0 and freight_tax_rate < 100);

  alter table public.freights
    drop constraint if exists freights_freight_tax_rate_chk,
    add constraint freights_freight_tax_rate_chk
      check (freight_tax_rate >= 0 and freight_tax_rate < 100);

  alter table public.freight_history
    drop constraint if exists freight_history_freight_tax_rate_chk,
    add constraint freight_history_freight_tax_rate_chk
      check (freight_tax_rate >= 0 and freight_tax_rate < 100);
end $$;

create or replace function private.normalize_brazil_uf(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public, private
as $$
  select case
    when upper(btrim(coalesce(p_value, ''))) in (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    ) then upper(btrim(coalesce(p_value, '')))
    else null
  end;
$$;

create or replace function private.internal_freight_icms_rate(p_uf text)
returns numeric
language sql
immutable
set search_path = pg_catalog, public, private
as $$
  select case private.normalize_brazil_uf(p_uf)
    when 'AC' then 19.0
    when 'AL' then 20.5
    when 'AP' then 18.0
    when 'AM' then 20.0
    when 'BA' then 20.5
    when 'CE' then 20.0
    when 'DF' then 20.0
    when 'ES' then 12.0
    when 'GO' then 19.0
    when 'MA' then 23.0
    when 'MT' then 17.0
    when 'MS' then 17.0
    when 'MG' then 18.0
    when 'PA' then 19.0
    when 'PB' then 20.0
    when 'PR' then 12.0
    when 'PE' then 20.5
    when 'PI' then 22.5
    when 'RJ' then 22.0
    when 'RN' then 20.0
    when 'RS' then 12.0
    when 'RO' then 19.5
    when 'RR' then 20.0
    when 'SC' then 17.0
    when 'SP' then 12.0
    when 'SE' then 19.0
    when 'TO' then 20.0
    else 0
  end;
$$;

create or replace function private.freight_icms_rate_for_route(
  p_origin_uf text,
  p_destination_uf text
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
declare
  v_origin text := private.normalize_brazil_uf(p_origin_uf);
  v_destination text := private.normalize_brazil_uf(p_destination_uf);
begin
  if v_origin is null or v_destination is null then
    return 0;
  end if;

  if v_origin = v_destination then
    return private.internal_freight_icms_rate(v_origin);
  end if;

  if v_origin in ('SP', 'RJ', 'MG', 'PR', 'SC', 'RS')
     and v_destination not in ('SP', 'RJ', 'MG', 'PR', 'SC', 'RS') then
    return 7.0;
  end if;

  return 12.0;
end;
$$;

create or replace function private.freight_icms_rule_source(
  p_origin_uf text,
  p_destination_uf text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
declare
  v_origin text := private.normalize_brazil_uf(p_origin_uf);
  v_destination text := private.normalize_brazil_uf(p_destination_uf);
begin
  if v_origin is null or v_destination is null then
    return 'missing_uf';
  end if;
  if v_origin = v_destination then
    return 'internal_' || lower(v_origin);
  end if;
  if v_origin in ('SP', 'RJ', 'MG', 'PR', 'SC', 'RS')
     and v_destination not in ('SP', 'RJ', 'MG', 'PR', 'SC', 'RS') then
    return 'interstate_7';
  end if;
  return 'interstate_12';
end;
$$;

create or replace function private.freight_tax_context(
  p_sender_id uuid,
  p_recipient_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, private
as $$
declare
  v_origin_uf text;
  v_destination_uf text;
begin
  select private.normalize_brazil_uf(s.state)
    into v_origin_uf
  from public.senders s
  where s.id = p_sender_id;

  select private.normalize_brazil_uf(r.state)
    into v_destination_uf
  from public.recipients r
  where r.id = p_recipient_id;

  return jsonb_build_object(
    'origin_uf', v_origin_uf,
    'destination_uf', v_destination_uf,
    'freight_tax_rate', private.freight_icms_rate_for_route(v_origin_uf, v_destination_uf),
    'freight_tax_rule_source', private.freight_icms_rule_source(v_origin_uf, v_destination_uf)
  );
end;
$$;

create or replace function private.apply_freight_icms_route()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tax jsonb;
begin
  v_tax := private.freight_tax_context(new.sender_id, new.recipient_id);

  new.origin_uf := v_tax->>'origin_uf';
  new.destination_uf := v_tax->>'destination_uf';
  new.freight_tax_rate := coalesce(nullif(v_tax->>'freight_tax_rate', '')::numeric, 0);
  new.freight_tax_rule_source := v_tax->>'freight_tax_rule_source';
  new.snapshot := coalesce(new.snapshot, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'origin_uf', new.origin_uf,
    'destination_uf', new.destination_uf,
    'freight_tax_rate', new.freight_tax_rate,
    'freight_tax_rule_source', new.freight_tax_rule_source
  ));

  return new;
end;
$$;

drop trigger if exists freights_apply_freight_icms_route on public.freights;
create trigger freights_apply_freight_icms_route
before insert or update of sender_id, recipient_id
on public.freights
for each row execute function private.apply_freight_icms_route();

create or replace function public.link_vehicle_operation(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_trailer_id uuid,
  p_trailer_ids uuid[],
  p_sender_id uuid,
  p_recipient_id uuid,
  p_product_id uuid,
  p_freight_value numeric,
  p_freight_payment_type text,
  p_payment_term_days integer default null,
  p_freight_pricing_mode text default 'fixed',
  p_freight_ton_price numeric default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_billing_partner_id uuid;
  v_pricing_mode text;
  v_fixed_value numeric;
  v_ton_price numeric;
  v_workspace_id uuid;
  v_trip_cycle_id uuid;
  v_tax jsonb;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and private.can_access_tenant(tenant_id);
  if not found then raise exception 'vehicle not found or not accessible'; end if;

  if p_sender_id is null or p_recipient_id is null then
    raise exception 'FREIGHT_ORIGIN_AND_DESTINATION_REQUIRED';
  end if;
  if p_payment_term_days is not null and p_payment_term_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYMENT_TERM_DAYS';
  end if;

  v_pricing_mode := coalesce(nullif(btrim(p_freight_pricing_mode), ''), 'fixed');
  if v_pricing_mode not in ('fixed', 'per_ton') then
    raise exception 'FREIGHT_PRICING_MODE_INVALID';
  end if;

  v_fixed_value := case when v_pricing_mode = 'fixed' then p_freight_value else null end;
  v_ton_price := case when v_pricing_mode = 'per_ton' then p_freight_ton_price else null end;
  if v_pricing_mode = 'fixed' and (v_fixed_value is null or v_fixed_value <= 0) then
    raise exception 'FREIGHT_FIXED_VALUE_REQUIRED';
  end if;
  if v_pricing_mode = 'per_ton' and (v_ton_price is null or v_ton_price <= 0) then
    raise exception 'FREIGHT_TON_PRICE_REQUIRED';
  end if;

  v_billing_partner_id := private.resolve_freight_billing_partner(
    v_vehicle.tenant_id,
    upper(nullif(btrim(p_freight_payment_type), '')),
    p_sender_id,
    p_recipient_id
  );

  v_workspace_id := private.default_workspace_for_tenant(v_vehicle.tenant_id);
  v_tax := private.freight_tax_context(p_sender_id, p_recipient_id);

  v_vehicle := private.link_vehicle_operation_legacy_core(
    p_vehicle_id, p_driver_id, p_trailer_id, p_trailer_ids,
    p_sender_id, p_recipient_id, p_product_id, v_fixed_value
  );

  v_trip_cycle_id := private.ensure_open_driver_trip_cycle(
    v_vehicle.tenant_id,
    v_workspace_id,
    p_driver_id,
    v_vehicle.id,
    v_vehicle.trailer_id
  );

  update public.vehicles
  set freight_pricing_mode = v_pricing_mode,
      freight_ton_price = v_ton_price,
      unloaded_tons = null,
      freight_tax_rate = coalesce(nullif(v_tax->>'freight_tax_rate', '')::numeric, 0),
      freight_tax_rule_source = v_tax->>'freight_tax_rule_source',
      freight_origin_uf = v_tax->>'origin_uf',
      freight_destination_uf = v_tax->>'destination_uf',
      updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  update public.freights
  set freight_payment_type = upper(p_freight_payment_type),
      billing_partner_id = v_billing_partner_id,
      payment_term_days = p_payment_term_days,
      freight_pricing_mode = v_pricing_mode,
      freight_ton_price = v_ton_price,
      unloaded_tons = null,
      trip_cycle_id = v_trip_cycle_id,
      origin_uf = v_tax->>'origin_uf',
      destination_uf = v_tax->>'destination_uf',
      freight_tax_rate = coalesce(nullif(v_tax->>'freight_tax_rate', '')::numeric, 0),
      freight_tax_rule_source = v_tax->>'freight_tax_rule_source',
      snapshot = snapshot || jsonb_strip_nulls(jsonb_build_object(
        'freight_payment_type', upper(p_freight_payment_type),
        'billing_partner_id', v_billing_partner_id,
        'payment_term_days', p_payment_term_days,
        'freight_pricing_mode', v_pricing_mode,
        'freight_ton_price', v_ton_price,
        'trip_cycle_id', v_trip_cycle_id,
        'origin_uf', v_tax->>'origin_uf',
        'destination_uf', v_tax->>'destination_uf',
        'freight_tax_rate', coalesce(nullif(v_tax->>'freight_tax_rate', '')::numeric, 0),
        'freight_tax_rule_source', v_tax->>'freight_tax_rule_source'
      )),
      updated_at = now()
  where id = v_vehicle.current_freight_id
    and tenant_id = v_vehicle.tenant_id;

  if not found then raise exception 'CANONICAL_FREIGHT_NOT_CREATED'; end if;
  return v_vehicle;
end;
$$;

revoke all on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric
) from public, anon, authenticated;
grant execute on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric
) to authenticated;

create or replace function private.backfill_freight_icms_route()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  with computed as (
    select
      f.id,
      ctx->>'origin_uf' as origin_uf,
      ctx->>'destination_uf' as destination_uf,
      coalesce(nullif(ctx->>'freight_tax_rate', '')::numeric, 0) as freight_tax_rate,
      ctx->>'freight_tax_rule_source' as freight_tax_rule_source
    from public.freights f
    cross join lateral (
      select private.freight_tax_context(f.sender_id, f.recipient_id) as ctx
    ) tax
    where f.sender_id is not null
      and f.recipient_id is not null
  )
  update public.freights f
  set origin_uf = computed.origin_uf,
      destination_uf = computed.destination_uf,
      freight_tax_rate = computed.freight_tax_rate,
      freight_tax_rule_source = computed.freight_tax_rule_source,
      snapshot = coalesce(f.snapshot, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'origin_uf', computed.origin_uf,
        'destination_uf', computed.destination_uf,
        'freight_tax_rate', computed.freight_tax_rate,
        'freight_tax_rule_source', computed.freight_tax_rule_source
      )),
      updated_at = now()
  from computed
  where f.id = computed.id
    and (
      f.origin_uf is distinct from computed.origin_uf
      or f.destination_uf is distinct from computed.destination_uf
      or f.freight_tax_rate is distinct from computed.freight_tax_rate
      or f.freight_tax_rule_source is distinct from computed.freight_tax_rule_source
    );

  update public.vehicles v
  set freight_tax_rate = f.freight_tax_rate,
      freight_tax_rule_source = f.freight_tax_rule_source,
      freight_origin_uf = f.origin_uf,
      freight_destination_uf = f.destination_uf,
      updated_at = now()
  from public.freights f
  where f.tenant_id = v.tenant_id
    and f.id = v.current_freight_id;
end;
$$;

select private.backfill_freight_icms_route();

update public.financial_documents fd
set original_amount = private.net_freight_amount(f.freight_value, f.freight_tax_rate),
    notes = case
      when coalesce(f.freight_tax_rate, 0) <= 0 then fd.notes
      when fd.notes like '%Receita liquida de frete.%' then fd.notes
      else coalesce(fd.notes || E'\n', '') || format(
        'Receita liquida de frete. Valor bruto: R$ %s. Aliquota automatica: %s%% (%s). Desconto: R$ %s.',
        f.freight_value,
        trim(to_char(f.freight_tax_rate, 'FM999999990D9999')),
        coalesce(f.freight_tax_rule_source, 'regra_nao_identificada'),
        round((f.freight_value - private.net_freight_amount(f.freight_value, f.freight_tax_rate))::numeric, 2)
      )
    end
from public.freights f
where fd.source_type = 'freight'
  and fd.source_event = 'completion_revenue'
  and fd.source_id = f.id
  and f.freight_value is not null
  and f.freight_value > 0
  and private.net_freight_amount(f.freight_value, f.freight_tax_rate) > 0
  and not exists (
    select 1 from public.financial_settlements fs
    where fs.document_id = fd.id
  );

update public.financial_installments fi
set amount = fd.original_amount,
    updated_at = now()
from public.financial_documents fd
where fi.document_id = fd.id
  and fd.source_type = 'freight'
  and fd.source_event = 'completion_revenue'
  and fi.status = 'open'
  and coalesce(fi.settled_amount, 0) = 0;

update public.financial_allocations fa
set amount = fd.original_amount
from public.financial_documents fd
where fa.document_id = fd.id
  and fd.source_type = 'freight'
  and fd.source_event = 'completion_revenue'
  and not exists (
    select 1 from public.financial_settlements fs
    where fs.document_id = fd.id
  );

comment on column public.freights.freight_tax_rate is
  'Aliquota ICMS calculada automaticamente pela UF de origem e destino do frete.';
comment on column public.freights.freight_tax_rule_source is
  'Regra usada para calcular o ICMS do frete: internal_uf, interstate_7, interstate_12 ou missing_uf.';

notify pgrst, 'reload schema';
