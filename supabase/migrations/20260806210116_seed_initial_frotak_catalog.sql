insert into public.plans (code, name, description, active)
values (
  'BASIC',
  'Plano Básico',
  'Plano base contendo as funcionalidades atuais da gestão de frota da Frotak.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  active = excluded.active,
  updated_at = now();

insert into public.modules (code, name, description, active)
values
  (
    'fleet_core',
    'Frotak Core',
    'Gestão de frota, Smart Flow, fretes, cadastros, documentos, abastecimentos, histórico, mapa operacional e sistema do motorista.',
    true
  ),
  (
    'cte_issuance',
    'Emissão de CT-e',
    'Emissão e gerenciamento de CT-e e MDF-e.',
    true
  ),
  (
    'financial',
    'Financeiro',
    'Contas a pagar, contas a receber, custos, receitas, fluxo de caixa e rentabilidade.',
    true
  ),
  (
    'frotak_ai',
    'Frotak IA',
    'Assistente inteligente, análises, alertas e automações operacionais.',
    true
  ),
  (
    'frotak_tracking',
    'Rastreadores Frotak',
    'Monitoramento, telemetria, alertas e gerenciamento dos dispositivos de rastreamento Frotak.',
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  active = excluded.active,
  updated_at = now();

insert into public.plan_modules (plan_id, module_id, included)
select plans.id, modules.id, true
from public.plans
join public.modules on modules.code = 'fleet_core'
where plans.code = 'BASIC'
on conflict (plan_id, module_id) do update
set included = excluded.included;
