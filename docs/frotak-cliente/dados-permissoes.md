# Dados, permissoes e tenant

Status: COD do schema versionado, complementado por leitura de catalogos remotos em EV-SCHEMA-01. Inventarios SQL sao declaracoes historicas; `evidencias/schema-remoto-metadados.json` registra o schema efetivo consultado sem linhas de negocio/Auth. Nenhum teste de acesso negativo ou de escrita foi executado.

## DATA-01: dicionario e fontes

Os campos tipados de interface estao em [tipos.json](inventarios/tipos.json). As declaracoes de colunas SQL e relacoes estao em [sql-colunas.json](inventarios/sql-colunas.json) e [sql-relacoes.json](inventarios/sql-relacoes.json). Funcoes, triggers, policies, indices, views, drops e RLS ficam em [sql-declaracoes.json](inventarios/sql-declaracoes.json); assinaturas/expressoes em [sql-contratos.json](inventarios/sql-contratos.json). Cada item aponta arquivo e linha. Consultar todas as redefinicoes e patches dinamicos antes de reconstruir uma funcao.

| Familia | Entidades e relacoes principais | Fonte e invariantes |
|---|---|---|
| Identidade | `profiles` -> Auth; `tenants` -> `workspaces`; `workspace_memberships` -> user/workspace; `membership_roles`, `workspace_roles`, `role_permissions`, `permissions` | Migrations `20260806212813*` e `20260806212814*`; membership ativo, perfil ativo, tenant/workspace ativos. |
| Oferta | `plans`, `modules`, relacoes de planos, `workspace_modules` | Migrations `20260806210115*`; habilitacao, inicio/expiracao e modulo ativo. Administracao e externa ao Cliente. |
| Cadastros | `vehicles`, `drivers`, `trailers`, `vehicle_trailers`, `senders`, `recipients`, `products` | `202608080001*`; IDs, tenant, dados cadastrais e vinculos. `drivers.auth_user_id` integra motorista. |
| Operacao | `vehicles.current_freight_id`, `freight_stage`, `status`, `situation`; `fleet_events`, `manual_workflow_overrides` | Status, etapa e situacao sao dimensoes distintas. Atualizacao deve respeitar RPCs e eventos, nao apenas mover um card. |
| Viagem | `freights`, `freight_history`, `driver_trip_cycles` | UUID de frete conecta operacao e financeiro; tiro longo agrupa trechos por ciclo e sequencia. Fechamento e resumo sao implementados sobre o ciclo e funcoes, nao uma tabela presumida pelo nome da funcionalidade. |
| Documentos | `freight_documents`, Storage; `fuel_documents`, `fuel_document_files`, `fuel_records` | Metadados pertencem ao tenant; URLs assinadas expiram. Arquivo e linha nao sao operacao atomica unica. |
| Motorista | `freight_expenses`, `freight_cash_entries`, `driver_trip_daily_allowances`, `driver_daily_allowance_settings` | Caixa exclui combustivel; despesas e diarias possuem regras proprias. |
| Financeiro | `business_partners`, `business_partner_roles`, `legacy_partner_links`, `chart_of_accounts`, `cost_centers`, `financial_accounts` | Operacao mantem senders/recipients; parceiros financeiros sao vinculados, nao substituir um pelo outro por nome semelhante. |
| Titulos | `financial_documents` -> `financial_installments`, `financial_allocations`, `financial_settlements` | Competencia no documento; vencimento/saldo na parcela; baixa na liquidacao. Rateio nao pode ultrapassar documento. |
| Razao/auditoria | `journal_entries`, `journal_lines`, `accounting_periods`, `financial_audit_events`, `audit_logs` | Lancamentos contabilizados nao devem ser apagados fisicamente para desfazer pagamento. |
| Automacoes | `financial_integration_jobs`, settings, `financial_recurring_rules`, folha e adiantamentos | Chaves de origem e competencia garantem deduplicacao nos fluxos previstos; retry tem limite. |
| Telematica | `vehicle_positions`, `integration_sync_state`, `integration_locks`, `workspace_integrations` | Posicao historica difere do ultimo ponto no veiculo; credenciais resolvidas no servidor. |

## AUTHZ-01: isolamento operacional

`202608080001_create_operational_fleet_schema.sql:11` define `current_tenant_id`, e `:33` define `private.can_access_tenant`. As policies operacionais usam essa funcao em `USING` e `WITH CHECK`. Muitos services chamam `.from(...).select(...)` sem filtro explicito de tenant: a fronteira efetiva e RLS, nao a barra de navegacao. Conferir o comportamento com usuario que pertence a varios tenants antes de afirmar que o workspace salvo no browser limita todas as leituras.

O helper admite membros ativos de workspaces do tenant e perfil de plataforma segundo o SQL. Nao reduzir isso a roles antigas `admin/gestor/operador`. Referencias antigas a escrita por operador e exclusao apenas admin nao descrevem sozinhas o RBAC atual.

