with permission_seed (module_code, code, name, description, risk_level) as (
  values
    (null, 'workspace.members.read', 'Ver membros', 'Visualizar membros do workspace.', 'low'),
    (null, 'workspace.members.manage', 'Gerenciar membros', 'Convidar, suspender e gerenciar membros do workspace.', 'high'),
    (null, 'workspace.roles.read', 'Ver cargos', 'Visualizar cargos do workspace.', 'low'),
    (null, 'workspace.roles.manage', 'Gerenciar cargos', 'Criar e gerenciar cargos do workspace.', 'high'),
    (null, 'workspace.modules.read', 'Ver modulos', 'Visualizar modulos habilitados no workspace.', 'low'),
    (null, 'workspace.settings.read', 'Ver configuracoes', 'Visualizar configuracoes do workspace.', 'low'),
    (null, 'workspace.settings.manage', 'Gerenciar configuracoes', 'Alterar configuracoes administrativas do workspace.', 'critical'),
    (null, 'workspace.subscription.read', 'Ver assinatura', 'Visualizar dados de assinatura do workspace.', 'low'),

    ('fleet_core', 'fleet.dashboard.read', 'Ver dashboard da frota', 'Visualizar indicadores operacionais da frota.', 'low'),
    ('fleet_core', 'fleet.vehicles.read', 'Ver veiculos', 'Visualizar cadastro e situacao de veiculos.', 'low'),
    ('fleet_core', 'fleet.vehicles.manage', 'Gerenciar veiculos', 'Criar e alterar cadastros de veiculos.', 'high'),
    ('fleet_core', 'fleet.drivers.read', 'Ver motoristas', 'Visualizar cadastro de motoristas.', 'low'),
    ('fleet_core', 'fleet.drivers.manage', 'Gerenciar motoristas', 'Criar e alterar cadastros de motoristas.', 'high'),
    ('fleet_core', 'fleet.trailers.read', 'Ver implementos', 'Visualizar implementos e cacambas.', 'low'),
    ('fleet_core', 'fleet.trailers.manage', 'Gerenciar implementos', 'Criar e alterar implementos e cacambas.', 'high'),
    ('fleet_core', 'fleet.freights.read', 'Ver fretes', 'Visualizar fretes e operacoes.', 'low'),
    ('fleet_core', 'fleet.freights.create', 'Criar fretes', 'Criar novos fretes operacionais.', 'medium'),
    ('fleet_core', 'fleet.freights.manage', 'Gerenciar fretes', 'Alterar, encerrar e administrar fretes.', 'high'),
    ('fleet_core', 'fleet.documents.read', 'Ver documentos', 'Visualizar documentos operacionais.', 'low'),
    ('fleet_core', 'fleet.documents.manage', 'Gerenciar documentos', 'Criar e alterar documentos operacionais.', 'high'),
    ('fleet_core', 'fleet.documents.approve', 'Aprovar documentos', 'Aprovar documentos e fluxos operacionais.', 'high'),
    ('fleet_core', 'fleet.fuel.read', 'Ver abastecimentos', 'Visualizar abastecimentos e custos de combustivel.', 'low'),
    ('fleet_core', 'fleet.fuel.manage', 'Gerenciar abastecimentos', 'Criar e alterar registros de abastecimento.', 'high'),
    ('fleet_core', 'fleet.history.read', 'Ver historico', 'Visualizar historico operacional.', 'low'),
    ('fleet_core', 'fleet.history.export', 'Exportar historico', 'Exportar historico operacional.', 'medium'),
    ('fleet_core', 'fleet.history.delete', 'Excluir historico', 'Excluir registros historicos conforme regras administrativas.', 'critical'),
    ('fleet_core', 'fleet.map.read', 'Ver mapa', 'Visualizar mapa operacional da frota.', 'low'),
    ('fleet_core', 'fleet.positions.read', 'Ver posicoes', 'Visualizar posicoes operacionais da frota.', 'low'),
    ('fleet_core', 'fleet.integrations.read', 'Ver integracoes', 'Visualizar estado das integracoes operacionais.', 'low'),
    ('fleet_core', 'fleet.integrations.manage', 'Gerenciar integracoes', 'Configurar integracoes operacionais.', 'critical'),

    ('cte_issuance', 'cte.documents.read', 'Ver CT-e', 'Visualizar documentos fiscais CT-e e MDF-e.', 'low'),
    ('cte_issuance', 'cte.documents.issue', 'Emitir CT-e', 'Emitir CT-e e MDF-e.', 'high'),
    ('cte_issuance', 'cte.documents.cancel', 'Cancelar CT-e', 'Cancelar documentos fiscais emitidos.', 'critical'),
    ('cte_issuance', 'cte.settings.manage', 'Gerenciar configuracoes fiscais', 'Alterar configuracoes de emissao fiscal.', 'critical'),

    ('financial', 'financial.dashboard.read', 'Ver dashboard financeiro', 'Visualizar indicadores financeiros.', 'low'),
    ('financial', 'financial.transactions.read', 'Ver transacoes', 'Visualizar contas, custos, receitas e transacoes.', 'low'),
    ('financial', 'financial.transactions.manage', 'Gerenciar transacoes', 'Criar e alterar transacoes financeiras.', 'high'),
    ('financial', 'financial.reports.export', 'Exportar relatorios financeiros', 'Exportar relatorios financeiros.', 'medium'),
    ('financial', 'financial.settings.manage', 'Gerenciar configuracoes financeiras', 'Alterar configuracoes financeiras criticas.', 'critical'),

    ('frotak_ai', 'ai.assistant.use', 'Usar Frotak IA', 'Usar assistente inteligente da Frotak.', 'medium'),
    ('frotak_ai', 'ai.insights.read', 'Ver insights de IA', 'Visualizar analises e alertas inteligentes.', 'low'),
    ('frotak_ai', 'ai.settings.manage', 'Gerenciar configuracoes de IA', 'Alterar configuracoes da Frotak IA.', 'high'),

    ('frotak_tracking', 'tracking.positions.read', 'Ver posicoes rastreadas', 'Visualizar posicoes de rastreamento.', 'low'),
    ('frotak_tracking', 'tracking.devices.read', 'Ver dispositivos', 'Visualizar dispositivos de rastreamento.', 'low'),
    ('frotak_tracking', 'tracking.devices.manage', 'Gerenciar dispositivos', 'Criar e alterar dispositivos de rastreamento.', 'high'),
    ('frotak_tracking', 'tracking.alerts.read', 'Ver alertas de rastreamento', 'Visualizar alertas de rastreamento.', 'low'),
    ('frotak_tracking', 'tracking.alerts.manage', 'Gerenciar alertas de rastreamento', 'Configurar alertas de rastreamento.', 'high'),
    ('frotak_tracking', 'tracking.settings.manage', 'Gerenciar configuracoes de rastreamento', 'Alterar configuracoes criticas de rastreamento.', 'critical')
)
insert into public.permissions (module_id, code, name, description, risk_level, active)
select modules.id, permission_seed.code, permission_seed.name, permission_seed.description, permission_seed.risk_level, true
from permission_seed
left join public.modules on modules.code = permission_seed.module_code
where permission_seed.module_code is null
   or modules.id is not null
on conflict (code) do update
set
  module_id = excluded.module_id,
  name = excluded.name,
  description = excluded.description,
  risk_level = excluded.risk_level,
  active = excluded.active,
  updated_at = now();
