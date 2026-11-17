-- Cria o tenant de demonstracao da operacao com embarcador (rodar UMA vez, depois das
-- migrations 202611110001..3 e 202611170001..7). Idempotente: se o tenant ja existe, so
-- completa o que falta.
--
--   supabase db query --linked -f supabase/scripts/driver_ops_demo_tenant.sql
--
-- Tudo ficticio: transportadora, CNPJs (formato de exemplo), placa FTK4A21, "Motorista Demo"
-- com telefone (00) 00000-0001 e o embarcador "Cervejaria Exemplo SE".
-- Nao mexe em nenhum outro tenant.

begin;

do $$
declare
  v_slug constant text := 'operacao-embarcador-demo';
  v_shipper_cnpj constant text := '11222333000181';
  v_actor uuid;
  v_tenant uuid;
  v_workspace uuid;
  v_vehicle uuid;
  v_driver uuid;
  v_plan text;
  v_url text;
  v_shipper uuid;
begin
  -- Operador master que assina as mudancas (o primeiro super_admin ativo).
  select user_id into v_actor
  from public.platform_users
  where active and platform_role = 'super_admin'
  order by created_at
  limit 1;
  if v_actor is null then
    raise exception 'Nenhum super_admin ativo em platform_users';
  end if;
  -- As funcoes da operacao conferem auth.uid() e aal2: valem so dentro desta transacao.
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_actor, 'role', 'authenticated', 'aal', 'aal2')::text, true);

  select id into v_tenant from public.tenants where slug = v_slug;
  if v_tenant is null then
    select code into v_plan from public.plans where active order by created_at limit 1;
    select coalesce(
      (select replace(client_url, slug, v_slug) from public.client_databases order by created_at limit 1),
      'https://' || v_slug || '.frotak.log.br'
    ) into v_url;
    v_tenant := public.master_register_client(
      v_slug,
      replace(v_slug, '-', '_'),
      v_url,
      'Transportes Demonstração Operação Ltda',
      'Operação Embarcador (demonstração)',
      '11444777000161',
      'Matriz',
      v_plan,
      now(),
      now() + interval '1 year',
      'mensal',
      20,
      array['driver_app'],
      null,
      v_actor
    );
    raise notice 'tenant criado: %', v_tenant;
  else
    raise notice 'tenant ja existia: %', v_tenant;
  end if;
  select id into v_workspace from public.workspaces where tenant_id = v_tenant and is_default;

  -- Veiculo e motorista ficticios.
  select id into v_vehicle from public.vehicles where tenant_id = v_tenant and plate = 'FTK4A21';
  if v_vehicle is null then
    insert into public.vehicles (tenant_id, plate, type, brand, model, manufacture_year)
    values (v_tenant, 'FTK4A21', 'truck', 'VW', 'Delivery 13.180', 2022)
    returning id into v_vehicle;
  end if;
  select id into v_driver from public.drivers where tenant_id = v_tenant and name = 'Motorista Demo';
  if v_driver is null then
    insert into public.drivers (tenant_id, name, phone, vehicle_id)
    values (v_tenant, 'Motorista Demo', '+5500000000001', v_vehicle)
    returning id into v_driver;
  end if;
  update public.vehicles set driver_id = v_driver where id = v_vehicle;

  perform public.master_enable_driver_ops(v_tenant, 'Operação Cervejaria Exemplo SE', 'Cervejaria Exemplo', 'Aracaju/SE');
  perform public.driver_ops_seed_demo(v_tenant, v_driver, 'distribuicao');

  -- Embarcador de exemplo no portal, ligado a esta operacao.
  select id into v_shipper from public.shippers where cnpj = v_shipper_cnpj;
  if v_shipper is null then
    insert into public.shippers (legal_name, trade_name, cnpj, city, state, created_by)
    values ('Cervejaria Exemplo SE Ltda', 'Cervejaria Exemplo', v_shipper_cnpj, 'Aracaju', 'SE', v_actor)
    returning id into v_shipper;
  end if;
  perform public.master_link_driver_ops_shipper(v_tenant, v_shipper_cnpj);

  raise notice 'pronto: tenant=% workspace=% veiculo=% motorista=% embarcador=%',
    v_tenant, v_workspace, v_vehicle, v_driver, v_shipper;
end;
$$;

commit;

-- Conferencia rapida
select t.slug, t.id as tenant_id,
  (select count(*) from public.delivery_routes r where r.tenant_id = t.id) as rotas,
  (select count(*) from public.fuel_stations s where s.tenant_id = t.id) as postos,
  (select string_agg(m.code, ', ' order by m.code)
     from public.workspace_modules wm join public.modules m on m.id = wm.module_id
     join public.workspaces w on w.id = wm.workspace_id
    where w.tenant_id = t.id and wm.enabled) as modulos
from public.tenants t
where t.slug = 'operacao-embarcador-demo';
