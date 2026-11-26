# Frotak — Matriz AS-IS × TO-BE

Data: 2026-09-17

Fontes principais:
- `forge/FROTAK_TO_BE_VISION.md` — visão desejada de produto.
- `forge/knowledge/FROTAK_AS_IS_2026-09-17.md` — snapshot técnico do código/migrations analisados.
- Documento-fonte: `DOCUMENTACAO_LOGICAS_FROTAK_MASTER_E_MOTORISTA.docx`.

## Legenda

- `ALREADY_IMPLEMENTED`: já existe de forma compatível com a visão desejada.
- `PARTIALLY_IMPLEMENTED`: existe, mas está incompleto, fragmentado ou depende de correção.
- `IMPLEMENTED_DIFFERENTLY`: existe, mas a regra atual é diferente da visão de produto.
- `BROKEN`: existe código/fluxo, mas há falha de segurança, consistência ou confiabilidade suficiente para impedir que seja tratado como pronto.
- `MISSING`: não há implementação verificável da regra desejada no material analisado.

Prioridade:
- `P0`: bloquear risco grave / corrigir antes de ampliar uso.
- `P1`: necessário para a missão de integração ponta a ponta.
- `P2`: importante para robustez, UX ou escala, mas não bloqueia o núcleo.

## Resumo executivo

A Frotak **não está começando do zero**. O núcleo operacional e financeiro já é expressivo. O maior problema atual é a existência de **caminhos paralelos e fronteiras inconsistentes**: autenticação do motorista, handoff Master→Central, workflow manual, gravação via service role, duas estratégias Sascar, status legado + stage canônico e financeiro parcialmente desacoplado do momento em que o fato nasce.

Contagem desta primeira leitura:
- `ALREADY_IMPLEMENTED`: 6
- `PARTIALLY_IMPLEMENTED`: 11
- `IMPLEMENTED_DIFFERENTLY`: 3
- `BROKEN`: 6
- `MISSING`: 4

## Matriz

