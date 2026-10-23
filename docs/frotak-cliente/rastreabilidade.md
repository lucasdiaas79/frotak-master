# Rastreabilidade e regressoes

IDs ROT/CTL/SUP sao resolvidos nos inventarios. A matriz individual e [matriz-controles.json](inventarios/matriz-controles.json), ligada a [grupos-rastreabilidade.json](inventarios/grupos-rastreabilidade.json), [controles.json](inventarios/controles.json), [validacoes.json](inventarios/validacoes.json), [chamadas-dados.json](inventarios/chamadas-dados.json) e [rpc-sql-rastreio.json](inventarios/rpc-sql-rastreio.json). O grafo de importacao associa candidatos; nao prova que determinada condicao/call foi executada. Esta tabela registra os fluxos revisados semanticamente.

| Fluxo/tela/controle | Regra estavel | Cadeia de codigo -> dados/integracao | Evidencia e regressao necessaria |
|---|---|---|---|
| Login/shell | RULE-AUTH | login.tsx -> auth.acceptMasterSsoFromUrl/getProfile -> Auth/membership/tenant -> AppLayout | COD; SSO real NE. Token invalido, membership inativo, multiworkspace e limpeza da URL. |
| Criar usuario | RULE-USERS | usuarios.createUser -> workspaceUsers.createWorkspaceUser -> owner -> Auth/profile/membership/role/audit | OBS pagina; criacao NE. Falha em cada etapa e compensacao sem alterar outro workspace. |
| Salvar motorista | RULE-DRIVER-ACCESS | motoristas.onSave -> store.upsertDriver -> createDriverAppAccess -> Auth/profile/drivers | OBS modal; escrita NE. Telefone normalizado, repeticao, owner e erro parcial. |
| Salvar cadastros | RULE-CRUD | onSave/save -> store -> services/mappers -> tabelas tenant | OBS formularios; CRUD NE. Normalizacao, duplicidade, FK/RLS e sucesso sem await. |
| KPIs/dashboard | RULE-CASH | index.matchesFilter/movementKey -> useFleet + caixa/despesas -> derivacao local | OBS tela; numeros nao reconciliados. Nao descontar combustivel duas vezes. |
| Pipeline/detalhe | RULE-STAGE | stageOfVehicle/macroStageOfVehicle -> status/etapa/currentFreightId -> card/detalhe | OBS pipeline; transicoes NE. Compatibilidade legado, concorrencia e flags. |
| Criar individual/grupo | RULE-CREATE | gestao.createFreight/createGroupFreight -> freight-operations -> link/set status -> RPC | OBS tres modos; envio NE. Grupo parcialmente criado, ativo ocupado e CIF/FOB. |
| Selecionar ativos | RULE-ASSET | assetAssignmentMode/activeIds -> helpers de disponibilidade -> payload de vinculacao | COD+OBS opcoes no assistente; concorrencia NE. Fixo/manual, varios implementos e ciclo ativo. |
| Preview preco/tributo | RULE-ICMS | freightIcmsPreview -> payload + SQL auto_freight_icms_by_route -> financeiro | COD; numeros/fiscal NE. UFs, tonelagem final e pagador mapeado. |
| Nota e CT-e | RULE-DOCUMENT | DocumentPanel/handleDocument -> services.freight-documents -> Storage/metadados/status | COD; upload/download NE. Rejeicao, reenvio, URL expirada e erro depois do upload. |
| Arrastar/avancar manual | RULE-MANUAL | ManualMoveDialog.submit -> manualMoveFreightCard -> RPC/versao -> override/eventos | COD; confirmacao NE. Motivo, fonte, data, documentos faltantes e conflito. |
| Encerrar/retornar | RULE-RETURN | applyFinalFreightCommand -> setStatus/archive -> funcoes de ciclo/app -> patio/proximo trecho | COD; ciclo real NE. Retorno sem frete, odometro, pos-CTe e promocao de trecho. |
| Historico/anexos | RULE-HISTORY | Historicos effects -> freight-history service -> snapshots/documentos/ciclos -> modal/ZIP | OBS pagina; anexos/exportacao NE. Filtros distintos individual/ciclo e aliases de documento. |
| Media geral diesel | RULE-KML-INTERVAL | calculateKmPerLiter -> fuel_records filtrados -> intervalo/litros atuais | COD; TEST parcial da IA, nao da tela. Odometro duplicado/retroativo, primeiro registro, ARLA. |
| Media do tiro longo | RULE-KML-CYCLE | tripDistance/tripKmPerLiter -> ciclos/combustivel associado -> odometros | OBS aba; calculo real NE. Sem final, sem litros, ciclo errado, fechamento do app. |
| Caixa motorista | RULE-CASH | payment_source -> fechamento SQL -> entradas - despesas trip_cash | COD; reconciliacao NE. Paga pela empresa, abastecimento, adiantamento e resumo historico. |
| Financeiro/permissoes | RULE-FIN-ACCESS | FinancialBoundary/getFinancialAccess -> helpers RLS/RPC -> permissoes por operacao | OBS areas de leitura; perfis alternativos NE; SQL tests existem, nao executados. |
| Baixa/estorno individual | RULE-FIN-SETTLE | SettlementDialog -> phase2 -> settle/reverse RPC -> liquidacao/razao/saldo | COD; fluxo mutavel NE. Saldo, ajustes, periodo fechado, duplo submit e estorno. |
| Pagar/receber varios | RULE-FIN-BULK | BulkSettlementDialog -> loop settleInstallment -> batch metadata -> cashflow expandido | COD; BLQ navegacao de titulos. Falha parcial e repetir lote sem duplicar. |
| DRE/caixa/rentabilidade | RULE-FIN-REPORT | filtros -> reports/profitability RPCs -> ledger/documentos/rateios -> tela/PDF/CSV | OBS telas; exatidao NE. Competencia x caixa, sem apropriacao, sinais, periodo/tenant/logo. |
| Recorrencias | RULE-FIN-RECUR | salvar/gerar + cron/fallback -> regra/competencia -> documento/parcelas | OBS pagina; geracao NE; financial_recurring_scheduler.sql nao executado. |
| Folha/adiantamentos | RULE-FIN-PAYROLL | payroll services -> calculate/approve/post/void -> documento financeiro | OBS pagina; acoes NE. Permissoes distintas, descontos e repeticao da contabilizacao. |
| Diarias | RULE-ALLOWANCE | painel/services -> review_driver_daily_allowance -> titulo aprovado | COD; formulario condicional/fluxo NE. Valor, quantidade, modo e double-approve. |
| Mapa/sincronizar | RULE-SASCAR | mapa.handleSyncSascar -> POST -> handler -> SOAP/lock/posicoes/estado | OBS mapa; sincronizacao NE. Dois handlers, credenciais e lock por workspace. |
| IA consulta | RULE-AI-SCOPE | sendMessage -> contexto JWT/workspace -> tools/domains -> RLS/RPC -> renderer | OBS chat; TEST-AI 16 funcoes/contratos. E2E owner/tenant/modelo/limites NE. |
| IA confirmar | RULE-AI-ACTION | prepare -> token assinado -> botao -> execute action -> negocio/audit | COD+TEST contratos; escrita NE. Race de nonce, expiracao e estado do frete mudou. |
| IA voz | RULE-AI-VOICE | startLive -> mic/token/WS -> tools -> audio/estado -> cleanup | COD+TEST parcial de classificacao de erros; audio/reconexao reais NE. |
| Ajuda | RULE-SUPPORT | manual.guideGroups -> filtros/ancoras/details -> searchManualSupport -> tool IA | OBS pagina/artigos; conteudo e indice canonicos no codigo. Testar busca e referencia sem inventar recurso. |

