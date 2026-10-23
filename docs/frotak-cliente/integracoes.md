# Integracoes e fluxos externos

Status: COD. Nao foram acionadas sincronizacoes, modelos de IA, webhooks, uploads ou jobs. Configuracao em codigo nao comprova ativacao em producao.

EV-REMOTE-01 confirmou quatro crons ativos no projeto vinculado: Sascar a cada minuto, reconciliacao financeira a cada cinco minutos, recorrencias as 03:15 UTC e retencao de posicoes no minuto 7 de cada hora. Nao foram lidos comandos com configuracao secreta nem historico de execucao. O commit publicado tambem possui endpoint/feature de push ausente no checkout; objetos de banco correspondentes nao encontrados nesse projeto. Contrato detalhado em versao-publicada.md.

| ID | Origem -> destino e gatilho | Autenticacao/contrato | Falha, retry, idempotencia e efeito |
|---|---|---|---|
| INT-SSO | Master -> Cliente, acesso pelo login | Query/hash SSO, tentativa de `setSession`, membership em `getProfile` | Falha pode manter sessao local; ver GAP-AUTH-01. Limpa parametros da URL. Implementado, nao reautenticado aqui. |
| INT-DB | Cliente -> Supabase, carga e comandos | Anon key publica + JWT, RLS/RPC; admin exclusivo servidor | Services propagam erros; UI trata com toast/estado. Nem todo toast espera persistencia. |
| INT-RT | Postgres -> browser, alteracoes | Canais filtrados por tenant ou workspace, policies SELECT e publication | Reconciliacao por tempo/foco/reconexao. Sem garantia de entrega exatamente uma vez. Publicacao atual remota NE. |
| INT-DRIVER | Motorista externo -> RPC/Storage -> Cliente | JWT do motorista, `drivers.auth_user_id`, helpers de motorista | Avanco, retorno, odometro, abastecimento, despesas e diarias refletem no banco. Frontend externo atual BLQ por escopo/acesso. |
| INT-DOC | Gestao/historico -> Storage e `freight_documents` | JWT/RLS; paths tenant/frete; URLs assinadas 1 h no service | Upload e insert separados; falha tenta remover arquivo. Lista filtra referencias; download pode falhar/expirar. |
| INT-FUEL | App -> `fuel_documents/files/records` e `freight_expenses` | RPC autentica motorista/veiculo/frete; valores pareados diesel/ARLA, odometro positivo | Cada produto tem item proprio; vinculo ao ciclo/frete. Integra financeiro; combustivel nao sai do caixa motorista. |
| INT-SASCAR | Mapa/cron -> `/api/sascar/sync` -> SOAP -> DB | Rota Start valida bearer/membership para workspace; cron token separado; secrets por workspace/servidor | Lock, packetId incremental, faixa de recuperacao, descarte de posicoes antigas, retencao. Dois handlers para mesmo caminho precisam confirmar roteamento efetivo. |
| INT-AI | Chat/voz -> server functions -> Gemini e tools -> DB | JWT + membership + tenant derivado; financeiro owner-only; token efemero Live | Fallback de modelos, limite de rodadas/tools e respostas deterministicas. Nao confundir teste unitario com conversa real. |
| INT-WEB | Ferramenta IA -> pesquisa externa | Configuracao de provider no servidor em `frotakAiWebSearch.ts` | Conteudo externo exige tratamento distinto de fatos do tenant; schemas/fallbacks no modulo IA. Nenhuma pesquisa acionada. |
| INT-GEO | Cliente -> Google/OSM/Google Maps/ViaCEP | Google key no servidor, endpoints publicos para alternativas | Queries deduplicadas; fallback OSM; CEP falha silenciosa; resolucao de URL segue redirects. Nao acionar com dados reais nesta auditoria. |
| INT-FIN | Triggers operacionais -> jobs -> documentos/parcelas/rateios/razao | Funcoes privadas com contexto tenant/workspace e vinculos | Chave de origem evita duplicacao; jobs possuem attempts/max_attempts/next_retry_at. Recorrencias e conciliacao externa abaixo. |

