create or replace function public.get_driver_app_context()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_profile public.profiles;
  v_payload jsonb;
begin
  v_driver := private.current_driver();

  select *
    into v_profile
  from public.profiles
  where id = auth.uid()
  limit 1;

  select *
    into v_vehicle
  from public.vehicles
  where tenant_id = v_driver.tenant_id
    and (
      driver_id = v_driver.id
      or id = v_driver.vehicle_id
    )
  order by
    (current_freight_id is not null) desc,
    updated_at desc
  limit 1;

  select jsonb_build_object(
    'driver', to_jsonb(v_driver),
    'profile', case when v_profile.id is null then null else jsonb_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'must_change_password', coalesce(v_profile.must_change_password, false)
    ) end,
    'vehicle', case when v_vehicle.id is null then null else to_jsonb(v_vehicle) end,
    'trailers', coalesce((
      select jsonb_agg(to_jsonb(t) order by coalesce(vt.position, 1), t.identifier)
      from public.vehicle_trailers vt
      join public.trailers t on t.id = vt.trailer_id
      where vt.tenant_id = v_driver.tenant_id
        and vt.vehicle_id = v_vehicle.id
        and vt.active = true
    ), (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.identifier), '[]'::jsonb)
      from public.trailers t
      where t.tenant_id = v_driver.tenant_id
        and t.id = v_vehicle.trailer_id
    ), '[]'::jsonb),
    'sender', case when v_vehicle.sender_id is null then null else (
      select to_jsonb(s)
      from public.senders s
      where s.tenant_id = v_driver.tenant_id
        and s.id = v_vehicle.sender_id
    ) end,
    'recipient', case when v_vehicle.recipient_id is null then null else (
      select to_jsonb(r)
      from public.recipients r
      where r.tenant_id = v_driver.tenant_id
        and r.id = v_vehicle.recipient_id
    ) end,
    'product', case when v_vehicle.product_id is null then null else (
      select to_jsonb(p)
      from public.products p
      where p.tenant_id = v_driver.tenant_id
        and p.id = v_vehicle.product_id
    ) end,
    'documents', coalesce((
      select jsonb_agg(to_jsonb(fd) order by fd.created_at desc)
      from public.freight_documents fd
      where fd.tenant_id = v_driver.tenant_id
        and fd.vehicle_id = v_vehicle.id
        and fd.freight_id is not distinct from v_vehicle.current_freight_id
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.get_driver_app_context() from public, anon, authenticated;
grant execute on function public.get_driver_app_context() to authenticated;

create or replace function public.driver_app_advance_stage(
  p_vehicle_id uuid,
  p_target_stage text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_from_status text;
  v_from_stage text;
  v_next_stage text;
  v_next_status text;
  v_next_situation text;
  v_event_type text;
  v_description text;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and tenant_id = v_driver.tenant_id
    and driver_id = v_driver.id
  for update;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  v_from_status := v_vehicle.status;
  v_from_stage := coalesce(v_vehicle.freight_stage, 'DISPONIVEL');

  if p_target_stage is not null then
    case p_target_stage
      when 'EM_ROTA_CARREGAR' then
        if v_from_stage <> 'DISPONIVEL' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'AGUARDANDO_NOTA' then
        if v_from_stage <> 'EM_ROTA_CARREGAR' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'NOTA_EM_CONFERENCIA' then
        if v_from_stage <> 'AGUARDANDO_NOTA' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'EM_ROTA_ENTREGA' then
        if v_from_stage <> 'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'ENTREGUE_AG_FINALIZACAO' then
        if v_from_stage <> 'EM_ROTA_ENTREGA' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'ENTREGA_FINALIZADA' then
        if v_from_stage <> 'ENTREGUE_AG_FINALIZACAO' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      else
        raise exception 'target stage not allowed for driver';
    end case;
  end if;

  v_next_stage := coalesce(
    p_target_stage,
    case v_from_stage
      when 'DISPONIVEL' then 'EM_ROTA_CARREGAR'
      when 'EM_ROTA_CARREGAR' then 'AGUARDANDO_NOTA'
      when 'AGUARDANDO_NOTA' then 'NOTA_EM_CONFERENCIA'
      when 'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA' then 'EM_ROTA_ENTREGA'
      when 'EM_ROTA_ENTREGA' then 'ENTREGUE_AG_FINALIZACAO'
      when 'ENTREGUE_AG_FINALIZACAO' then 'ENTREGA_FINALIZADA'
      else null
    end
  );

  if v_next_stage is null then
    raise exception 'stage cannot be advanced by driver';
  end if;

  if v_next_stage = 'NOTA_EM_CONFERENCIA' and not exists (
    select 1
    from public.freight_documents fd
    where fd.tenant_id = v_vehicle.tenant_id
      and fd.vehicle_id = v_vehicle.id
      and fd.freight_id = v_vehicle.current_freight_id
      and fd.kind = 'nota_fiscal'
      and coalesce(fd.status, 'anexado') not in ('rejeitado', 'rejected', 'deleted', 'excluido')
  ) then
    raise exception 'nota fiscal required before advancing';
  end if;

  if v_next_stage = 'ENTREGA_FINALIZADA' and not exists (
    select 1
    from public.freight_documents fd
    where fd.tenant_id = v_vehicle.tenant_id
      and fd.vehicle_id = v_vehicle.id
      and fd.freight_id = v_vehicle.current_freight_id
      and fd.kind in ('comprovante_entrega', 'comprovante_descarga', 'canhoto', 'recibo')
      and coalesce(fd.status, 'anexado') not in ('rejeitado', 'rejected', 'deleted', 'excluido')
  ) then
    raise exception 'delivery receipt required before advancing';
  end if;

  v_next_status := case v_next_stage
    when 'EM_ROTA_CARREGAR' then 'rota-carregar'
    when 'AGUARDANDO_NOTA' then 'parado-aguardando-carga'
    when 'NOTA_EM_CONFERENCIA' then 'parado-aguardando-carga'
    when 'EM_ROTA_ENTREGA' then 'rota-descarregar'
    when 'ENTREGUE_AG_FINALIZACAO' then 'parado-descarregando'
    when 'ENTREGA_FINALIZADA' then 'parado-aguardando-comando'
    else v_vehicle.status
  end;

  v_next_situation := case
    when v_next_status in ('rota-carregar', 'rota-descarregar', 'rota-retornando') then 'em-rota'
    when v_next_status = 'parado-quebrado' then 'quebrado'
    when v_next_status in ('manutencao', 'disponivel-oficina') then 'manutencao'
    when v_next_status = 'disponivel-patio' then 'disponivel-patio'
    else 'parado'
  end;

  v_event_type := case v_next_stage
    when 'EM_ROTA_CARREGAR' then 'driver_freight_accepted'
    when 'AGUARDANDO_NOTA' then 'driver_arrived_sender'
    when 'NOTA_EM_CONFERENCIA' then 'driver_invoice_sent'
    when 'EM_ROTA_ENTREGA' then 'driver_documents_confirmed'
    when 'ENTREGUE_AG_FINALIZACAO' then 'driver_arrived_recipient'
    when 'ENTREGA_FINALIZADA' then 'driver_delivery_completed'
    else 'driver_stage_confirmed'
  end;

  v_description := case v_next_stage
    when 'EM_ROTA_CARREGAR' then 'Demanda aceita pelo motorista'
    when 'AGUARDANDO_NOTA' then 'Chegada ao remetente confirmada pelo motorista'
    when 'NOTA_EM_CONFERENCIA' then 'Carregamento confirmado e nota enviada pelo motorista'
    when 'EM_ROTA_ENTREGA' then 'Documentos confirmados pelo motorista'
    when 'ENTREGUE_AG_FINALIZACAO' then 'Chegada ao destinatario confirmada pelo motorista'
    when 'ENTREGA_FINALIZADA' then 'Descarga concluida pelo motorista'
    else 'Etapa confirmada pelo aplicativo do motorista'
  end;

  update public.vehicles
  set
    status = v_next_status,
    vehicle_situation = v_next_situation,
    freight_stage = v_next_stage,
    workflow_flags = case
      when v_next_stage = 'NOTA_EM_CONFERENCIA' then jsonb_set(
        coalesce(workflow_flags, '{}'::jsonb),
        '{pending_documents}',
        '["cte_mdfe"]'::jsonb,
        true
      )
      when v_next_stage = 'EM_ROTA_ENTREGA' then jsonb_set(
        coalesce(workflow_flags, '{}'::jsonb),
        '{pending_documents}',
        '[]'::jsonb,
        true
      )
      else coalesce(workflow_flags, '{}'::jsonb)
    end,
    last_transition_source = 'driver_app',
    last_transition_by = auth.uid(),
    last_transition_at = now(),
    updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  insert into public.fleet_events (
    tenant_id,
    vehicle_id,
    freight_id,
    status,
    freight_stage,
    city,
    state,
    source,
    description,
    created_by,
    event_type,
    action_origin,
    metadata
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_vehicle.status,
    v_vehicle.freight_stage,
    v_vehicle.city,
    v_vehicle.state,
    'Motorista',
    v_description,
    auth.uid(),
    v_event_type,
    'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'from_status', v_from_status,
      'to_status', v_next_status,
      'from_freight_stage', v_from_stage,
      'to_freight_stage', v_next_stage
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_advance_stage(uuid, text) from public, anon, authenticated;
grant execute on function public.driver_app_advance_stage(uuid, text) to authenticated;

create or replace function public.driver_app_register_document(
  p_kind text,
  p_file_name text,
  p_mime_type text default null,
  p_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_document public.freight_documents;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where tenant_id = v_driver.tenant_id
    and driver_id = v_driver.id
    and current_freight_id is not null
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'active freight not found for authenticated driver';
  end if;

  insert into public.freight_documents (
    tenant_id,
    vehicle_id,
    freight_id,
    driver_id,
    kind,
    source,
    file_name,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    status
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_driver.id,
    p_kind,
    'motorista_app',
    p_file_name,
    'freight-documents',
    concat(
      'driver-app/',
      v_vehicle.current_freight_id,
      '/',
      p_kind,
      '/',
      extract(epoch from now())::bigint,
      '-',
      regexp_replace(coalesce(p_file_name, 'documento'), '[^a-zA-Z0-9._-]+', '-', 'g')
    ),
    p_mime_type,
    p_size_bytes,
    'anexado'
  )
  returning * into v_document;

  update public.vehicles
  set workflow_flags = case
        when p_kind = 'nota_fiscal' then jsonb_set(
          coalesce(workflow_flags, '{}'::jsonb),
          '{pending_documents}',
          '[]'::jsonb,
          true
        )
        else coalesce(workflow_flags, '{}'::jsonb)
      end,
      updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  insert into public.fleet_events (
    tenant_id,
    vehicle_id,
    freight_id,
    status,
    freight_stage,
    city,
    state,
    source,
    description,
    created_by,
    event_type,
    action_origin,
    metadata
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_vehicle.status,
    v_vehicle.freight_stage,
    v_vehicle.city,
    v_vehicle.state,
    'Motorista',
    'Documento anexado pelo aplicativo do motorista',
    auth.uid(),
    'driver_document_uploaded',
    'driver_app',
    jsonb_build_object('driver_id', v_driver.id, 'document_id', v_document.id, 'kind', p_kind)
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_document(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.driver_app_register_document(text, text, text, bigint) to authenticated;

notify pgrst, 'reload schema';
