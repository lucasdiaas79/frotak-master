-- Notificacoes (202611260001): regras, avisos, preferencias, publico por papel, agendadas, RLS e
-- copia das regras para o banco do cliente. Roda numa transacao e desfaz tudo no fim.
begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_dispatcher uuid := gen_random_uuid();
  v_financial uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_other_workspace uuid := gen_random_uuid();
  v_vehicle uuid := gen_random_uuid();
  v_freight uuid := gen_random_uuid();
  v_driver uuid := gen_random_uuid();
  v_sender uuid := gen_random_uuid();
  v_recipient uuid := gen_random_uuid();
  v_document uuid := gen_random_uuid();
  v_stage_rule uuid := '6f1c2a3e-6d1f-4c0a-9b0e-0f5a1d000001';
  v_value_rule uuid := gen_random_uuid();
  v_cnh_rule uuid := gen_random_uuid();
  v_count integer;
  v_title text;
  v_body text;
  v_status text;
begin
  -- Empresa com dono, operador e financeiro; outra empresa com um usuario.
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_owner, 'authenticated', 'authenticated', 'dono@exemplo.com', now(), now()),
    (v_dispatcher, 'authenticated', 'authenticated', 'operador@exemplo.com', now(), now()),
    (v_financial, 'authenticated', 'authenticated', 'financeiro@exemplo.com', now(), now()),
    (v_other, 'authenticated', 'authenticated', 'outra@exemplo.com', now(), now());
  insert into public.tenants (id, slug, legal_name, status) values
    (v_tenant, 'notif-teste', 'Transportes Teste', 'active'),
    (v_other_tenant, 'notif-outra', 'Outra Transportadora', 'active');
  insert into public.workspaces (id, tenant_id, name, slug, status, is_default) values
    (v_workspace, v_tenant, 'Matriz', 'matriz', 'active', true),
    (v_other_workspace, v_other_tenant, 'Matriz', 'matriz-outra', 'active', true);
  insert into public.workspace_memberships (workspace_id, user_id, status, is_owner) values
    (v_workspace, v_owner, 'active', true),
    (v_workspace, v_dispatcher, 'active', false),
    (v_workspace, v_financial, 'active', false),
    (v_other_workspace, v_other, 'active', true);
  insert into public.workspace_roles (workspace_id, code, name, is_system, active) values
    (v_workspace, 'DISPATCHER', 'Operador', true, true),
    (v_workspace, 'FINANCIAL', 'Financeiro', true, true);
  insert into public.membership_roles (membership_id, role_id, workspace_id)
  select wm.id, r.id, v_workspace
  from public.workspace_memberships wm
  join public.workspace_roles r on r.workspace_id = v_workspace
    and r.code = case wm.user_id when v_dispatcher then 'DISPATCHER' when v_financial then 'FINANCIAL' end
  where wm.workspace_id = v_workspace;

  insert into public.drivers (id, tenant_id, name) values (v_driver, v_tenant, 'João Silva');
  insert into public.senders (id, tenant_id, name) values (v_sender, v_tenant, 'Usina Norte');
  insert into public.recipients (id, tenant_id, name) values (v_recipient, v_tenant, 'Porto Sul');

  -- 1. Frete novo (vinculo do veiculo cria o frete): "Novo frete" para os 3 da empresa.
  insert into public.vehicles (id, tenant_id, plate, type, freight_stage, driver_id, sender_id, recipient_id, current_freight_id)
  values (v_vehicle, v_tenant, 'ABC1D23', 'Cavalo', 'DISPONIVEL', v_driver, v_sender, v_recipient, v_freight);
  select count(*) into v_count from public.notifications where source_id = v_freight;
  if v_count <> 3 then
    raise exception 'Novo frete: esperava 3 avisos, veio %', v_count;
  end if;
  select title, body into v_title, v_body from public.notifications where source_id = v_freight and user_id = v_owner;
  if v_title <> 'Novo frete ABC1D23' or v_body <> 'Usina Norte → Porto Sul. Motorista João Silva.' then
    raise exception 'Texto do novo frete errado: "%" / "%"', v_title, v_body;
  end if;
  if exists (select 1 from public.notifications where user_id = v_other) then
    raise exception 'Usuario de outra empresa recebeu aviso.';
  end if;

  -- 2. Mudanca de etapa pelo caminho da tela (veiculo -> frete): "Frete mudou de etapa".
  delete from public.notifications;
  update public.vehicles set freight_stage = 'EM_ROTA_CARREGAR' where id = v_vehicle;
  select count(*) into v_count from public.notifications where rule_id = v_stage_rule;
  if v_count <> 3 then
    raise exception 'Mudanca de etapa: esperava 3 avisos, veio %', v_count;
  end if;
  select title into v_title from public.notifications where rule_id = v_stage_rule limit 1;
  if v_title <> 'Frete ABC1D23: Em rota indo carregar' then
    raise exception 'Titulo da etapa errado: %', v_title;
  end if;

  -- 3. Gravacao sem mudar a etapa nao avisa.
  delete from public.notifications;
  update public.vehicles set model = 'FH 540' where id = v_vehicle;
  if exists (select 1 from public.notifications) then
    raise exception 'Gravacao sem mudar etapa gerou aviso.';
  end if;

  -- 4. Preferencias: financeiro desligou a regra; operador nao quer aviso no Windows.
  insert into public.notification_preferences (user_id, rule_id, enabled, push) values
    (v_financial, v_stage_rule, false, true),
    (v_dispatcher, v_stage_rule, true, false);
  update public.vehicles set freight_stage = 'AGUARDANDO_NOTA' where id = v_vehicle;
  select count(*) into v_count from public.notifications where rule_id = v_stage_rule;
  if v_count <> 2 then
    raise exception 'Preferencia: esperava 2 avisos, veio %', v_count;
  end if;
  select push_status into v_status from public.notifications where rule_id = v_stage_rule and user_id = v_dispatcher;
  if v_status <> 'skipped' then
    raise exception 'Operador sem push deveria ficar skipped, ficou %', v_status;
  end if;
  select push_status into v_status from public.notifications where rule_id = v_stage_rule and user_id = v_owner;
  if v_status <> 'pending' then
    raise exception 'Dono deveria ficar pending, ficou %', v_status;
  end if;

  -- 5. Regra so desta empresa, so para o Financeiro, com condicao de valor.
  insert into public.notification_rules (
    id, tenant_id, name, source, trigger_kind, watch_fields, conditions, title_template, audience_roles
  ) values (
    v_value_rule, v_tenant, 'Frete acima de mil', 'freights', 'update', array['valor'],
    '[{"field": "valor", "op": "gt", "value": 1000}]'::jsonb, 'Frete {{placa}} de {{valor}}', array['FINANCIAL']
  );
  delete from public.notifications;
  update public.vehicles set freight_value = 500 where id = v_vehicle;
  if exists (select 1 from public.notifications where rule_id = v_value_rule) then
    raise exception 'Valor abaixo do limite gerou aviso.';
  end if;
  update public.vehicles set freight_value = 1500.5 where id = v_vehicle;
  select count(*), min(title) into v_count, v_title from public.notifications where rule_id = v_value_rule;
  if v_count <> 1 or v_title <> 'Frete ABC1D23 de R$ 1.500,50' then
    raise exception 'Regra de valor: esperava 1 aviso "Frete ABC1D23 de R$ 1.500,50", veio % "%"', v_count, v_title;
  end if;
  if not exists (select 1 from public.notifications where rule_id = v_value_rule and user_id = v_financial) then
    raise exception 'Aviso do Financeiro foi para outra pessoa.';
  end if;

  -- 6. Dado no banco: CNH vencendo em ate 30 dias, avaliada pelo agendador, uma vez por vencimento.
  insert into public.notification_rules (
    id, tenant_id, name, source, trigger_kind, conditions, title_template, body_template, audience_roles
  ) values (
    v_cnh_rule, null, 'CNH vencendo', 'driver_compliance_documents', 'schedule',
    '[{"field": "tipo", "op": "eq", "value": "cnh"}, {"field": "dias_para_vencer", "op": "lte", "value": 30}]'::jsonb,
    '{{tipo}} de {{motorista}} vence em {{vencimento}}', '[[Faltam {{dias_para_vencer}} dias.]]', array['OWNER']
  );
  insert into public.driver_compliance_documents (id, tenant_id, driver_id, kind, label, expires_at)
  values (v_document, v_tenant, v_driver, 'cnh', 'CNH', current_date + 10);
  delete from public.notifications;
  v_count := public.evaluate_scheduled_notification_rules();
  if v_count <> 1 then
    raise exception 'Agendada: esperava 1 aviso (so o dono), veio %', v_count;
  end if;
  select title, body into v_title, v_body from public.notifications where rule_id = v_cnh_rule;
  if v_title <> 'CNH de João Silva vence em ' || to_char(current_date + 10, 'DD/MM/YYYY') or v_body <> 'Faltam 10 dias.' then
    raise exception 'Texto da CNH errado: "%" / "%"', v_title, v_body;
  end if;
  if public.evaluate_scheduled_notification_rules() <> 0 then
    raise exception 'Agendada repetiu o aviso do mesmo vencimento.';
  end if;
  update public.driver_compliance_documents set expires_at = current_date + 20 where id = v_document;
  if public.evaluate_scheduled_notification_rules() <> 1 then
    raise exception 'Vencimento novo deveria avisar de novo.';
  end if;

  -- 7. Evento da operacao com regra de gravacao e regra quebrada: a gravacao nunca falha.
  insert into public.notification_rules (tenant_id, name, source, trigger_kind, conditions, title_template)
  values (null, 'Condicao torta', 'fleet_events', 'insert', '[{"field": "status", "op": "gt", "value": "abc"}]'::jsonb, 'x');
  insert into public.fleet_events (tenant_id, vehicle_id, status, freight_stage, source, description)
  values (v_tenant, v_vehicle, 'rota-carregar', 'EM_ROTA_CARREGAR', 'Operador', 'teste');

  -- 8. RLS: cada usuario ve e marca so os proprios avisos; regras de outra empresa nao aparecem.
  perform set_config('request.jwt.claims', json_build_object('sub', v_dispatcher, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_dispatcher::text, true);
  set local role authenticated;
  select count(*) into v_count from public.notifications where user_id <> v_dispatcher;
  if v_count <> 0 then
    raise exception 'RLS: operador viu % avisos de outros.', v_count;
  end if;
  update public.notifications set read_at = now() where user_id = v_dispatcher;
  begin
    update public.notifications set title = 'mudado' where user_id = v_dispatcher;
    raise exception 'RLS: operador conseguiu mudar o titulo.';
  exception when insufficient_privilege then
    null;
  end;
  select count(*) into v_count from public.notification_rules where id = v_value_rule;
  if v_count <> 1 then
    raise exception 'Operador deveria ver a regra da propria empresa.';
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;
  select count(*) into v_count from public.notification_rules where id = v_value_rule;
  if v_count <> 0 then
    raise exception 'Outra empresa viu regra que nao e dela.';
  end if;
  reset role;

  -- 9. Copia das regras para o banco do cliente: substitui o conjunto e mantem os ids.
  v_count := public.master_sync_notification_rules(v_tenant, jsonb_build_array(
    jsonb_build_object('id', v_stage_rule, 'tenant_id', null, 'name', 'Frete mudou de etapa', 'source', 'freights',
      'trigger_kind', 'update', 'watch_fields', jsonb_build_array('etapa'), 'conditions', '[]'::jsonb,
      'title_template', 'Frete {{placa}} agora: {{etapa}}', 'audience_roles', '[]'::jsonb, 'active', true),
    jsonb_build_object('id', v_value_rule, 'tenant_id', v_other_tenant, 'name', 'Frete acima de mil', 'source', 'freights',
      'trigger_kind', 'update', 'watch_fields', jsonb_build_array('valor'),
      'conditions', '[{"field": "valor", "op": "gt", "value": 1000}]'::jsonb,
      'title_template', 'Frete {{placa}} de {{valor}}', 'audience_roles', jsonb_build_array('FINANCIAL'), 'active', true)
  ));
  if v_count <> 2 or (select count(*) from public.notification_rules) <> 2 then
    raise exception 'Copia: esperava 2 regras, ficaram %', (select count(*) from public.notification_rules);
  end if;
  if (select tenant_id from public.notification_rules where id = v_value_rule) <> v_tenant then
    raise exception 'Copia: regra especifica deve apontar para a empresa deste banco.';
  end if;
  if not exists (select 1 from public.notification_preferences where rule_id = v_stage_rule and user_id = v_financial) then
    raise exception 'Copia apagou a preferencia de uma regra que continua.';
  end if;
  delete from public.notifications;
  update public.vehicles set freight_stage = 'NOTA_EM_CONFERENCIA' where id = v_vehicle;
  select min(title) into v_title from public.notifications where rule_id = v_stage_rule;
  if v_title <> 'Frete ABC1D23 agora: Nota em conferência' then
    raise exception 'Copia nao atualizou o texto: %', v_title;
  end if;

  raise notice 'notificacoes: todos os casos passaram';
end;
$$;

rollback;
