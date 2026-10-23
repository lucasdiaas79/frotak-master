# Frotak IA e suporte

Este documento descreve a base do checkout 9acb059. O codigo publicado 974adae adiciona ociosidade, motivo de parada e push e muda a leitura do texto deterministico em voz; consultar obrigatoriamente [versao-publicada](../versao-publicada.md) antes de usar esta especificacao para producao.

## MOD-AI: `/frotak-ia`

OBS: tela de chat e campo Pergunte a Frotak IA renderizados. Nenhuma pergunta foi enviada, chamada de modelo foi executada ou permissao de microfone foi aceita. Leitura/TEST de codigo nao certifica voz real.

Fluxo de texto: `frotak-ia.tsx::sendMessage` -> token/workspace -> `sendFrotakAiChatMessage` -> `resolveFrotakAiContext` -> conversacao simples ou snapshot/contexto + Gemini -> tool calls permitidas -> `executeFrotakAiTool` -> Supabase com JWT e filtros -> resposta deterministica quando disponivel, senao explicacao Gemini -> texto limpo -> mensagens/pendencias na UI. Estado pending impede envio duplicado; erro mantem feedback. Historico enviado e limitado a 12 mensagens/6000 caracteres; tools ate 6 por rodada, ate 3 rodadas.

### RULE-AI-SCOPE

Tenant nao vem de argumento livre da ferramenta: e resolvido por membership autenticado. Queries especificas usam tenant/workspace; dominios genericos possuem catalogo de colunas/filtros. Financeiro da IA e exclusivo owner mesmo se membro possui financial.transactions.manage. `permissions: []` no contexto IA nao deve ser interpretado como ausencia de RBAC em todo o sistema.

Essa e a regra pretendida e aplicada aos tools financeiros explicitos. A leitura encontrou uma lacuna: `queryActiveFreights`/historico retornam freight_value/precos sem mascaramento por owner, e dominios operacionais como frota/fretes incluem freight_value sem financial=true. `domainAccess` so bloqueia dominios marcados financeiros; `presentRow` e somatorios nao removem esses campos de membro. Logo, nao certificar que a regra abrange todo valor monetario. GAP-AI-03 documenta o caminho de codigo; nenhum dado de membro real foi solicitado para reproduzir.

| Ferramentas/superficies | Responsabilidade existente | Limite/contrato |
|---|---|---|
| consultar_tenant, buscar_veiculo/implemento, consultar_motorista, buscar_parceiro/produto | Resumo e busca de cadastros, vinculacao/status | Dados podem ser limitados/paginados; resultado parcial nao e total certificado. |
| consultar_posicao, listar_fretes_ativos, consultar_frete | Posicoes atuais/historicas e operacao | Informar data da posicao e distinguir ciclo/frete/status. |
| consultar_abastecimentos | Listagem/totais de diesel/ARLA e periodo | Valores criticos renderizados pelo servidor, nao calculados pelo modelo. |
| consultar_financeiro, consultar_dre, consultar_rentabilidade | RPCs e dados financeiros do workspace | Owner-only; nao mascarar acesso negado como zero. |
| consultar, resumir, buscar | Leitura generica de dominios declarados em frotakAiDomains | Nao e SQL livre; validar filtros/colunas/domino e owner nos dominios financeiros. |
| alertas | Pendencias operacionais/proatividade | Nao garante push, agendamento nem vigilancia continua fora da sessao. |
| consultar_suporte | Pesquisa no manual canonico `manual.tsx::searchManualSupport` | Nao e treinamento automatico nem garantia de que o manual corresponde a todos os fluxos atuais. |
| pesquisar_web | Gemini Google Search separado | Informacoes externas/atuais com fontes; nao usar para fatos privados do tenant. |
| lancar_despesa_frete, atualizar_situacao_veiculo, registrar_ocorrencia | Prepara resumo e token para confirmacao | Preparacao nao grava; execucao confirmada possui efeitos reais. |

Catalogo exato: `frotakAiToolCatalog.ts`; schemas Google FunctionDeclaration: `frotakAiTools.ts`; mapeamento generico: `frotakAiDomains.ts`; renderizadores: `frotakAiDeterministic.ts`. Regex/intent auxilia roteamento, mas nao substitui calculo do backend. Snapshot inicial limita veiculos e pode ficar antigo; instrucoes mandam consultar ferramenta para numeros/status.

### FLOW-AI-ACTION

Pedido -> preparar acao -> owner/veiculo/categoria/valor/situacao validos -> token HMAC com user/workspace/tenant/nonce/expiracao -> resumo/botoes Confirmar/Cancelar na tela -> confirmFrotakAiAction -> revalidacao do contexto/token/estado atual -> escrita + auditoria -> resposta. Token nao e repassado ao modelo.

Despesa exige frete ativo, categoria permitida e valor >0 ate 100000; grava company_payable. Mudanca de situacao e bloqueada com frete ativo. Ocorrencia exige descricao minima. Checagem de nonce em audit_logs reduz repeticao, mas consulta seguida de escrita/auditoria nao prova exclusao mutua sob concorrencia; GAP-AI-01.

### MOD-AI-VOICE

Botao de voz -> `startLive` -> getUserMedia -> token efemero -> `FrotakLiveSession` WebSocket -> PCM entrada 16k/saida 24k -> transcricao/tool call/resposta -> audio/renderizacao. Emissao de token valida contexto antes de Gemini, usa 1 nova sessao, janela de abertura 60 s e validade 30 min. Nomes de modelo/voz podem ser sobrescritos por ambiente; disponibilidade no provedor NE.

Estados: idle, connecting, reconnecting, ready, muted, listening, thinking, speaking, interrupted, error e closed conforme tipos. UI suaviza transicoes para esfera. Pausar mic, encerrar e sair limpam stream/socket/audio; interrupcao evita continuar falando trecho anterior. Timeouts de UI: mic/token 20 s, conexao 30 s. Live tenta reconectar ate 3 vezes com atraso limitado; grounding segura audio factual ate tool e distingue erro tecnico de erro de negocio. Nao afirmar que tudo isso funciona no aparelho sem teste de audio real.

`components/frotak/FrotakOrb.tsx` representa estado e animacao; alteracao de cor e independente do backend. `frotakVoice.ts` tambem oferece reconhecimento/sintese do browser em portugues; ter helper nao prova que todas as telas o usam.

Teste executado EV-TEST-AI: 16 casos, funcoes e contratos estaticos; corpus de perguntas em `scripts/frotak-ai-v2-cases.ts`. O teste verifica grounding/catalogo/owner/renderizadores, nao envia as perguntas ao Gemini. Cobertura E2E de audio, latencia, tenant e idempotencia continua NE.

## MOD-SUPPORT: `/manual`

Fonte canonica de artigos: `src/routes/manual.tsx::guideGroups`. Nao copiar os 135 artigos para outra fonte editavel. Tema, busca normalizada e topicos operacao/motorista/financeiro/cadastros/suporte filtram titulos/detalhes/grupos. Indice usa ancoras; artigos usam `<details>/<summary>`, com passos e checks do grupo. Guia sem resultado tem estado vazio. Shell e responsividade compartilham UI-01/04.

`searchManualSupport(query, requestedLimit)` pontua tokens/stopwords e retorna trechos e referencias para IA. Conteudo deve ser mantido alinhado a implementacao; descricao de recuperacao de senha no artigo nao comprova formulario nessa rota do Cliente. Nesta auditoria a navegacao dos artigos e registrada separadamente de corretude de cada instrucao.
