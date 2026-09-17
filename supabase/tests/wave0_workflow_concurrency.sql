begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_vehicle_id uuid;
  v_vehicle public.vehicles;
  v_version integer;
  v_conflict_seen boolean := false;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_user_id, 'authenticated', 'authenticated', 'forge-wave0@example.com', now(), now(), now());

  insert into public.platform_users (user_id, platform_role, active)
  values (v_user_id, 'support', true);

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.tenants (slug, legal_name, trade_name, status)
  values ('forge-wave0-lab', 'Forge Wave 0 Lab Ltda', 'FROTAK LAB', 'active')
  returning id into v_tenant_id;

  insert into public.vehicles (
    tenant_id, plate, type, status, vehicle_situation, freight_stage
  ) values (
    v_tenant_id, 'LAB0A01', 'cavalo', 'disponivel-patio', 'disponivel-patio', 'DISPONIVEL'
  ) returning id, workflow_version into v_vehicle_id, v_version;

  if v_version <> 0 then
    raise exception 'Expected initial workflow_version=0, got %', v_version;
  end if;

  select public.set_vehicle_status(
    v_vehicle_id,
    'rota-carregar',
    'Operador',
    'Wave 0 test',
    'EM_ROTA_CARREGAR',
    0
  ) into v_vehicle;

  if v_vehicle.workflow_version <> 1 then
    raise exception 'Expected workflow_version=1 after state transition, got %', v_vehicle.workflow_version;
  end if;

  update public.vehicles
  set lat = -10.90, lng = -37.07, city = 'Aracaju', state = 'SE'
  where id = v_vehicle_id;

  select workflow_version into v_version from public.vehicles where id = v_vehicle_id;
  if v_version <> 1 then
    raise exception 'Telemetry-only update changed workflow_version to %', v_version;
  end if;

  update public.vehicles set workflow_version = 999 where id = v_vehicle_id;
  select workflow_version into v_version from public.vehicles where id = v_vehicle_id;
  if v_version <> 1 then
    raise exception 'Manual workflow_version write escaped guard: %', v_version;
  end if;

  begin
    perform public.set_vehicle_status(
      v_vehicle_id,
      'parado-aguardando-carga',
      'Operador',
      'Stale writer must fail',
      'AGUARDANDO_NOTA',
      0
    );
  exception
    when serialization_failure then
      if sqlerrm like 'WORKFLOW_VERSION_CONFLICT%' then
        v_conflict_seen := true;
      else
        raise;
      end if;
  end;

  if not v_conflict_seen then
    raise exception 'Expected stale workflow writer to be rejected';
  end if;

  select * into v_vehicle from public.vehicles where id = v_vehicle_id;
  if v_vehicle.status <> 'rota-carregar'
     or v_vehicle.freight_stage <> 'EM_ROTA_CARREGAR'
     or v_vehicle.workflow_version <> 1 then
    raise exception 'Stale writer changed workflow unexpectedly';
  end if;
end;
$$;

rollback;
