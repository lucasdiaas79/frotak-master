-- Frotak Financeiro - Fase 3.5: remove apenas fatos transacionais declarados demo.
-- Cadastros, estrutura financeira, tenancy, rastreamento e vinculos de frota permanecem.

-- Primeiro remove o estado corrente ficticio sem desvincular motorista/implementos.
update public.vehicles
set current_freight_id = null,
    sender_id = null,
    recipient_id = null,
    product_id = null,
    freight_value = null,
    status = 'disponivel-patio',
    vehicle_situation = 'disponivel-patio',
    freight_stage = 'DISPONIVEL',
    workflow_flags = (workflow_flags - 'last_manual_override' - 'pending_documents')
      || '{"pending_documents":[]}'::jsonb,
    last_transition_source = 'Sistema',
    last_transition_by = null,
    last_transition_at = now(),
    updated_at = now()
where current_freight_id is not null
   or sender_id is not null
   or recipient_id is not null
   or product_id is not null
   or freight_value is not null
   or status in (
     'aguardando-motorista', 'rota-carregar', 'rota-descarregar', 'rota-retornando',
     'parado-aguardando-carga', 'aguardando-cte', 'aguardando-confirmacao',
     'parado-aguardando-comando', 'parado-descarregando'
   );

-- Dependentes financeiros, dos filhos para os fatos de origem.
delete from public.financial_integration_events;
delete from public.financial_integration_jobs;
delete from public.financial_audit_events;
delete from public.journal_lines;
delete from public.journal_entries;
delete from public.financial_settlements;
delete from public.financial_allocations;
delete from public.financial_installments;

alter table public.financial_documents disable trigger financial_documents_prevent_posted_delete;
delete from public.financial_documents;
alter table public.financial_documents enable trigger financial_documents_prevent_posted_delete;

-- Fatos operacionais demo. Posicoes e sincronizacao Sascar nao sao tocadas.
delete from public.freight_expenses;
delete from public.fuel_records;
delete from public.freight_documents;
delete from public.manual_workflow_overrides;
delete from public.fleet_events where freight_id is not null;
delete from public.freights;
delete from public.freight_history;