## Como usar antes de refatorar

Escolha o grupo CTL/SUP, leia a regra e atravesse as chamadas ate a ultima definicao SQL, inclusive patches dinamicos. Execute regressao correspondente em ambiente isolado. Um teste de contrato baseado em texto de arquivo pode passar com integracao quebrada; um toast de sucesso pode ocorrer antes de terminar uma promise. Nao classificar cobertura por proximidade do nome de arquivo.

## Testes encontrados

EV-TEST-AI: `npm run test:frotak-ai`, executado em 2026-10-19 no Cliente, 16 aprovados/0 falhas. Inclui requisitos de >=50 perguntas, catalogo/dominos, owner, resposta deterministica e token fora do modelo. Nao foram enviadas perguntas a um LLM.

EV-TEST-VISUAL: `npm run test:visual`, 3 aprovados/0 falhas. Le strings/classes de componentes/estilos e contratos compartilhados. Nao e screenshot test, acessibilidade nem E2E responsivo.

`supabase/tests/*.sql`: 8 arquivos de identidade/permissoes/provisionamento/financeiro/scheduler encontrados. Contem INSERT/UPDATE de fixtures (inclusive Auth), ainda que terminem com rollback. Nao executados nesta tarefa; rollback nao autoriza teste contra producao. Build/lint globais nao foram rodados pois a entrega nao altera aplicativo; verificacao documental possui script proprio.
