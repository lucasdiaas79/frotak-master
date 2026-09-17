-- Dados 100% sintéticos para desenvolvimento local/CI do Forge.
-- Nunca copiar dados, documentos, credenciais ou identificadores de clientes reais.

insert into public.tenants (
  id, slug, legal_name, trade_name, status, settings
) values (
  '11111111-1111-4111-8111-111111111111',
  'frotak-lab',
  'Frotak Laboratorio Ltda',
  'FROTAK LAB',
  'active',
  '{"environment":"staging","synthetic":true}'::jsonb
)
on conflict (id) do nothing;

insert into public.workspaces (
  id, tenant_id, name, slug, status, is_default, timezone, settings
) values (
  '11111111-1111-4111-8111-111111111112',
  '11111111-1111-4111-8111-111111111111',
  'Laboratorio Operacional',
  'laboratorio-operacional',
  'active',
  true,
  'America/Bahia',
  '{"synthetic":true}'::jsonb
)
on conflict (id) do nothing;

insert into public.drivers (
  id, tenant_id, name, phone, cnh, active
) values
  (
    '22222222-2222-4222-8222-222222222221',
    '11111111-1111-4111-8111-111111111111',
    'Motorista Laboratorio 01',
    '79999990001',
    'LAB00000001',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'Motorista Laboratorio 02',
    '79999990002',
    'LAB00000002',
    true
  )
on conflict (id) do nothing;

insert into public.senders (
  id, tenant_id, name, cnpj, city, state, active
) values (
  '33333333-3333-4333-8333-333333333331',
  '11111111-1111-4111-8111-111111111111',
  'Remetente Laboratorio',
  '00000000000001',
  'Aracaju',
  'SE',
  true
)
on conflict (id) do nothing;

insert into public.recipients (
  id, tenant_id, name, cnpj, city, state, active
) values (
  '33333333-3333-4333-8333-333333333332',
  '11111111-1111-4111-8111-111111111111',
  'Destinatario Laboratorio',
  '00000000000002',
  'Nossa Senhora do Socorro',
  'SE',
  true
)
on conflict (id) do nothing;

insert into public.products (
  id, tenant_id, name, active
) values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'Produto Laboratorio',
  true
)
on conflict (id) do nothing;

insert into public.vehicles (
  id, tenant_id, plate, type, status, vehicle_situation, freight_stage,
  driver_id, city, state, lat, lng
) values
  (
    '44444444-4444-4444-8444-444444444441',
    '11111111-1111-4111-8111-111111111111',
    'LAB0A01',
    'cavalo',
    'disponivel-patio',
    'disponivel-patio',
    'DISPONIVEL',
    '22222222-2222-4222-8222-222222222221',
    'Aracaju',
    'SE',
    -10.9472,
    -37.0731
  ),
  (
    '44444444-4444-4444-8444-444444444442',
    '11111111-1111-4111-8111-111111111111',
    'LAB0A02',
    'cavalo',
    'disponivel-patio',
    'disponivel-patio',
    'DISPONIVEL',
    '22222222-2222-4222-8222-222222222222',
    'Aracaju',
    'SE',
    -10.9472,
    -37.0731
  )
on conflict (id) do nothing;

update public.drivers
set vehicle_id = case id
  when '22222222-2222-4222-8222-222222222221'::uuid then '44444444-4444-4444-8444-444444444441'::uuid
  when '22222222-2222-4222-8222-222222222222'::uuid then '44444444-4444-4444-8444-444444444442'::uuid
  else vehicle_id
end
where tenant_id = '11111111-1111-4111-8111-111111111111'::uuid;