## FLOW-SASCAR: pipeline

`mapa.tsx::handleSyncSascar` -> `integrations/sascar.ts::syncSascarPositions` -> POST com workspace/quantidade/forceFull -> `src/routes/api/sascar/sync.tsx` -> `server/lib/sascar-sync.ts::runSascarSync` -> resolve workspace/integracao/secret_ref -> lock por workspace -> SOAP frota/pacotes/recuperacao/historico -> upsert posicoes/veiculos/estado -> release lock no finally -> estatisticas -> toast e refresh da frota.

Defaults no servidor: lote 3000, backfill inicial 8 paginas, recuperacao maxima padrao 2 paginas, concorrencia de historico 10, ponto stale em 15 min e lookback 3 h, configuraveis por nomes de ambiente. Consulta sem workspace possui caminho legado global; nao inferir que esta seguro para qualquer consumidor. `server/api/sascar/sync.post.ts` tambem declara a mesma URL pelo Nitro, com verificacao diferente (token/same-origin); GAP-INT-01 exige descobrir qual handler vence no artefato publicado.

## FLOW-JOBS: automacoes sem tela

| ID | Entrada | Processamento | Contrato a preservar |
|---|---|---|---|
| JOB-SASCAR | `invoke_sascar_sync_cron`, migration `20260928095010*` | Despacha sincronizacao por workspaces configurados via pg_net | Credenciais nao se misturam; lock por workspace; nao consultar dispositivos para testar documentacao. |
| JOB-FIN-INT | Alteracoes de frete/combustivel/despesa e triggers de integracao | `financial_integration_jobs` -> `private.process_financial_integration_job` -> titulos contabilizados conforme settings | Receita/ICMS/despesas reconhecidos por origem; `source_type/source_id/source_event`; erro nao deve virar valor zero certificado. |
| JOB-FIN-RECON | `20260928154946*` agenda reconciliacao | `private.run_financial_integration_reconciliation` processa jobs vencidos, health conta retry/exhausted/review | Reprocessamento deve ser idempotente, respeitar max_attempts e registrar erro. |
| JOB-RECUR | `run_financial_recurring_cron` diariamente, fonte `202609240001*` | Varre workspaces com regras ativas -> generate_due -> titulo por competencia | Fonte canonica: `central-dias-main/docs/FINANCIAL_RECURRING_SCHEDULER.md`. Fallback ao abrir titulos e mutavel. |
| JOB-MIRROR | Triggers sobre operacao/historico/parceiros | Espelha frete canonico, parceiros e eventos de auditoria | Nao substituir identidade UUID nem gerar segunda receita em espelhamento. |
| JOB-DRIVER | RPC de conclusao/retorno/solicitacao no app | Ativa proximo trecho, fecha ciclo, registra odometro e pedidos de diarias | Retorno sem `current_freight_id` ainda pode ter ciclo aberto e botao Cheguei no patio. |

Nao foram encontradas rotas de webhook de entrada dedicadas no inventario do Cliente; server functions e crons sao entradas externas concretas. Isso nao exclui consumidores/deploys fora deste checkout. Functions antigas `central-dias-main/supabase/functions/*` e scripts de importacao sao candidatos historicos, nao codigo descartavel comprovado.

## Contratos de schema e erros

Para payloads exatos, consultar `inventarios/tipos.json`, `rpc-sql-rastreio.json`, `ambiente-referencias.json` e os arquivos apontados. Nomes de variaveis sao documentados; valores nunca. Nao ha garantia de retry uniforme: SOAP possui controles proprios; upload/CRUD geralmente retorna erro ao usuario; jobs financeiros fazem retry no banco; Live possui reconexao. Idempotencia de documento financeiro nao torna um lote inteiro atomico.
