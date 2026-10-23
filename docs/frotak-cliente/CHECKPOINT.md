# Checkpoint da engenharia reversa

Data: 2026-10-19, America/Sao_Paulo. Escopo: documentacao do FrotaK Cliente; nenhum item de negocio foi corrigido. Esta entrega e um levantamento amplo com limites explicitos, nao uma certificacao de completude funcional.

## Identidade e seguranca

| Item | Estado confirmado |
|---|---|
| Pasta/produto | `D:/dev/frota-master/central-dias-main`, Cliente; Master permanece na raiz |
| Git local | `main`, `9acb0592f57db6299594035b1a17e4c0160a67af` |
| Versao publicada consultada | Vercel `central-dias`, Ready, main, `974adae7cde3b1d02eec09fb7abf2b065df3a153`, publicado em 2026-10-15; 17 arquivos diferem no escopo Cliente/Supabase |
| Navegacao | Sessao existente Chrome Lucas, tenant visual JO; sem troca de perfil nem prova independente de todas as permissoes do usuario |
| Runtime local | Nenhum iniciado. Portas 5173/5174/4180 sem listener na checagem inicial; destino efetivamente carregado por um futuro runtime nao comprovado |
| Banco consultado | Projeto Frotak vinculado, apenas catalogos/metadados; nao houve leitura de linhas Auth ou negocios via SQL |
| Escritas desta tarefa | Apenas `docs/frotak-cliente/`; itens nao rastreados preexistentes preservados |
| Operacoes excluidas | Sem alteracao de app, auth, permissoes, dados reais, infraestrutura ou integracoes; sem commit/push/deploy/migration |

Fetch apenas do objeto Git publicado permitiu compara-lo sem mudar branch/checkout. Valores de configuracao, tokens e dados pessoais nao foram incluidos no pacote. A vinculacao do Supabase CLI nao comprova sozinha o destino de todos os deploys; localhost nao implica banco de testes.

## Concluido

1. Recuperacao de contratos/skills/contexto, separacao Cliente/Master e leitura dirigida dos modulos.
2. Documentacao de arquitetura, dados/permissoes, integracoes/jobs, telas/variantes, regras/calculos, fluxos e contratos de regressao.
3. Inventarios separados para checkout e revisao publicada, com IDs e matriz CTL -> grupo -> regra/codigo/dados candidatos; regras principais revisadas semanticamente em prosa.
4. Navegacao real de leitura, formularios abertos sem envio, suporte expandido e verificacao mobile limitada.
5. Comparacao com metadados do banco vinculado e revisao das mudancas de IA/voz/push posteriores ao checkout.
6. Execucao das suites locais de IA e contrato visual; verificacao mecanica da documentacao e roteiro de retomada/reconstrucao.

## Cobertura e denominadores

| Medida | Checkout 9acb059 | Publicado 974adae |
|---|---:|---:|
| Fontes TS/TSX inventariadas | 154 | 159 |
| Declaracoes de rotas | 33 | 34 |
| Declaracoes de controles | 1.047 | 1.048 |
| Declaracoes de superficies | 70 | 70 |
| Chamadas diretas a dados | 263 | 285 |
| Efeitos automaticos inventariados | 67 | 68 |
| Declaracoes de tipos | 292 | 302 |
| Migrations raiz lidas | 70 | 71 |

Navegacao: 27 URLs tentadas/observadas, incluindo aliases, redirecionamentos e login nao autenticado; correspondem a 28 declaracoes porque o financeiro tem parent/index compartilhados. Isso nao significa 28 telas independentes completamente testadas. Houve 21 verificacoes adicionais de superficies/variantes/estados, correspondentes a 14 templates SUP unicos. Dos 70 SUP, 29 sao wrappers e 27 permanecem apenas codigo. Detalhes por ID em [navegacao](evidencias/navegacao.md) e nos inventarios de cobertura.

Suporte: 135 artigos expandidos, busca sem resultado observada e shell em 390x844 sem overflow horizontal naquela verificacao. Nao estender esse resultado a todas as paginas ou dispositivos.

Banco remoto, escopo consultado: 64 tabelas publicas com RLS, 4 views, 971 colunas, 93 policies public/storage, 87 triggers de usuario, 180 funcoes public/private, 543 constraints, 19 entradas em publications e 4 jobs ativos. RLS habilitada nao comprova isolamento correto; inventario historico nao substitui schema efetivo nem backup.

## Verificacoes executadas

- `test:frotak-ai`: 16 aprovados, zero falhas, somente checkout local; sem chamada a Gemini ou consulta de negocio real.
- `test:visual`: 3 aprovados, zero falhas; contrato de codigo/classes, nao screenshots.
- 84 perguntas/cenarios encontrados em fixtures; nao foram 84 perguntas executadas contra a IA real.
- `tools/verify.mjs`: resultado detalhado em [validacao-documental.json](evidencias/validacao-documental.json); confere JSON, IDs, referencias, links e alguns padroes de segredo. Nao garante semantica ou ausencia de todo dado sensivel.

Build/lint do aplicativo e oito suites SQL com escrita de fixtures nao executados. Nao houve revisao independente por outro executor.

## Pendencias e exclusoes

| Limite | Motivo e continuacao |
|---|---|
| Quatro rotas de titulos, incluindo aliases | Effect de montagem pode gerar recorrencias reais; nao abertas. Exigem banco isolado e autorizacao de escrita. |
| Uma API no checkout, duas no deploy | Endpoints mutaveis nao chamados; rastreio realizado no codigo. |
| Continuacao da navegacao | Ferramenta passou a informar uso local do navegador desabilitado no Work; restricao respeitada. |
| Cada controle em todos os estados/perfis | Inventario AST nao valida semantica individual nem todos os controles gerados dinamicamente; completar por handler/variante. |
| Dados financeiros, RLS e concorrencia | Falta reconciliacao numerica real e testes negativos owner/tenant/multiworkspace em fixtures isoladas. |
| Voz, push, anexos, sincronizacoes e acoes IA | Sem microfone, permissao push, upload/download, comandos ao rastreador, notificacoes ou escritas de negocio. |
| Master e app motorista externos | Contratos documentados; frontends/versoes externas nao foram auditados integralmente. |
| Schema/deploy atualizados | Captura pontual em 2026-10-19; mudancas posteriores exigem nova evidencia. |

## Achados para priorizar, sem correcao nesta tarefa

1. GAP-AI-03: valores financeiros presentes em caminhos de consulta operacionais sem bloqueio explicito por campo para nao-owner; requer teste negativo e correcao em tarefa autorizada.
2. GAP-AUTH-01/02 e GAP-FIN-WORKSPACE: fallback local de sessao e selecao/escopo multiworkspace precisam de provas negativas. Nao foi comprovado incidente de acesso indevido.
3. GAP-SCHEMA-01: tabela/migration/job de push da revisao publicada ausentes no projeto vinculado consultado; confirmar configuracao efetiva antes de qualquer implantacao.
4. GAP-BULK-01/UI-01/CUSTOMER-01: sequencias nao atomicas, sucesso sem aguardar e exclusao de papeis ao salvar cliente precisam de regressao antes de refatorar.

Lista completa e impacto em [impacto-lacunas](impacto-lacunas.md). Proxima acao documental: retomar variantes ainda COD/NE quando o navegador estiver disponivel. Proxima acao de validacao: preparar ambiente isolado comprovado, sem copiar dados reais, e executar a matriz de regressao com autorizacao para escrita. Nao usar este checkpoint para alegar sistema reconstruivel integralmente, livre de falhas ou sem risco de regressao.
