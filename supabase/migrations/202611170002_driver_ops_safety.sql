-- Frotak - Operacao com embarcador, fase 3: checklist do veiculo, ocorrencias e emergencia,
-- documentos do motorista com vencimento e avisos com ciencia. Modulo: driver_safety.
-- Fotos ficam no bucket driver-ops (pasta = tenant_id), mesma regra dos outros buckets do app.

begin;

-- Arquivos do app (fotos de checklist, ocorrencia, canhoto, assinatura, documentos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-ops', 'driver-ops', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists driver_ops_files_select on storage.objects;
drop policy if exists driver_ops_files_insert on storage.objects;

create policy driver_ops_files_select on storage.objects
for select to authenticated
using (
  bucket_id = 'driver-ops'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

create policy driver_ops_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'driver-ops'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
  )
);

-- 1. Checklist ---------------------------------------------------------------------------

create table public.vehicle_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null default 'Checklist padrao',
  items jsonb not null,
  blocks_trip_on_critical boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_checklist_templates_items_chk check (jsonb_typeof(items) = 'array')
);

comment on column public.vehicle_checklist_templates.items is
  'Lista de itens: [{"id","group","label","critical"}].';

create unique index vehicle_checklist_templates_one_active_uidx
  on public.vehicle_checklist_templates (tenant_id)
  where active;

create trigger vehicle_checklist_templates_set_updated_at
before update on public.vehicle_checklist_templates
for each row execute function public.set_updated_at();

create table public.vehicle_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  route_id uuid,
  template_id uuid references public.vehicle_checklist_templates(id) on delete set null,
  moment text not null,
  answers jsonb not null,
  approved boolean not null,
  failed_items text[] not null default '{}',
  odometer numeric,
  geo jsonb,
  performed_at timestamptz not null,
  client_event_id text,
  maintenance_status text not null default 'nenhuma',
  maintenance_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_checklists_moment_chk check (moment in ('saida', 'chegada')),
  constraint vehicle_checklists_maintenance_chk check (maintenance_status in ('nenhuma', 'pendente', 'resolvida'))
);

create unique index vehicle_checklists_client_event_uidx
  on public.vehicle_checklists (driver_id, client_event_id)
  where client_event_id is not null;
create index vehicle_checklists_tenant_idx on public.vehicle_checklists (tenant_id, performed_at desc);
create index vehicle_checklists_vehicle_idx on public.vehicle_checklists (vehicle_id, performed_at desc);

create trigger vehicle_checklists_set_updated_at
before update on public.vehicle_checklists
for each row execute function public.set_updated_at();

-- 2. Ocorrencias ---------------------------------------------------------------------------

create table public.driver_occurrences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  route_id uuid,
  stop_id uuid,
  kind text not null,
  severity text not null default 'media',
  status text not null default 'aberta',
  note text,
  photo_paths text[] not null default '{}',
  geo jsonb,
  occurred_at timestamptz not null,
  client_event_id text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_occurrences_kind_chk check (kind in (
    'pneu', 'quebra', 'acidente', 'avaria_carga', 'cliente_fechado', 'atraso',
    'fiscalizacao', 'roubo', 'emergencia', 'checklist', 'outro'
  )),
  constraint driver_occurrences_severity_chk check (severity in ('baixa', 'media', 'alta')),
  constraint driver_occurrences_status_chk check (status in ('aberta', 'em_atendimento', 'resolvida'))
);

create unique index driver_occurrences_client_event_uidx
  on public.driver_occurrences (driver_id, client_event_id)
  where client_event_id is not null;
create index driver_occurrences_tenant_idx on public.driver_occurrences (tenant_id, occurred_at desc);
create index driver_occurrences_open_idx on public.driver_occurrences (tenant_id) where status <> 'resolvida';

create trigger driver_occurrences_set_updated_at
before update on public.driver_occurrences
for each row execute function public.set_updated_at();

