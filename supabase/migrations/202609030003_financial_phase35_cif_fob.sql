-- Frotak Financeiro - Fase 3.5: responsabilidade CIF/FOB e pagador canonico.

alter table public.freights
  add column freight_payment_type text,
  add column billing_partner_id uuid;

alter table public.freights
  add constraint freights_payment_type_chk
    check (freight_payment_type is null or freight_payment_type in ('CIF', 'FOB')),
  add constraint freights_billing_partner_tenant_fk
    foreign key (tenant_id, billing_partner_id)
    references public.business_partners(tenant_id, id) on delete restrict,
  add constraint freights_payment_billing_complete_chk check (
    (freight_payment_type is null and billing_partner_id is null)
    or (freight_payment_type is not null and billing_partner_id is not null)
  );

create index freights_billing_partner_id_idx
  on public.freights(billing_partner_id);

create or replace function private.resolve_freight_billing_partner(
  p_tenant_id uuid,
  p_payment_type text,
  p_sender_id uuid,
  p_recipient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_legacy_table text;
  v_legacy_id uuid;
  v_expected_role text;
  v_partner_id uuid;
begin
  if p_payment_type is null or p_payment_type not in ('CIF', 'FOB') then
    raise exception 'FREIGHT_PAYMENT_TYPE_REQUIRED';
  end if;

  if p_payment_type = 'CIF' then
    v_legacy_table := 'senders';
    v_legacy_id := p_sender_id;
    v_expected_role := 'sender';
  else
    v_legacy_table := 'recipients';
    v_legacy_id := p_recipient_id;
    v_expected_role := 'recipient';
  end if;

  if v_legacy_id is null then
    raise exception 'FREIGHT_BILLING_PARTY_REQUIRED';
  end if;

  select bp.id into v_partner_id
  from public.legacy_partner_links l
  join public.business_partners bp
    on bp.id = l.partner_id and bp.tenant_id = l.tenant_id
  join public.business_partner_roles bpr
    on bpr.partner_id = bp.id and bpr.tenant_id = bp.tenant_id
  where l.tenant_id = p_tenant_id
    and l.legacy_table = v_legacy_table
    and l.legacy_id = v_legacy_id
    and bpr.role = v_expected_role
    and bpr.active = true
    and bp.active = true;

  if v_partner_id is null then
    raise exception 'FREIGHT_BILLING_PARTNER_NOT_MAPPED';
  end if;

  return v_partner_id;
end;
$$;

-- Preserva o nucleo operacional existente, mas retira sua execucao direta.
alter function public.link_vehicle_operation(uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric)
  rename to link_vehicle_operation_legacy_core;
alter function public.link_vehicle_operation_legacy_core(uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric)
  set schema private;
revoke all on function private.link_vehicle_operation_legacy_core(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric
) from public, anon, authenticated;

create or replace function public.link_vehicle_operation(
  p_vehicle_id uuid,
  p_driver_id uuid default null,
  p_trailer_id uuid default null,
  p_trailer_ids uuid[] default null,
  p_sender_id uuid default null,
  p_recipient_id uuid default null,
  p_product_id uuid default null,
  p_freight_value numeric default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_sender_id is not null or p_recipient_id is not null
     or p_product_id is not null or p_freight_value is not null then
    raise exception 'FREIGHT_PAYMENT_TYPE_REQUIRED';
  end if;
  return private.link_vehicle_operation_legacy_core(
    p_vehicle_id, p_driver_id, p_trailer_id, p_trailer_ids,
    p_sender_id, p_recipient_id, p_product_id, p_freight_value
  );
end;
$$;

create or replace function public.link_vehicle_operation(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_trailer_id uuid,
  p_trailer_ids uuid[],
  p_sender_id uuid,
  p_recipient_id uuid,
  p_product_id uuid,
  p_freight_value numeric,
  p_freight_payment_type text
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_billing_partner_id uuid;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and private.can_access_tenant(tenant_id);
  if not found then raise exception 'vehicle not found or not accessible'; end if;

  if p_sender_id is null or p_recipient_id is null then
    raise exception 'FREIGHT_ORIGIN_AND_DESTINATION_REQUIRED';
  end if;

  v_billing_partner_id := private.resolve_freight_billing_partner(
    v_vehicle.tenant_id,
    upper(nullif(btrim(p_freight_payment_type), '')),
    p_sender_id,
    p_recipient_id
  );

  v_vehicle := private.link_vehicle_operation_legacy_core(
    p_vehicle_id, p_driver_id, p_trailer_id, p_trailer_ids,
    p_sender_id, p_recipient_id, p_product_id, p_freight_value
  );

  update public.freights
  set freight_payment_type = upper(p_freight_payment_type),
      billing_partner_id = v_billing_partner_id,
      snapshot = snapshot || jsonb_build_object(
        'freight_payment_type', upper(p_freight_payment_type),
        'billing_partner_id', v_billing_partner_id
      ),
      updated_at = now()
  where id = v_vehicle.current_freight_id
    and tenant_id = v_vehicle.tenant_id;

  if not found then raise exception 'CANONICAL_FREIGHT_NOT_CREATED'; end if;
  return v_vehicle;
end;
$$;

revoke all on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric
) from public, anon;
revoke all on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text
) from public, anon;
grant execute on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric
) to authenticated;
grant execute on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text
) to authenticated;

-- O documento financeiro usa o snapshot do pagador salvo no frete.
create or replace function private.enforce_freight_billing_partner_on_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_partner_id uuid;
begin
  if new.source_type = 'freight' and new.source_event = 'completion_revenue' then
    select billing_partner_id into v_partner_id
    from public.freights
    where id = new.source_id and tenant_id = new.tenant_id;

    if v_partner_id is null then
      raise exception 'FREIGHT_BILLING_PARTNER_REQUIRED';
    end if;
    new.partner_id := v_partner_id;
  end if;
  return new;
end;
$$;

create trigger financial_documents_enforce_freight_billing_partner
before insert or update of partner_id, source_type, source_id, source_event
on public.financial_documents
for each row execute function private.enforce_freight_billing_partner_on_document();

comment on column public.freights.freight_payment_type is
  'CIF: remetente paga. FOB: destinatario paga.';
comment on column public.freights.billing_partner_id is
  'Snapshot do business partner responsavel financeiramente pelo frete.';