## AUTHZ-02: acesso financeiro

`financial/phase2.ts::getFinancialAccess` obtem acesso real via RPC. `hasFinancialPermission` considera owner OU permissao especifica. No banco, helpers `can_read_financial_workspace`, `can_manage_financial_workspace`, `can_configure_financial_workspace` e validadores de relatorios/folha conferem escopo e permissao. Portanto o modulo financeiro pode admitir membros autorizados; **a regra owner-only da Frotak IA e mais restritiva** e nao deve ser generalizada ao sistema inteiro.

Os catalogos por tenant (parceiros/gerenciais) e por workspace (documentos/contas) sao distintos. Triggers/guards de `202609010002_financial_tenant_relationship_guards.sql` verificam consistencia entre tenant/workspace e referencias. Preservar esses checks mesmo que o frontend ja filtre opcoes.

## AUTHZ-03: IA e usuarios

`frotakAiContext.ts::resolveFrotakAiContext` autentica JWT com `auth.getUser`, confirma membership do workspace recebido, workspace ativo e tenant active/trial. Tenant e derivado no servidor. `canReadFinancial` retorna apenas `isOwner`; permissoes financeiras nao concedem acesso financeiro pela IA. Catalogo de dominios e acoes deve manter essa protecao.

Limite encontrado no cumprimento dessa regra: campos monetarios em tools/dominios classificados operacionais nao passam necessariamente pelo guard financeiro (GAP-AI-03). Nao foi testada exfiltracao nem consulta de dados reais com outro perfil; o risco e confirmado pelo caminho de retorno no codigo, nao por incidente observado.

`workspaceUsers.ts` e `driverAppUsers.ts` usam cliente administrativo apenas no servidor, depois de validar usuario e owner. A criacao de funcionario escreve Auth/profile/membership/role/auditoria e possui tratamento de falha/compensacao. Salvar motorista com telefone chama provisionamento do app. Nenhuma dessas operacoes foi executada nesta auditoria.

## AUTHZ-04: motorista e Storage

`202609300006_realtime_sync_stabilization.sql` acrescenta helpers `driver_app_matches_driver`, `driver_app_can_access_vehicle`, `driver_app_can_access_freight` e policies SELECT para motorista, veiculo, viagem, ciclo, documentos, combustivel, despesas, caixa e diarias. Essas policies coexistem com as de tenant; politicas permissivas somam acessos, nao substituem automaticamente outras policies.

Buckets de frete/combustivel exigem interpretar paths e vinculos. Nunca tratar URL assinada como publica permanente. Leitura administrativa da viagem e leitura do motorista designado sao contratos diferentes.

## DATA-02: estados de dominio

- `VehicleStatus`: 13 valores declarados em `src/lib/types.ts`; inclui patio/oficina, aguardando motorista, carga, CT-e, confirmacao, descarga, comando, retorno, quebrado e manutencao.
- `VehicleSituation`: patio, oficina, em-rota, parado, quebrado, manutencao; nao representa o documento pendente.
- `VehicleFreightStage`: nove microetapas em `freight-workflow.ts`; cinco macrocolunas. Detalhes e mapeamentos em [operacao](modulos/operacao.md).
- Preco: `fixed` ou `per_ton`; pagador `CIF`/`FOB`.
- Ciclo: `open`, `closed`, `cancelled`; odometro final >= inicial quando ambos existem, conforme `202609300004*`.
- Parcela: `open`, `partially_settled`, `settled`, `voided`. Liquidacao: `settlement` ou `reversal`.
- Outros unions e CHECKs: inventarios `tipos`/`sql-contratos`. Tipos TypeScript nao substituem constraints de banco.

## DATA-03: limites de reconstrucao

70 migrations da raiz foram inventariadas no checkout, 71 no commit publicado. As migrations dentro do Cliente sao historicas e podem incluir imports/resets reais antigos. Nao concatenar ambas as cadeias. Patches por `pg_get_functiondef`/`replace` em setembro modificam funcoes sem nova declaracao lexical: um inventario de CREATE FUNCTION sozinho nao define a versao final. O dicionario SQL gerado inclui declaracoes iniciais e parte das adicoes ALTER; nao resolve todas as remocoes, renomes ou expressoes dinamicas.

EV-SCHEMA-01 complementa essa lacuna com 64 tabelas publicas/4 views, 971 colunas, 93 policies, 87 triggers, 180 funcoes e 543 constraints; todas as tabelas publicas consultadas tem RLS habilitada e as quatro views registram security_invoker=true. Esses metadados nao provam ausencia de bypass ou isolamento correto em todos os perfis. Assinaturas e hashes de funcoes permitem comparar versoes sem publicar seus dados. O historico remoto possui 70 migrations; algumas versoes/nomes diferem do arquivo local (por exemplo settlement batch com timestamp de aplicacao). A migration/tabela/job de push publicados nao foram encontrados nesse projeto: ver versao-publicada.md.