create table public.driver_occurrence_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  occurrence_id uuid not null references public.driver_occurrences(id) on delete cascade,
  author_kind text not null,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint driver_occurrence_messages_author_chk check (author_kind in ('motorista', 'central')),
  constraint driver_occurrence_messages_body_chk check (btrim(body) <> '')
);

create index driver_occurrence_messages_occ_idx on public.driver_occurrence_messages (occurrence_id, created_at);

-- 3. Documentos do motorista -------------------------------------------------------------

create table public.driver_compliance_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  kind text not null,
  label text not null,
  number text,
  expires_at date not null,
  blocking boolean not null default true,
  file_path text,
  status text not null default 'valido',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_compliance_documents_kind_chk check (kind in (
    'cnh', 'toxicologico', 'aso', 'direcao_defensiva', 'nr11', 'mopp', 'integracao_cliente', 'outro'
  )),
  constraint driver_compliance_documents_status_chk check (status in ('valido', 'enviado', 'recusado'))
);

create index driver_compliance_documents_driver_idx on public.driver_compliance_documents (driver_id, expires_at);
create index driver_compliance_documents_expiry_idx on public.driver_compliance_documents (tenant_id, expires_at);

create trigger driver_compliance_documents_set_updated_at
before update on public.driver_compliance_documents
for each row execute function public.set_updated_at();

-- 4. Avisos com ciencia ---------------------------------------------------------------------

create table public.driver_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  title text not null,
  body text not null,
  tag text not null default 'operacao',
  author_label text not null default 'Central',
  requires_ack boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_notices_tag_chk check (tag in ('seguranca', 'operacao', 'rh', 'cliente')),
  constraint driver_notices_title_chk check (btrim(title) <> '')
);

create index driver_notices_tenant_idx on public.driver_notices (tenant_id, published_at desc);

create trigger driver_notices_set_updated_at
before update on public.driver_notices
for each row execute function public.set_updated_at();

create table public.driver_notice_acks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  notice_id uuid not null references public.driver_notices(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  acked_at timestamptz not null default now(),
  constraint driver_notice_acks_unique unique (notice_id, driver_id)
);

-- RLS: central do tenant le e escreve; motorista so por RPC.
do $$
declare
  t text;