| # | Domínio / regra | TO-BE | AS-IS verificado | Classificação | Prioridade | Gap / direção |
|---|---|---|---|---|---|---|
| 1 | Login de plataforma | Login real, resolve identidade/tenant/workspace e entra no ambiente correto | Master usa Supabase `signInWithPassword`, `platform_users` e memberships | PARTIALLY_IMPLEMENTED | P0 | O login base é real, mas o handoff seguinte compromete a confiança do fluxo completo |
| 2 | Handoff Master → Central | Troca segura de contexto/sessão | Tokens em URL hash; Central pode criar sessão local mesmo com `setSession` falhando; impersonação Base64 sem assinatura | BROKEN | P0 | Trocar por código único, curto, assinado/validado no backend e consumido uma vez |
| 3 | Dashboard | Entrar no dashboard certo e com dados reais | Central tem dados operacionais/financeiros reais; parte do Master ainda usa mock/zero | PARTIALLY_IMPLEMENTED | P2 | Remover/rotular mocks e garantir contexto de tenant/workspace |
| 4 | Autenticação do motorista | Sessão segura de motorista ligada à identidade real | App atual usa telefone + código fixo `1234`, guarda telefone localmente e server functions usam service role | BROKEN | P0 | Migrar para Auth/token assinado, `driver_auth_user_id`, rate limit e auditoria |
| 5 | Multi-tenancy / RLS | Isolamento rígido por tenant/workspace | Base multi-tenant forte, roles/permissões/RLS existem, mas há policies amplas e contexto implícito em alguns pontos | PARTIALLY_IMPLEMENTED | P0 | Revisar policies críticas, contexto de workspace explícito e caminhos service role |
| 6 | Kanban em tempo real | Card avança automaticamente conforme ação do motorista | Stage canônico, status, Realtime e polling existem | PARTIALLY_IMPLEMENTED | P1 | Consolidar uma única máquina de estados e fechar concorrência/manual move |
| 7 | Progressão operacional do motorista | Pátio → carregar → nota → CT-e → entrega → descarga → comando | Fluxo observado bate amplamente com essa sequência | ALREADY_IMPLEMENTED | P1 | Preservar como fluxo canônico e remover atalhos divergentes |
| 8 | Movimento manual do Kanban | Movimento controlado, versionado e auditável | Cliente chama `manual_move_freight_card`, mas a definição SQL não aparece nas migrations analisadas | MISSING | P1 | Versionar RPC e seus testes; não depender de SQL invisível ao repositório |
| 9 | Concorrência de workflow | Evitar dois atores avançarem o mesmo frete de forma conflitante | `workflow_version` é lido, mas o caminho motorista observado não incrementa a versão | BROKEN | P1 | Incremento atômico na mesma transação + teste de conflito |
| 10 | Nota / CT-e / MDFe | Expedição aprova nota; motorista só segue com documento válido | Upload, conferência, CT-e/MDFe e confirmação existem; há atalhos como manifesto externo e divergência de comprovante na finalização | PARTIALLY_IMPLEMENTED | P1 | Formalizar requisitos documentais por transição e remover atalhos inseguros |
| 11 | Pós-descarga | Descarga não libera veículo; expedição manda retornar ou cria novo frete | `RETORNO_SOLICITADO` e `PRONTO_NOVO_FRETE` existem; estado aguarda comando | ALREADY_IMPLEMENTED | P1 | Tornar esse caminho a única saída oficial da entrega concluída |
| 12 | Criação do frete | Veículo, motorista, origem, destino, produto, valor, cobrança, CIF/FOB e prazo | `link_vehicle_operation` e fluxo financeiro aceitam esses dados | ALREADY_IMPLEMENTED | P1 | Manter e evoluir sem duplicar modelo |
| 13 | CIF / FOB / pagador | CIF=remetente; FOB=destinatário; pagador alimenta financeiro | `resolve_freight_billing_partner` e links de parceiro tratam a regra, com `needs review` quando não mapeado | ALREADY_IMPLEMENTED | P1 | Validar mapeamentos e UX para resolver `needs review` |
| 14 | Frete por tonelada | Peso final × valor/tonelada = receita econômica definitiva | Não há evidência verificável no levantamento de modelo de cobrança por tonelada, peso final e recálculo automático | MISSING | P1 | Criar modelo, evento de pesagem, cálculo, auditoria e ajuste financeiro idempotente |
| 15 | Frete → financeiro | Condição comercial nasce na operação e vira previsão/recebível sem retrabalho | Frete `completed` gera job e pode criar recebível; não há evidência de previsão financeira já no nascimento do frete | PARTIALLY_IMPLEMENTED | P1 | Separar previsão comercial de título definitivo; concluir/ajustar na finalização |
| 16 | Conta de viagem do motorista | Adiantamentos, despesas, combustível, saldo e prestação de contas da viagem | Existem combustível e `freight_expenses`; adiantamento encontrado é de folha, não um razão de viagem completo | MISSING | P1 | Criar razão da viagem e reconciliação sem duplicar custos já lançados |
| 17 | Despesas reais → DRE | Cada custo real impacta DRE uma vez | Jobs financeiros de `fuel_record` e `freight_expense`, plano de contas e DRE já existem; despesa ligada a fuel evita duplicação | ALREADY_IMPLEMENTED | P1 | Preservar idempotência e fechar lacunas de origem/fornecedor/classificação |
| 18 | Registro de abastecimento | Placa, motorista, posto, produto, litros, valor, odômetro, comprovante e vínculo de viagem | App já registra posto, odômetro, Diesel/ARLA, litros, valor, placa, motorista, anexo/localização | PARTIALLY_IMPLEMENTED | P1 | Unificar caminho de escrita, tornar vínculo com frete consistente e validar dados |
| 19 | Indicadores de combustível | Média/consumo/custo/anomalias por caminhão | Não há evidência clara de motor robusto de médias/eficiência no material analisado | MISSING | P2 | Calcular por odômetro/período, detectar outliers e qualidade de leitura |
| 20 | Sascar / mapa | Uma integração oficial, confiável, auditável e refletindo estado atual | Persistência e mapa existem, mas há runtime Nitro + Edge com diferenças e endpoint Nitro mais permissivo | PARTIALLY_IMPLEMENTED | P1 | Escolher um runtime oficial e endurecer autenticação, lock, retry e observabilidade |
| 21 | IA textual | IA robusta, contextual e integrada à Frotak | Gemini com instrução curta e histórico limitado a 10 mensagens | PARTIALLY_IMPLEMENTED | P2 | Criar contexto real de produto/dados e política de ferramentas/permissões |
| 22 | Voz | Conversa fluida e estável | Existe Live/WebSocket + fallback local, mas a experiência foi reportada como quebrada e a análise estática não prova funcionamento real | BROKEN | P1 | Teste E2E de áudio, sessão, codec, interrupção, latência e recuperação |
| 23 | Segurança da IA | IA só consome provedor com usuário/tenant autorizado | Server functions analisadas não mostram gate claro de sessão/permissão | BROKEN | P0 | Auth, módulo, permission gate, rate limit, custo por tenant e logs |
| 24 | Motor financeiro | A pagar/receber, parcelas, baixa, estorno, DRE, caixa, rentabilidade | Fundação robusta já existe e trabalha com documentos, parcelas, alocações, baixa, DRE e caixa | ALREADY_IMPLEMENTED | P1 | Evitar reescrever; consolidar integrações operacionais em cima dela |
| 25 | Navegação do financeiro | Um item `Financeiro` no sidebar e organização interna enxuta | Central possui várias subrotas financeiras e itens separados | IMPLEMENTED_DIFFERENTLY | P2 | Simplificar navegação sem empobrecer o motor financeiro |
| 26 | Salários e recorrências | Reduzir redundância; salário pode aparecer como recorrência quando fizer sentido | Há folha gerencial completa separada e regras de recorrência, inclusive legado de salary | IMPLEMENTED_DIFFERENTLY | P2 | Unificar UX/conceito, mantendo estruturas contábeis distintas quando necessário |
| 27 | Storage de documentos | Documento sempre isolado por tenant/frete e acessível só a quem pode | Migration restaurada tem policy ampla para `authenticated` no bucket de frete | BROKEN | P0 | Policies por tenant/path, acesso por função/RPC e testes de tentativa cruzada |
| 28 | Fonte de verdade | Uma lógica oficial por domínio, sem caminhos paralelos inconsistentes | Há status legado + stage, RPC SQL de motorista + app service role, Nitro + Edge Sascar, Master legado + workspace real | PARTIALLY_IMPLEMENTED | P0 | Definir caminho canônico por domínio e depreciar os demais de forma explícita |
| 29 | Gestão de usuários | Usuários reais no Auth e roles/memberships reais | Workspace user é real; tela `usuarios` do Master legado usa localStorage e até senha em texto | IMPLEMENTED_DIFFERENTLY | P1 | Remover fluxo legado do produto real ou migrá-lo para Auth |
| 30 | Atualização em tempo real em escala | Reatividade sem recarregar dados demais | Realtime + debounce + reload amplo + polling de 30s | PARTIALLY_IMPLEMENTED | P2 | Atualização granular, paginação e filtros por tela |

