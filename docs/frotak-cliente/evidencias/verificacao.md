# Registro de verificacao

## EV-GIT-01

Pasta `D:/dev/frota-master/central-dias-main`, dentro do Git `D:/dev/frota-master`; main, HEAD `9acb0592f57db6299594035b1a17e4c0160a67af`. Sem alteracoes rastreadas antes da tarefa; docs/ e outros itens nao rastreados ja existiam. Somente `docs/frotak-cliente/` foi escrito nesta tarefa. Fetch do objeto publicado nao mudou branch nem checkout. Nao houve commit, push, deploy, migration ou correcao de codigo.

## EV-ENV-01

Sem listener encontrado nas portas 5173/5174/4180 na checagem inicial. Nomes dos arquivos/variaveis foram inspecionados sem imprimir valores. `.env.local` nao declara URL/key publicas Supabase; `.env.runtime.local` e `.env.vercel.local` sao arquivos alternativos e nao comprovam carregamento pelo Vite default. Nenhum runtime local foi iniciado. Link do Supabase aponta para projeto Frotak, remoto, e portanto nao e garantia de isolamento para testes.

## EV-TEST-AI / EV-TEST-VISUAL

Executados em 2026-10-19 no commit local 9acb059, com codigo previamente lido:

| Comando | Resultado | Alcance |
|---|---|---|
| `npm run test:frotak-ai` | 16 passaram, 0 falharam | Funcoes isoladas, fixtures e contratos de codigo. Nao chama Gemini nem valida banco real. |
| `npm run test:visual` | 3 passaram, 0 falharam | Strings/classes/contratos visuais compartilhados. Nao e teste por screenshot. |

Corpus de perguntas e declaracoes de cenarios nao representam execucoes reais dessas perguntas. Testes SQL com fixtures nao executados. Build/lint do aplicativo nao executados nesta tarefa documental. A revisao publicada tem alteracoes de IA/voz/push posteriores: estes resultados nao sao certificacao desse deploy.

## EV-SCHEMA-01 / EV-REMOTE-01

Supabase MCP: somente SELECT de catalogos, assinaturas, hashes, policies/constraints, publication e nomes/agendas de cron. Arquivos `schema-remoto-metadados.json` e `ambiente-remoto.json` sao evidencias sem linhas de negocio/Auth, comandos de cron com segredos ou configuracoes secretas.

Resultados do projeto Frotak vinculado: 64 tabelas publicas com RLS habilitada, quatro views com security_invoker=true, 971 colunas de tabelas/views publicas, 93 policies public/storage, 87 triggers de usuario, 180 funcoes public/private, 543 constraints, 19 entradas de tabelas em publications e quatro jobs ativos. Os counts descrevem o escopo consultado, nao todo schema interno do Supabase.

Verificacoes pontuais nas definicoes efetivas: contexto do motorista contem `trip_cash`, `returnToYard` e `startOdometer`; fechamento do ciclo contem filtro trip_cash; complete_return aceita odometro e tem validacao de ordem; RPC de baixa com batch e detalhes do lote existem. Marcadores de texto nao sao testes de comportamento.

Migration de push do commit publicado nao aparece no historico consultado; tabela `frotak_push_subscriptions` e job `frotak-push-veiculos-parados` tambem nao aparecem nesse projeto. Isso demonstra ausencia nesse banco consultado, nao identifica sozinho o destino de todos os deployments.

Vercel MCP retornou 403 de escopo; fallback CLI autenticado consultou somente o deployment identificado. Dominio atual resolve deployment Ready de 2026-10-15, main, SHA `974adae7cde3b1d02eec09fb7abf2b065df3a153`. Foram buscados objetos desse commit para leitura; diferencas e inventario separados em versao-publicada.md.

## EV-DOC-CHECK

Verificacao mecanica de JSON, links, IDs e cobertura por rota e executada por `../tools/verify.mjs`. Seu resultado e salvo em `validacao-documental.json`. Ela certifica consistencia do pacote documental dentro das checagens descritas, nao correcao funcional do sistema.