begin
  foreach t in array array[
    'vehicle_checklist_templates', 'vehicle_checklists', 'driver_occurrences',
    'driver_occurrence_messages', 'driver_compliance_documents', 'driver_notices', 'driver_notice_acks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.can_access_tenant(tenant_id)) with check (private.can_access_tenant(tenant_id))',
      t || '_tenant_access', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- 5. RPCs do motorista -----------------------------------------------------------------------

create or replace function public.driver_checklist_submit(
  p_moment text,
  p_answers jsonb,
  p_odometer numeric default null,
  p_geo jsonb default null,
  p_route_id uuid default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_template public.vehicle_checklist_templates;
  v_failed text[];
  v_critical_failed text[];
  v_approved boolean;
  v_id uuid;
  v_at timestamptz;
begin
  v_driver := private.current_driver_with_module('driver_safety');
  v_at := private.ops_event_time(p_at);
  if p_moment not in ('saida', 'chegada') or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'invalid checklist' using errcode = '22023';
  end if;
  if p_client_event_id is not null and exists (
    select 1 from public.vehicle_checklists where driver_id = v_driver.id and client_event_id = p_client_event_id
  ) then
    return public.get_driver_ops_context();
  end if;

  select * into v_template from public.vehicle_checklist_templates where tenant_id = v_driver.tenant_id and active;
  if not found then
    raise exception 'CHECKLIST_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Todo item do modelo precisa de resposta; item reprovado precisa de descricao.
  if exists (
    select 1 from jsonb_array_elements(v_template.items) item
    where not (p_answers ? (item->>'id'))
  ) then
    raise exception 'CHECKLIST_INCOMPLETE' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(p_answers) a
    where a.value->>'answer' = 'nok' and btrim(coalesce(a.value->>'note', '')) = ''
  ) then
    raise exception 'CHECKLIST_NOTE_REQUIRED' using errcode = '22023';
  end if;

  select coalesce(array_agg(a.key), '{}') into v_failed
  from jsonb_each(p_answers) a where a.value->>'answer' = 'nok';

  select coalesce(array_agg(item->>'id'), '{}') into v_critical_failed
  from jsonb_array_elements(v_template.items) item
  where coalesce((item->>'critical')::boolean, false) and (item->>'id') = any (v_failed);

  v_approved := cardinality(v_critical_failed) = 0 or not v_template.blocks_trip_on_critical;

  insert into public.vehicle_checklists (
    tenant_id, driver_id, vehicle_id, route_id, template_id, moment, answers, approved, failed_items,
    odometer, geo, performed_at, client_event_id, maintenance_status
  )
  values (
    v_driver.tenant_id, v_driver.id, v_driver.vehicle_id, p_route_id, v_template.id, p_moment, p_answers, v_approved, v_failed,
    p_odometer, private.ops_clean_geo(p_geo), v_at, p_client_event_id,
    case when cardinality(v_failed) > 0 then 'pendente' else 'nenhuma' end
  )
  returning id into v_id;

  if cardinality(v_failed) > 0 then
    insert into public.driver_occurrences (tenant_id, driver_id, vehicle_id, route_id, kind, severity, note, geo, occurred_at)
    values (
      v_driver.tenant_id, v_driver.id, v_driver.vehicle_id, p_route_id, 'checklist',
      case when v_approved then 'media' else 'alta' end,
      'Checklist com itens reprovados: ' || array_to_string(v_failed, ', '),
      private.ops_clean_geo(p_geo), v_at
    );
  end if;

  if private.tenant_has_module(v_driver.tenant_id, 'driver_journey') and exists (
    select 1 from public.driver_work_days where driver_id = v_driver.id and ended_at is null
  ) then
    perform private.journey_set_activity(v_driver, 'trabalho', 'etapa', 'Checklist de ' || p_moment, v_at, p_geo, p_route_id, null, null);
  end if;

  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_occurrence_create(
  p_kind text,
  p_note text default null,
  p_severity text default null,
  p_photo_paths text[] default '{}',
  p_geo jsonb default null,
  p_route_id uuid default null,
  p_stop_id uuid default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_id uuid;
  v_at timestamptz;
  v_severity text;
begin
  v_driver := private.current_driver_with_module('driver_safety');
  v_at := private.ops_event_time(p_at);
  if p_client_event_id is not null and exists (
    select 1 from public.driver_occurrences where driver_id = v_driver.id and client_event_id = p_client_event_id
  ) then
    return public.get_driver_ops_context();
  end if;

  v_severity := coalesce(p_severity, case
    when p_kind in ('acidente', 'roubo', 'emergencia', 'quebra') then 'alta'
    when p_kind in ('pneu', 'avaria_carga') then 'media'
    else 'baixa' end);

  if exists (
    select 1 from unnest(coalesce(p_photo_paths, '{}')) p
    where private.storage_path_tenant_id(p) is distinct from v_driver.tenant_id
  ) then
    raise exception 'invalid photo path' using errcode = '42501';
  end if;

  insert into public.driver_occurrences (
    tenant_id, driver_id, vehicle_id, route_id, stop_id, kind, severity, note, photo_paths, geo, occurred_at, client_event_id
  )
  values (
    v_driver.tenant_id, v_driver.id, v_driver.vehicle_id, p_route_id, p_stop_id, p_kind, v_severity,
    nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_photo_paths, '{}'), private.ops_clean_geo(p_geo), v_at, p_client_event_id
  )
  returning id into v_id;

  insert into public.driver_occurrence_messages (tenant_id, occurrence_id, author_kind, body)
  values (v_driver.tenant_id, v_id, 'motorista', coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Ocorrencia registrada: ' || p_kind));

  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_occurrence_message(p_occurrence_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  v_driver := private.current_driver_with_module('driver_safety');
  if not exists (select 1 from public.driver_occurrences where id = p_occurrence_id and driver_id = v_driver.id) then
    raise exception 'occurrence not found' using errcode = 'P0002';
  end if;
  insert into public.driver_occurrence_messages (tenant_id, occurrence_id, author_kind, body)
  values (v_driver.tenant_id, p_occurrence_id, 'motorista', btrim(p_body));
  return public.get_driver_ops_context();
end;
$$;

-- Central responde: grava a mensagem e muda o status.
create or replace function public.occurrence_reply(p_occurrence_id uuid, p_body text, p_status text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_occ public.driver_occurrences;
begin
  select * into v_occ from public.driver_occurrences where id = p_occurrence_id for update;
  if not found or not private.can_access_tenant(v_occ.tenant_id) then
    raise exception 'occurrence not found' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_body, '')) <> '' then
    insert into public.driver_occurrence_messages (tenant_id, occurrence_id, author_kind, author_user_id, body)
    values (v_occ.tenant_id, v_occ.id, 'central', auth.uid(), btrim(p_body));
  end if;
  if p_status is not null then
    if p_status not in ('aberta', 'em_atendimento', 'resolvida') then
      raise exception 'invalid status' using errcode = '22023';
    end if;
    update public.driver_occurrences
    set status = p_status,
        resolved_at = case when p_status = 'resolvida' then now() else null end,
        resolved_by = case when p_status = 'resolvida' then auth.uid() else null end
    where id = v_occ.id;
  elsif v_occ.status = 'aberta' then
    update public.driver_occurrences set status = 'em_atendimento' where id = v_occ.id;
  end if;
end;
$$;

create or replace function public.driver_document_submit(
  p_document_id uuid,
  p_file_path text,
  p_expires_at date default null,
  p_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  v_driver := private.current_driver_with_module('driver_safety');
  if private.storage_path_tenant_id(p_file_path) is distinct from v_driver.tenant_id then
    raise exception 'invalid file path' using errcode = '42501';
  end if;
  update public.driver_compliance_documents
  set file_path = p_file_path,
      status = 'enviado',
      submitted_at = now(),
      expires_at = coalesce(p_expires_at, expires_at),
      number = coalesce(nullif(btrim(coalesce(p_number, '')), ''), number)
  where id = p_document_id and driver_id = v_driver.id;
  if not found then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_notice_ack(p_notice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  v_driver := private.current_driver_with_module('driver_safety');
  if not exists (select 1 from public.driver_notices where id = p_notice_id and tenant_id = v_driver.tenant_id) then
    raise exception 'notice not found' using errcode = 'P0002';
  end if;
  insert into public.driver_notice_acks (tenant_id, notice_id, driver_id)
  values (v_driver.tenant_id, p_notice_id, v_driver.id)
  on conflict (notice_id, driver_id) do nothing;
  return public.get_driver_ops_context();
end;
$$;

revoke all on function public.driver_checklist_submit(text, jsonb, numeric, jsonb, uuid, timestamptz, text) from public, anon;
revoke all on function public.driver_occurrence_create(text, text, text, text[], jsonb, uuid, uuid, timestamptz, text) from public, anon;
revoke all on function public.driver_occurrence_message(uuid, text) from public, anon;
revoke all on function public.occurrence_reply(uuid, text, text) from public, anon;
revoke all on function public.driver_document_submit(uuid, text, date, text) from public, anon;
revoke all on function public.driver_notice_ack(uuid) from public, anon;
grant execute on function public.driver_checklist_submit(text, jsonb, numeric, jsonb, uuid, timestamptz, text) to authenticated;
grant execute on function public.driver_occurrence_create(text, text, text, text[], jsonb, uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.driver_occurrence_message(uuid, text) to authenticated;
grant execute on function public.occurrence_reply(uuid, text, text) to authenticated;
grant execute on function public.driver_document_submit(uuid, text, date, text) to authenticated;
grant execute on function public.driver_notice_ack(uuid) to authenticated;

commit;
