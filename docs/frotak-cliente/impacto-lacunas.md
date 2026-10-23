# Impacto, divergencias e lacunas

Nenhum item abaixo foi corrigido. COD e leitura do checkout, exceto onde a revisao publicada e explicitada; OBS e sessao remota no deploy 974adae, diferente do checkout 9acb059. Risco nao equivale a incidente comprovado.

## Mapa de impacto para refatoracao

| Area candidata | Consumidores e contratos que precisam sobreviver | Antes de remover/alterar |
|---|---|---|
| `types`, `mappers`, services | Rotas, store, IA, snapshots, financeiro e app externo via schema | Preservar IDs, nomes de campos, aliases e enum/status; conferir consumers externos. |
| Store/cache/Realtime | Todas as telas operacionais, mapa e pendencias | Preservar escopo tenant, invalidacao, respostas fora de ordem, foco/reconexao e cleanup. |
| Workflow/kanban/RPC | Cards, manual move, app motorista, eventos, historico e integracao financeira | Testar versao concorrente, documentos, retorno e proximo trecho; nao apenas screenshot. |
| `FinancialModule.tsx` | Multiplas rotas, modais e services compartilhados | Extrair por fronteira sem mudar contratos de acesso, datasource e efeitos automaticos. |
| Operacional -> financeiro | Triggers, jobs, parceiros e apropriacoes | Reprocessamento idempotente, valor/competencia/pagador/tributo e saldo de caixa. |
| IA/tools/domains/renderers | Chat e Live, suporte, financeiro e acoes | Tenant/owner no servidor, erro de negocio x tecnico, resposta exata e confirmacao. |
| SSO e servidores Sascar | Master, cron, browser e integradores | Confirmar consumidores, roteamento publicado, autenticacao e caminho legado. |
| Rotas antigas/componentes sem import direto | Deep links, convencoes TanStack/Nitro, scripts, externos | Inventario estatico e apenas uma pista. Nao remover automaticamente. |
| Migrations antigas/scripts/Edge functions | Ambientes antigos, processos manuais e jobs fora do checkout | Confirmar deploy e consumidores. Nao executar para descobrir uso. |

## Lacunas e riscos rastreaveis

