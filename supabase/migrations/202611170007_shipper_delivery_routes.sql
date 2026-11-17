-- Frotak - Rotas de entrega no portal do embarcador.
--
-- Liga as rotas da operacao com embarcador (202611170004) ao Frotak Embarcador
-- (202611110002): cada rota guarda o CNPJ do embarcador. O portal mostra ao embarcador
-- so as rotas com o CNPJ dele, em transportadoras que aceitaram a conexao
-- (shipper_carriers.status = 'ativa'). Ele ve entregas, janelas, canhotos, recusas e
-- vasilhame. Nao ve ponto, abastecimento nem custo da transportadora.
--
-- Uso (usuario da plataforma):
--   select public.master_link_driver_ops_shipper('<tenant_id>', '<cnpj do embarcador>');

begin;

alter table public.delivery_routes add column if not exists shipper_cnpj text;
alter table public.delivery_routes drop constraint if exists delivery_routes_shipper_cnpj_chk;
alter table public.delivery_routes add constraint delivery_routes_shipper_cnpj_chk
  check (shipper_cnpj is null or shipper_cnpj ~ '^[0-9]{14}$');
create index if not exists delivery_routes_shipper_idx
  on public.delivery_routes (shipper_cnpj, scheduled_at desc) where shipper_cnpj is not null;

alter table public.driver_ops_settings add column if not exists shipper_cnpj text;
alter table public.driver_ops_settings drop constraint if exists driver_ops_settings_shipper_cnpj_chk;
alter table public.driver_ops_settings add constraint driver_ops_settings_shipper_cnpj_chk
  check (shipper_cnpj is null or shipper_cnpj ~ '^[0-9]{14}$');

-- Rota nova herda o CNPJ do embarcador da configuracao da operacao.
create or replace function private.delivery_route_fill_shipper()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.shipper_cnpj := nullif(regexp_replace(coalesce(new.shipper_cnpj, ''), '[^0-9]', '', 'g'), '');
  if new.shipper_cnpj is null then
    select s.shipper_cnpj into new.shipper_cnpj
    from public.driver_ops_settings s
    where s.tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_routes_fill_shipper on public.delivery_routes;
create trigger delivery_routes_fill_shipper before insert or update of shipper_cnpj on public.delivery_routes
  for each row execute function private.delivery_route_fill_shipper();

-- Liga a operacao de um tenant a um embarcador: grava o CNPJ, preenche as rotas antigas
-- e, se o embarcador ja tem conta no portal, deixa a transportadora conectada.
create or replace function public.master_link_driver_ops_shipper(p_tenant_id uuid, p_shipper_cnpj text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_cnpj text := regexp_replace(coalesce(p_shipper_cnpj, ''), '[^0-9]', '', 'g');
  v_shipper public.shippers;
  v_tenant public.tenants;
  v_routes integer;
  v_link text := 'sem_conta_no_portal';
begin
  if not private.is_platform_user() then
    raise exception 'PLATFORM_ONLY' using errcode = '42501';
  end if;
  if v_cnpj !~ '^[0-9]{14}$' then
    raise exception 'CNPJ_INVALID' using errcode = '22023';
  end if;
  select * into v_tenant from public.tenants where id = p_tenant_id;
  if not found then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.driver_ops_settings set shipper_cnpj = v_cnpj where tenant_id = p_tenant_id;
  if not found then
    raise exception 'DRIVER_OPS_NOT_ENABLED' using errcode = 'P0002';
  end if;
  update public.delivery_routes set shipper_cnpj = v_cnpj
  where tenant_id = p_tenant_id and shipper_cnpj is null;
  get diagnostics v_routes = row_count;

  select * into v_shipper from public.shippers where cnpj = v_cnpj;
  if found then
    update public.shipper_carriers
    set status = 'ativa', responded_at = coalesce(responded_at, now()), responded_by = coalesce(responded_by, auth.uid())
    where shipper_id = v_shipper.id and tenant_id = p_tenant_id;
    if not found then
      insert into public.shipper_carriers (
        shipper_id, tenant_id, carrier_name, carrier_cnpj, status, invited_by, responded_at, responded_by
      )
      values (
        v_shipper.id, p_tenant_id, coalesce(nullif(btrim(v_tenant.legal_name), ''), 'Transportadora'),
        nullif(substring(regexp_replace(coalesce(v_tenant.cnpj, ''), '[^0-9]', '', 'g') from '^[0-9]{14}$'), ''),
        'ativa', auth.uid(), now(), auth.uid()
      )
      on conflict do nothing;
    end if;
    v_link := 'conectada';
  end if;

  return jsonb_build_object('tenant_id', p_tenant_id, 'shipper_cnpj', v_cnpj, 'routes_updated', v_routes, 'portal', v_link);
end;
$$;

revoke all on function public.master_link_driver_ops_shipper(uuid, text) from public, anon;
grant execute on function public.master_link_driver_ops_shipper(uuid, text) to authenticated;

commit;