## Leitura por prioridade

### P0 — fechar antes de ampliar o produto

1. Autenticação do motorista.
2. Handoff Master → Central.
3. Segurança/gate da IA.
4. Policies de storage de documentos.
5. Revisão de RLS/contexto de workspace e caminhos service role.
6. Definir uma fonte de verdade por domínio e eliminar caminhos paralelos.

### P1 — fechar a cadeia ponta a ponta

1. Workflow atômico: `manual_move_freight_card` versionada + `workflow_version` correto.
2. Normalizar documentos e transições do frete.
3. Implementar frete por tonelada/pesagem final.
4. Criar conta de viagem do motorista e prestação de contas sem duplicidade.
5. Fazer condição comercial do frete alimentar previsão e o encerramento consolidar o valor final.
6. Unificar abastecimento e garantir integração financeira exatamente uma vez.
7. Escolher um único runtime Sascar.
8. Consertar a experiência de voz com teste E2E real.

### P2 — UX, inteligência e escala

1. Simplificar sidebar/UX financeiro.
2. Reorganizar salários/recorrências na experiência do usuário.
3. Construir indicadores robustos de combustível.
4. Evoluir IA textual para contexto profundo da Frotak.
5. Remover mocks do Master e melhorar escala de Realtime.

## Ordem proposta de execução

### Onda 0 — Segurança e fonte de verdade

Não criar feature nova relevante antes de tirar do caminho os riscos P0. O objetivo é garantir que o mesmo fato tenha uma identidade, uma autorização e um caminho oficial.

### Onda 1 — Operação canônica

Fechar o fluxo:

`criar frete → motorista → carregamento → nota → CT-e → entrega → descarga/pesagem → decisão da expedição → retorno ou novo frete`

com transições atômicas, documentos obrigatórios e auditoria.

### Onda 2 — Dinheiro da operação

Fechar:

`fato operacional → previsão/documento financeiro → parcela → liquidação → alocação → DRE / caixa / rentabilidade`

sem duplicar combustível/despesa e com reconciliação da conta de viagem.

### Onda 3 — Inteligência e experiência

Depois do núcleo confiável: combustível analítico, IA mais robusta, voz, simplificação do financeiro e otimizações de Realtime.

## Decisão arquitetural sugerida

A Frotak deve distinguir claramente três momentos financeiros do frete:

1. **Condição comercial / previsão** no momento da criação do frete.
2. **Valor econômico definitivo** quando o frete termina (incluindo peso final quando for por tonelada).
3. **Caixa realizado** quando a parcela é efetivamente liquidada.

Isso permite que operação, DRE, fluxo projetado e caixa convivam sem misturar previsão com receita definitiva ou pagamento realizado.

## Critério de sucesso da missão nº 1

A integração ponta a ponta estará realmente fechada quando um teste E2E conseguir provar, com um único frete de teste, que:

1. usuário entra no tenant correto;
2. expedição cria o frete;
3. motorista recebe e avança pelas etapas permitidas;
4. documentos bloqueiam/liberam exatamente as transições corretas;
5. abastecimento/despesa entram uma única vez;
6. Sascar/localização atualiza o contexto sem alterar o histórico do frete;
7. entrega é finalizada e a expedição decide retorno/novo frete;
8. receita/custos aparecem na rentabilidade e DRE corretas;
9. previsão de caixa e baixa financeira permanecem distintas;
10. todo o processo é auditável sem depender de dado mock, localStorage inseguro ou chamada privilegiada sem identidade verificável.