| ID | Achado/limite | Evidencia e proxima verificacao |
|---|---|---|
| GAP-ENV-01 | Nao havia runtime local ativo; arquivos alternativos de ambiente nao comprovam destino carregado | EV-ENV; nao iniciar teste mutavel sem destino isolado comprovado. |
| GAP-DEPLOY-01 | Divergencia confirmada: deploy 974adae x checkout 9acb059 | EV-REMOTE-01 e versao-publicada.md; objetos Git lidos sem mudar checkout. Testes locais nao certificam revisao publicada. |
| GAP-SCHEMA-01 | Catalogo remoto obtido; equivalencia funcional e aplicacao do push ainda pendentes | EV-SCHEMA-01 inclui tabelas/colunas/constraints/policies/triggers/funcoes/publications e jobs. Push ausente no banco vinculado; historico tem nomes/versoes diferentes em algumas migrations. |
| GAP-AUTH-01 | SSO pode manter sessao local apos falha de setSession; getCurrentUser tambem tem fallback local | `auth.ts::acceptMasterSsoFromUrl/getCurrentUser`. Testar token invalido/forjado/membership em ambiente isolado e avaliar fronteira UI/backend. Nao declarar acesso indevido ao banco comprovado. |
| GAP-AUTH-02 | Leitura operacional em varios services depende de RLS sem filtro explicito do tenant selecionado | `services/vehicles.ts::listVehicles`, `private.can_access_tenant`. Testar usuario com memberships em tenants diferentes, sem alterar usuarios reais. |
| GAP-INT-01 | Start e Nitro declaram POST `/api/sascar/sync` com verificacoes diferentes; caminho sem workspace existe no worker | `src/routes/api/sascar/sync.tsx`, `server/api/sascar/sync.post.ts`, `server/lib/sascar-sync.ts`. Inspecionar roteamento do build antes de remover ou unificar. Nao acionar endpoint para descobrir. |
| GAP-UI-01 | Sucesso/fechamento antes de await em alguns cadastros | carretas.onSave, veiculos.onDelete, motoristas.onLink. Testar erros atrasados/duplo clique; nao presumir que mensagem indica persistencia. |
| GAP-BULK-01 | Frete em grupo e liquidacao em lote iteram varias transacoes | gestao.createGroupFreight e FinancialModule bulk onSave. Definir comportamento de falha parcial e recuperacao antes de refatorar. |
| GAP-AI-01 | Acao IA verifica nonce por consulta a audit_logs e grava depois; auditoria pode falhar separadamente | `frotakAiActions.ts::alreadyExecuted/audit/executeFrotakAiAction`. Concorrencia/replay requer teste isolado; nao ha garantia transacional de exactly-once comprovada. |
| GAP-AI-02 | Snapshot/limites de queries e historico nao significam acesso a absolutamente todos os dados | `frotakAiTools`, `Domains`, `frotakAi.ts`. Conferir paginacao, truncamento, dados sensiveis e respostas criticas ponta a ponta. |
| GAP-AI-03 | Restricao owner-only nao cobre explicitamente todos os valores em ferramentas operacionais | `frotakAiDomains.ts:43/92/123/877` e `frotakAiTools.ts::queryActiveFreights/queryFreights`: freight_value e precos podem compor resultados/somatorios em dominio sem financial=true. COD, nao explorado com usuario real. Exigir teste negativo por campo, nao so por nome de tool/dominio. |
| GAP-FIN-WORKSPACE | RPC de acesso financeiro escolhe membership no servidor sem receber workspace ativo do browser | `get_financial_access` seleciona por owner/ordem; phase2 cache usa workspace salvo mas isso nao comprova alinhamento do workspace retornado. Testar usuario multiworkspace e navegacao de contexto em ambiente isolado. |
| GAP-NAV-01 | Quatro rotas de titulos nao abertas por effect mutavel de recorrencias | FinancialModule.tsx:2568; validar em banco isolado com escrita autorizada. Alias usa mesmo componente. |
| GAP-NAV-02 | Estados/acoes dependentes de registro, perfil alternativo, anexos e configuracao nao integralmente percorridos | Inventario SUP e checkpoint discriminam observado/COD/NE. Nao criar dados reais para satisfazer cobertura. |
| GAP-DOC-01 | README/DOCUMENTACAO_TECNICA/fase 1 tem descricoes anteriores a SSO/multi-tenant/automacoes | Manter como historico e usar esta auditoria com evidencia atual; revisao editorial posterior sem apagar decisoes antigas. |
| GAP-TEST-01 | 19 testes nao equivalem a testes de banco, E2E, audio ou numeros reais | EV-TEST; suites SQL nao executadas. Montar fixture isolada e matriz de regressao por fluxo. |
| GAP-RESP-01 | Classes responsivas existem; nem todos os breakpoints/dispositivos foram exercitados | UI-04 e evidencias; validar shell/tabelas/modais por teclado/toque sem extrapolar screenshot de desktop. |
| GAP-EXTERNAL-01 | App motorista, Master publicado, terceiros e jobs externos nao integralmente acessados neste escopo | Contratos existentes confirmados; identidade/versao/ativacao externa exigem evidencias proprias. |
| GAP-CONTROLS-01 | Extracao AST cobre declaracoes, nao semantica individual completa nem todos os controles gerados por runtime | Matriz e grupos possuem referencias candidatas. Completar revisao manual por handler e variantes antes de usar como especificacao exaustiva de reconstrucao. |
| GAP-BROWSER-01 | Continuacao de navegacao bloqueada porque uso local do navegador foi desabilitado no Work | EV-SUP-17 foi ultima superficie aberta; detalhes de registros/anexos e demais variantes permanecem COD/NE. Restricao respeitada; nao contornada. |
| GAP-CUSTOMER-01 | Desmarcar papel no cadastro unificado executa exclusao de sender/recipient | CustomersPage.save; operacao pode falhar por referencias ou ficar parcial. Nao tratar checkbox como apenas ocultar papel. |

## O que esta implementado e o que nao foi demonstrado

Implementado no checkout: operacao/cadastros, SSO, schema multi-tenant, financeiro/relatorios/lotes, contratos do app, tools IA/Live, suporte, workers/cron versionados. Planejado/inferido, nao demonstrado aqui: consolidacao futura em VPS/banco por cliente, migracao de frontend para centralnovo, IA onisciente, disponibilidade continua de modelos e autonomia permanente de agentes.

Nao foi encontrado fundamento para declarar arquivo morto apenas por falta de import. Rotas por convencao, strings de RPC, imports dinamicos, server functions compiladas, triggers e app externo sao consumidores reais ou potenciais a conferir. O inventario de imports deve orientar busca, nao automatizar exclusao.
