-- Frotak - Operacao com embarcador (Ambev SE): ligar a operacao num tenant e preparar a
-- demonstracao.
--
-- Nao cria tenant sozinho. O tenant e criado pelo cadastro normal do painel master
-- (master_register_client). Depois, um usuario da plataforma chama:
--
--   select public.master_enable_driver_ops('<tenant_id>', 'Operacao Ambev SE', 'Ambev', 'Aracaju/SE');
--   select public.driver_ops_seed_demo('<tenant_id>', '<driver_id>', 'distribuicao');
--
-- A primeira liga os modulos (driver_app, driver_journey, driver_safety, fuel_control,
-- delivery_routes, driver_performance) so naquele tenant e grava configuracao, modelo de
-- checklist e postos de exemplo. A segunda monta a rota do dia, documentos, avisos e o
-- perfil do veiculo do motorista indicado. Todos os nomes, CNPJs e placas sao ficticios.

begin;

create or replace function public.master_enable_driver_ops(
  p_tenant_id uuid,
  p_operation_label text default 'Operacao',
  p_shipper_name text default null,
  p_base_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_codes text[] := array['driver_app', 'driver_journey', 'driver_safety', 'fuel_control', 'delivery_routes', 'driver_performance'];
begin
  if not private.is_platform_user() then
    raise exception 'PLATFORM_ONLY' using errcode = '42501';
  end if;

  select id into v_workspace_id from public.workspaces where tenant_id = p_tenant_id and is_default;
  if v_workspace_id is null then
    raise exception 'DEFAULT_WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.tenant_platform_products (tenant_id, platform_product_id, enabled, created_by)
  select p_tenant_id, p.id, true, auth.uid() from public.platform_products p where p.code = 'tms'
  on conflict (tenant_id, platform_product_id) do update set enabled = true, ends_at = null;

  insert into public.workspace_modules (workspace_id, module_id, enabled, source, created_by)
  select v_workspace_id, m.id, true, 'manual', auth.uid()
  from public.modules m where m.code = any (v_codes)
  on conflict (workspace_id, module_id) do update set enabled = true, expires_at = null;

  insert into public.driver_ops_settings (tenant_id, operation_label, shipper_name, base_city)
  values (p_tenant_id, coalesce(nullif(btrim(p_operation_label), ''), 'Operacao'), p_shipper_name, p_base_city)
  on conflict (tenant_id) do update
  set operation_label = excluded.operation_label, shipper_name = excluded.shipper_name, base_city = excluded.base_city;

  if not exists (select 1 from public.vehicle_checklist_templates where tenant_id = p_tenant_id and active) then
    insert into public.vehicle_checklist_templates (tenant_id, name, items)
    values (p_tenant_id, 'Checklist de saida', '[
      {"id":"pneus","group":"Pneus e rodas","label":"Pneus calibrados, sem corte ou bolha","critical":true},
      {"id":"estepe","group":"Pneus e rodas","label":"Estepe e porcas das rodas","critical":false},
      {"id":"freios","group":"Freios e direcao","label":"Freio de servico e de estacionamento","critical":true},
      {"id":"direcao","group":"Freios e direcao","label":"Direcao sem folga","critical":true},
      {"id":"luzes","group":"Luzes","label":"Farois, setas, luz de freio e re","critical":true},
      {"id":"painel","group":"Painel","label":"Sem luz de falha acesa no painel","critical":false},
      {"id":"vazamento","group":"Motor","label":"Sem vazamento de oleo, agua ou ar","critical":true},
      {"id":"oleo","group":"Motor","label":"Nivel de oleo e agua","critical":false},
      {"id":"extintor","group":"Seguranca","label":"Extintor na validade, triangulo e macaco","critical":true},
      {"id":"cinto","group":"Seguranca","label":"Cinto de seguranca e retrovisores","critical":true},
      {"id":"tacografo","group":"Documentos","label":"Tacografo funcionando e documento do veiculo","critical":true},
      {"id":"bau","group":"Carroceria","label":"Bau ou sider sem avaria, lona e travas","critical":false},
      {"id":"epi","group":"Seguranca","label":"EPI: colete, bota e luva","critical":false},
      {"id":"limpeza","group":"Cabine","label":"Cabine limpa e sem objeto solto","critical":false}
    ]'::jsonb);
  end if;

  if not exists (select 1 from public.fuel_stations where tenant_id = p_tenant_id) then
    insert into public.fuel_stations (tenant_id, name, brand, city, state, lat, lng, diesel_price, arla_price, payment_methods)
    values
      (p_tenant_id, 'Posto Rota 101 (exemplo)', 'Bandeira branca', 'Nossa Senhora do Socorro', 'SE', -10.8711, -37.1188, 5.89, 3.79, array['a_prazo_posto']),
      (p_tenant_id, 'Auto Posto Siqueira (exemplo)', 'Bandeira A', 'Aracaju', 'SE', -10.9551, -37.0712, 5.94, 3.89, array['cartao_frota']),
      (p_tenant_id, 'Posto Caminhoneiro Itaporanga (exemplo)', 'Bandeira B', 'Itaporanga d''Ajuda', 'SE', -11.0081, -37.3109, 5.86, 3.75, array['a_prazo_posto']),
      (p_tenant_id, 'Posto Estancia Sul (exemplo)', 'Bandeira branca', 'Estancia', 'SE', -11.2657, -37.4384, 5.91, 3.82, array['cartao_frota']);
  end if;

  return jsonb_build_object('tenant_id', p_tenant_id, 'workspace_id', v_workspace_id, 'modules', to_jsonb(v_codes));
end;
$$;

-- Rota do dia, documentos, avisos e perfil do veiculo para um motorista da demonstracao.
create or replace function public.driver_ops_seed_demo(
  p_tenant_id uuid,
  p_driver_id uuid,
  p_kind text default 'distribuicao'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_settings public.driver_ops_settings;
  v_tz text;
  v_day date;
  v_route public.delivery_routes;
  v_payload jsonb;
begin
  if not (private.is_platform_user() or private.can_access_tenant(p_tenant_id)) then
    raise exception 'TENANT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if not private.tenant_has_module(p_tenant_id, 'delivery_routes') then
    raise exception 'MODULE_DISABLED:delivery_routes' using errcode = '42501';
  end if;
  select * into v_driver from public.drivers where id = p_driver_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'DRIVER_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_vehicle := private.driver_vehicle(v_driver);
  select * into v_settings from public.driver_ops_settings where tenant_id = p_tenant_id;
  v_tz := coalesce(v_settings.time_zone, 'America/Sao_Paulo');
  v_day := (now() at time zone v_tz)::date;

  if v_vehicle.id is not null then
    insert into public.vehicle_fuel_profiles (vehicle_id, tenant_id, tank_capacity_liters, km_per_liter_target)
    values (v_vehicle.id, p_tenant_id,
      case when p_kind = 'transferencia' then 600 else 275 end,
      case when p_kind = 'transferencia' then 2.6 else 4.2 end)
    on conflict (vehicle_id) do nothing;
  end if;

  if not exists (select 1 from public.driver_compliance_documents where driver_id = v_driver.id) then
    insert into public.driver_compliance_documents (tenant_id, driver_id, kind, label, number, expires_at, blocking)
    values
      (p_tenant_id, v_driver.id, 'cnh', 'CNH categoria E', '00000000000', v_day + 23, true),
      (p_tenant_id, v_driver.id, 'toxicologico', 'Exame toxicologico', null, v_day + 410, true),
      (p_tenant_id, v_driver.id, 'aso', 'ASO (saude ocupacional)', null, v_day + 180, true),
      (p_tenant_id, v_driver.id, 'direcao_defensiva', 'Curso de direcao defensiva', null, v_day - 4, false),
      (p_tenant_id, v_driver.id, 'integracao_cliente', 'Integracao de seguranca do embarcador', null, v_day + 95, true);
  end if;

  if not exists (select 1 from public.driver_notices where tenant_id = p_tenant_id) then
    insert into public.driver_notices (tenant_id, title, body, tag, author_label, requires_ack)
    values
      (p_tenant_id, 'Uso obrigatorio de EPI no CDD',
       'A partir de hoje, colete, bota e luva sao obrigatorios na area de carga e descarga do CDD. Quem estiver sem EPI nao entra na doca.',
       'seguranca', 'Seguranca do trabalho', true),
      (p_tenant_id, 'Janela do Supermercado Sergipano mudou',
       'O recebimento agora fecha as 10h. Priorize esse cliente na rota.', 'cliente', 'Central de operacoes', true),
      (p_tenant_id, 'Premiacao do mes',
       'Nota acima de 90 recebe R$ 400, acima de 80 recebe R$ 250 e acima de 70 recebe R$ 120. Confira sua nota no app.',
       'rh', 'RH', false);
  end if;

  if p_kind = 'transferencia' then
    v_payload := jsonb_build_object(
      'code', 'TR-' || to_char(v_day, 'YYMMDD'), 'kind', 'transferencia',
      'title', 'Transferencia fabrica para CDD Itabaiana', 'shipper_name', coalesce(v_settings.shipper_name, 'Embarcador'),
      'driver_id', v_driver.id, 'vehicle_id', v_vehicle.id,
      'scheduled_at', (v_day + time '06:30') at time zone v_tz,
      'total_boxes', 1680, 'total_weight_kg', 27400, 'distance_km', 142,
      'stops', jsonb_build_array(
        jsonb_build_object('kind', 'origem', 'name', 'Fabrica de bebidas (exemplo)', 'address', 'Rod. BR-101, km 92',
          'city', 'Nossa Senhora do Socorro/SE', 'lat', -10.8553, 'lng', -37.1262, 'radius_m', 500,
          'window_from', '06:30', 'window_to', '07:30', 'dock', 'Doca 12',
          'invoices', jsonb_build_array(jsonb_build_object('number', 'NF 552.910', 'boxes', 1680, 'amount', 98450.0))),
        jsonb_build_object('kind', 'destino', 'name', 'CDD Itabaiana (exemplo)', 'address', 'Rod. SE-170, km 3',
          'city', 'Itabaiana/SE', 'lat', -10.6858, 'lng', -37.4253, 'radius_m', 400,
          'window_from', '09:00', 'window_to', '11:00', 'dock', 'Doca 3',
          'invoices', jsonb_build_array(jsonb_build_object('number', 'NF 552.910', 'boxes', 1680, 'amount', 98450.0)),
          'returnables_expected', jsonb_build_object('palete', 28)),
        jsonb_build_object('kind', 'retorno', 'name', 'Fabrica de bebidas (exemplo) - retorno com paletes',
          'address', 'Rod. BR-101, km 92', 'city', 'Nossa Senhora do Socorro/SE', 'lat', -10.8553, 'lng', -37.1262, 'radius_m', 500)
      ));
  else
    v_payload := jsonb_build_object(
      'code', '7731-' || to_char(v_day, 'YYMMDD'), 'kind', 'distribuicao',
      'title', 'Rota de distribuicao Aracaju Sul', 'shipper_name', coalesce(v_settings.shipper_name, 'Embarcador'),
      'driver_id', v_driver.id, 'vehicle_id', v_vehicle.id,
      'scheduled_at', (v_day + time '06:00') at time zone v_tz,
      'total_boxes', 300, 'total_weight_kg', 6900, 'distance_km', 58,
      'stops', jsonb_build_array(
        jsonb_build_object('kind', 'origem', 'name', 'CDD Aracaju (exemplo)', 'address', 'Av. Industrial, 1500 - Distrito Industrial',
          'city', 'Aracaju/SE', 'lat', -10.9622, 'lng', -37.0941, 'radius_m', 300, 'dock', 'Doca 7'),
        jsonb_build_object('kind', 'entrega', 'name', 'Mercadinho Bom Preco (exemplo)', 'document', '12.345.678/0001-01',
          'address', 'Rua Itabaiana, 410 - Centro', 'city', 'Aracaju/SE', 'lat', -10.9139, 'lng', -37.0565,
          'window_from', '07:00', 'window_to', '11:00',
          'invoices', jsonb_build_array(jsonb_build_object('number', 'NF 184.221', 'boxes', 48, 'amount', 3912.4)),
          'returnables_expected', jsonb_build_object('garrafeira', 40),
          'payment_expected', jsonb_build_object('method', 'boleto', 'amount', 3912.4)),
        jsonb_build_object('kind', 'entrega', 'name', 'Bar do Litoral (exemplo)', 'document', '23.456.789/0001-02',
          'address', 'Av. Santos Dumont, 1250 - Atalaia', 'city', 'Aracaju/SE', 'lat', -10.9852, 'lng', -37.0476,
          'window_from', '08:00', 'window_to', '12:00',
          'invoices', jsonb_build_array(jsonb_build_object('number', 'NF 184.222', 'boxes', 22, 'amount', 1876.0)),
          'returnables_expected', jsonb_build_object('garrafeira', 22, 'barril', 2),
          'payment_expected', jsonb_build_object('method', 'pix', 'amount', 1876.0)),
        jsonb_build_object('kind', 'entrega', 'name', 'Supermercado Sergipano (exemplo)', 'document', '34.567.890/0001-03',
          'address', 'Av. Hermes Fontes, 3010 - Luzia', 'city', 'Aracaju/SE', 'lat', -10.9468, 'lng', -37.0631,
          'window_from', '07:00', 'window_to', '10:00', 'dock', 'Doca 2',
          'invoices', jsonb_build_array(
            jsonb_build_object('number', 'NF 184.223', 'boxes', 120, 'amount', 9840.0),
            jsonb_build_object('number', 'NF 184.224', 'boxes', 36, 'amount', 2952.0)),
          'returnables_expected', jsonb_build_object('palete', 4),
          'payment_expected', jsonb_build_object('method', 'boleto', 'amount', 12792.0)),
        jsonb_build_object('kind', 'entrega', 'name', 'Adega Coroa do Meio (exemplo)', 'document', '45.678.901/0001-04',
          'address', 'Rua Niceu Dantas, 88 - Coroa do Meio', 'city', 'Aracaju/SE', 'lat', -10.9934, 'lng', -37.0458,
          'window_from', '09:00', 'window_to', '13:00',
          'invoices', jsonb_build_array(jsonb_build_object('number', 'NF 184.225', 'boxes', 30, 'amount', 2610.0)),
          'returnables_expected', jsonb_build_object('garrafeira', 30),
          'payment_expected', jsonb_build_object('method', 'dinheiro', 'amount', 2610.0)),
        jsonb_build_object('kind', 'entrega', 'name', 'Restaurante Orla Sul (exemplo)', 'document', '56.789.012/0001-05',
          'address', 'Av. Inacio Barbosa, 2200 - Farolandia', 'city', 'Aracaju/SE', 'lat', -10.9711, 'lng', -37.0598,
          'window_from', '10:00', 'window_to', '14:00',
          'invoices', jsonb_build_array(jsonb_build_object('number', 'NF 184.226', 'boxes', 18, 'amount', 1494.0)),
          'returnables_expected', jsonb_build_object('garrafeira', 18, 'barril', 1),
          'payment_expected', jsonb_build_object('method', 'pix', 'amount', 1494.0)),
        jsonb_build_object('kind', 'entrega', 'name', 'Conveniencia Jardins (exemplo)', 'document', '67.890.123/0001-06',
          'address', 'Rua Proj. Joao Ribeiro, 15 - Jardins', 'city', 'Aracaju/SE', 'lat', -10.9442, 'lng', -37.0514,
          'window_from', '10:00', 'window_to', '16:00',
          'invoices', jsonb_build_array(jsonb_build_object('number', 'NF 184.227', 'boxes', 26, 'amount', 2236.0)),
          'returnables_expected', jsonb_build_object('garrafeira', 24),
          'payment_expected', jsonb_build_object('method', 'boleto', 'amount', 2236.0)),
        jsonb_build_object('kind', 'retorno', 'name', 'CDD Aracaju (exemplo) - retorno e prestacao de contas',
          'address', 'Av. Industrial, 1500 - Distrito Industrial', 'city', 'Aracaju/SE', 'lat', -10.9622, 'lng', -37.0941, 'radius_m', 300)
      ));
  end if;

  -- route_upsert exige can_access_tenant; usuario da plataforma passa direto aqui.
  if exists (select 1 from public.delivery_routes where tenant_id = p_tenant_id and code = v_payload->>'code' and status <> 'agendada') then
    select * into v_route from public.delivery_routes where tenant_id = p_tenant_id and code = v_payload->>'code';
  else
    v_route := private.route_upsert_unchecked(p_tenant_id, v_payload);
  end if;

  return jsonb_build_object('route_id', v_route.id, 'code', v_route.code, 'vehicle_id', v_vehicle.id);
end;
$$;

revoke all on function public.master_enable_driver_ops(uuid, text, text, text) from public, anon;
revoke all on function public.driver_ops_seed_demo(uuid, uuid, text) from public, anon;
grant execute on function public.master_enable_driver_ops(uuid, text, text, text) to authenticated;
grant execute on function public.driver_ops_seed_demo(uuid, uuid, text) to authenticated;

commit;
