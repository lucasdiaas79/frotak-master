begin;

do $$
declare
  v_owner_id uuid := gen_random_uuid();
  v_operator_id uuid := gen_random_uuid();
  v_support_id uuid := gen_random_uuid();
  v_outsider_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_entitlements jsonb;
  v_count integer;
begin
  select count(*) into v_count from public.platform_products where code in ('tms', 'view');
  if v_count <> 2 then
    raise exception 'Expected products tms and view, found %', v_count;
  end if;

  select count(*) into v_count
  from public.modules m
  join public.platform_products p on p.id = m.platform_product_id
  where p.code = 'tms'
    and m.code in ('fleet_core', 'financial', 'cte_issuance', 'frotak_ai', 'driver_app', 'frotak_tracking');
  if v_count <> 6 then
    raise exception 'Expected 6 TMS modules linked to the tms product, found %', v_count;
  end if;

  if not exists (select 1 from public.modules where code = 'fleet_core' and is_core) then
    raise exception 'Expected fleet_core to be the core module';
  end if;

  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_owner_id, 'authenticated', 'authenticated', 'owner@example.com', now(), now(), now()),
    (v_operator_id, 'authenticated', 'authenticated', 'operator@example.com', now(), now(), now()),
    (v_support_id, 'authenticated', 'authenticated', 'support@example.com', now(), now(), now()),
    (v_outsider_id, 'authenticated', 'authenticated', 'outsider@example.com', now(), now(), now());

  insert into public.platform_users (user_id, platform_role, active)
  values
    (v_operator_id, 'operations', true),
    (v_support_id, 'support', true);

  insert into public.tenants (slug, legal_name, status)
  values ('entitlements-test', 'Entitlements Test', 'active')
  returning id into v_tenant_id;

  if not exists (
    select 1
    from public.tenant_platform_products tp
    join public.platform_products p on p.id = tp.platform_product_id
    where tp.tenant_id = v_tenant_id and p.code = 'tms' and tp.enabled
  ) then
    raise exception 'Expected new tenant to receive the tms product by default';
  end if;

  insert into public.workspaces (tenant_id, name, slug, is_default)
  values (v_tenant_id, 'Principal', 'principal', true)
  returning id into v_workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, status, is_owner, joined_at)
  values (v_workspace_id, v_owner_id, 'active', true, now());

  -- Somente operadores do Master alteram modulos
  begin
    perform public.master_set_tenant_module(v_tenant_id, 'financial', true, v_support_id);
    raise exception 'Expected support role to be rejected';
  exception
    when insufficient_privilege then null;
  end;

  perform public.master_set_tenant_module(v_tenant_id, 'fleet_core', true, v_operator_id);
  perform public.master_set_tenant_module(v_tenant_id, 'financial', true, v_operator_id);
  if not private.workspace_has_module(v_workspace_id, 'financial') then
    raise exception 'Expected financial to be enabled';
  end if;

  begin
    perform public.master_set_tenant_module(v_tenant_id, 'fleet_core', false, v_operator_id);
    raise exception 'Expected core module disable to be rejected';
  exception
    when check_violation then null;
  end;

  -- Dono deixa de ver o financeiro quando o modulo e desligado
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  if not private.can_read_financial_workspace(v_workspace_id) then
    raise exception 'Expected owner to read financial while module is enabled';
  end if;

  perform public.master_set_tenant_module(v_tenant_id, 'financial', false, v_operator_id);
  if private.can_read_financial_workspace(v_workspace_id) then
    raise exception 'Expected owner to lose financial access with module disabled';
  end if;

  begin
    perform private.require_financial_permission(v_workspace_id, 'financial.view');
    raise exception 'Expected MODULE_DISABLED for financial';
  exception
    when insufficient_privilege then
      if sqlerrm not like 'MODULE_DISABLED:financial%' then
        raise exception 'Expected MODULE_DISABLED message, got %', sqlerrm;
      end if;
  end;

  -- Produto desligado bloqueia todos os modulos dele, sem apagar o que estava ligado
  perform public.master_set_tenant_module(v_tenant_id, 'financial', true, v_operator_id);
  perform public.master_set_tenant_product(v_tenant_id, 'tms', false, v_operator_id);
  if private.workspace_has_module(v_workspace_id, 'financial') then
    raise exception 'Expected tms product disable to block financial';
  end if;

  perform public.master_set_tenant_product(v_tenant_id, 'tms', true, v_operator_id);
  if not private.workspace_has_module(v_workspace_id, 'financial') then
    raise exception 'Expected financial to come back with the tms product';
  end if;

  -- Leitura para o app cliente
  v_entitlements := public.get_workspace_entitlements(v_workspace_id);
  if not (v_entitlements -> 'products') ? 'tms' then
    raise exception 'Expected entitlements to list tms, got %', v_entitlements;
  end if;
  if not (v_entitlements -> 'modules') ? 'financial' then
    raise exception 'Expected entitlements to list financial, got %', v_entitlements;
  end if;

  perform set_config('request.jwt.claim.sub', v_outsider_id::text, true);
  begin
    perform public.get_workspace_entitlements(v_workspace_id);
    raise exception 'Expected outsider to be rejected';
  exception
    when insufficient_privilege then null;
  end;

  -- Empresa suspensa: o membro le a situacao (o app explica o bloqueio), sem nenhum modulo
  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  update public.tenants set status = 'suspended' where id = v_tenant_id;
  v_entitlements := public.get_workspace_entitlements(v_workspace_id);
  if v_entitlements ->> 'tenantStatus' <> 'suspended' then
    raise exception 'Expected suspended member to read tenantStatus, got %', v_entitlements;
  end if;
  if jsonb_array_length(v_entitlements -> 'modules') <> 0 then
    raise exception 'Expected no modules while suspended, got %', v_entitlements;
  end if;
  if private.is_workspace_member(v_workspace_id) then
    raise exception 'Expected suspended tenant to stay out of workspace data';
  end if;
  update public.tenants set status = 'active' where id = v_tenant_id;

  perform set_config('request.jwt.claim.sub', v_outsider_id::text, true);
  begin
    perform public.get_workspace_entitlements(v_workspace_id);
    raise exception 'Expected outsider to stay rejected';
  exception
    when insufficient_privilege then null;
  end;

  -- Auditoria registrada no catalogo
  select count(*) into v_count
  from public.audit_logs
  where tenant_id = v_tenant_id
    and action in (
      'tenant.module.enabled',
      'tenant.module.disabled',
      'tenant.product.enabled',
      'tenant.product.disabled'
    );
  if v_count <> 6 then
    raise exception 'Expected 6 audit entries, found %', v_count;
  end if;
end;
$$;

rollback;
