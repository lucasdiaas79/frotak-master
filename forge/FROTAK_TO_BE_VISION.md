# Frotak — Visão TO-BE integrada

Data de captura: 2026-09-17
Fonte: visão de produto expressa por Lucas em conversa com Gui.
Status: intenção de produto a ser confrontada com o AS-IS real do código, migrations e banco.

## Missão número 1

Deixar a Frotak **totalmente integrada de ponta a ponta**.

Cada evento operacional relevante — frete, motorista, documento, combustível, despesa, prazo, recebimento, pagamento, telemetria e encerramento da viagem — deve produzir consequências coerentes nas demais áreas do sistema, sem dupla contabilização e sem depender de retrabalho manual.

---

## 1. Login, autenticação e entrada no sistema

A Frotak já possui site com login e senha e autenticação ligada ao banco. O fluxo desejado é:

1. usuário autentica;
2. identidade/tenant/workspace são resolvidos;
3. usuário entra diretamente no ambiente/tema correto daquele acesso;
4. dashboard é carregado com o contexto correto.

Observação: a visão de produto considera o dashboard atual satisfatório, mas o fluxo de login ainda deve ser validado tecnicamente contra o estado real do código, auth, RLS e roteamento por tenant/workspace.

---

## 2. Gestão de frota como Kanban operacional em tempo real

A Gestão de Frota deve funcionar como o centro visual da operação, em formato Kanban, refletindo automaticamente a evolução do frete.

O Kanban conversa em tempo real com o sistema/app do motorista. O motorista executa ações no campo e essas ações movem o card para a etapa correspondente sem depender de atualização manual da expedição.

### Fluxo operacional desejado

- **Disponível no pátio**
- motorista confirma saída do pátio
- **Em rota para carregar**
- motorista confirma chegada à origem
- **Parado / aguardando carregamento**
- carga realizada e nota fiscal enviada
- nota chega à expedição
- expedição confere/aprova a nota
- **Aguardando CT-e**
- CT-e é enviado ao motorista
- motorista confirma recebimento do CT-e
- **Em rota para descarregar / entregar**
- motorista chega ao destinatário
- **Parado / aguardando descarga**
- motorista confirma descarga
- se o frete for por tonelada, informa peso final de balança
- sistema calcula o valor real do frete
- expedição decide:
  - gerar novo frete para o motorista; ou
  - mandar retornar ao pátio

A descarga por si só **não libera automaticamente o veículo**. A expedição decide o próximo movimento.

---

## 3. Formação do frete e reflexo financeiro

Na criação do frete devem existir, entre outros dados:

- veículo;
- motorista;
- origem;
- destino;
- cliente/pagador;
- modalidade de cobrança;
- valor fixo ou valor por tonelada;
- CIF/FOB;
- prazo/condição de recebimento;
- demais dados necessários à operação.

### Regra CIF / FOB desejada

- **CIF**: o remetente paga o frete para a transportadora.
- **FOB**: o destinatário paga o frete para a transportadora.

Esses dados devem alimentar automaticamente o financeiro desde a origem do fato operacional, com separação entre competência, vencimento e liquidação.

### Frete por tonelada

Se a cobrança for por tonelada:

`valor_final_do_frete = toneladas_finais_confirmadas × valor_por_tonelada`

O valor final é consolidado após a descarga/pesagem final e passa a ser o valor econômico definitivo daquela viagem.

---

## 4. App do motorista e conta de viagem

Em viagens longas, que podem durar dias, semanas ou meses, o app do motorista precisa controlar:

- entradas/adiantamentos;
- despesas;
- abastecimentos;
- outros movimentos vinculados à viagem;
- saldo/resultante da prestação de contas.

### Regra financeira importante

O app pode manter um razão operacional da viagem, mas o financeiro corporativo não deve duplicar lançamentos.

- despesas e abastecimentos reais devem atingir o DRE uma única vez, conforme sua natureza e regra contábil/financeira;
- adiantamentos ao motorista não são despesa automaticamente: são movimentos de caixa/conta corrente até a prestação de contas;
- o encerramento da viagem deve reconciliar entradas, despesas e saldo final;
- o fechamento não deve relançar despesas já reconhecidas;
- o saldo final da prestação de contas pode gerar valor a pagar ou a receber do motorista, se aplicável.

Essa distinção é necessária para conciliar dois objetivos da visão de produto: refletir cada custo real no DRE e, ao mesmo tempo, não jogar todo o trânsito de dinheiro da viagem como nova despesa no financeiro.

---

## 5. Sascar e mapa da frota

O mapa da frota utiliza integração com a Sascar.

Objetivo desejado:

- consultar os veículos rastreados;
- exibir posições/estados da frota;
- manter atualização confiável;
- relacionar telemetria/localização com o veículo e a operação atual;
- não confundir histórico de viagem com estado atual.

A integração deve ser auditável e resiliente a falhas de consulta.

---

## 6. IA da Frotak

A IA atual é percebida como insuficiente para a experiência desejada.

A meta é uma IA mais robusta em dois canais:

- chat textual;
- voz.

A conversa por voz deve ser mais natural, estável e fluida, próxima da experiência esperada em uma conversa moderna em tempo real.

A IA precisa entender profundamente o contexto real da Frotak e não operar como chatbot genérico.

---

## 7. Abastecimento integrado ao motorista

O módulo de abastecimento precisa deixar de ser apenas uma coleção parcial de telas/dados e virar um sistema operacional robusto.

Cada abastecimento deve poder registrar, no mínimo:

- veículo/placa;
- motorista;
- data/hora;
- posto;
- produto (ex.: Diesel S10, ARLA 32);
- quantidade;
- valor;
- preço unitário;
- odômetro;
- documentos/comprovantes quando aplicável;
- vínculo com viagem/frete quando existir.

O motorista deve conseguir registrar o abastecimento no app e a informação precisa chegar ao sistema principal de forma estruturada e validável.

O sistema deve conseguir produzir indicadores confiáveis por caminhão, incluindo consumo/média, custo, evolução e anomalias.

O fato operacional de abastecimento deve alimentar o financeiro sem gerar lançamentos duplicados.

---

## 8. Financeiro simplificado na navegação e completo no motor

A navegação lateral deve ser mais enxuta.

Em vez de muitos itens soltos no sidebar, a preferência é manter um único ponto principal **Financeiro**, com organização interna por navegação horizontal ou seções.

A informação deve ser consolidada para reduzir redundância. Exemplo: salários podem ser tratados como um tipo de recorrência, em vez de aparecerem como universo isolado se isso não agregar clareza.

### O motor financeiro, porém, deve ser completo

Precisa integrar de ponta a ponta:

- receitas de frete;
- prazos de recebimento;
- contas a receber;
- contas a pagar;
- despesas de viagem;
- abastecimentos;
- recorrências;
- salários/folha quando modelados no sistema;
- fluxo de caixa;
- DRE;
- realizado x previsto;
- rentabilidade por viagem/veículo/cliente quando houver alocação suficiente;
- liquidações e conciliações.

### Princípio estrutural

`fato operacional -> documento financeiro -> parcela/vencimento -> liquidação -> alocação -> DRE / caixa / rentabilidade`

Competência, vencimento e liquidação não devem ser confundidos.

---

## 9. Fonte de verdade e integração ponta a ponta

A visão desejada é que o sistema deixe de ser um conjunto de módulos parcialmente conectados e passe a funcionar como uma cadeia única de fatos.

Exemplos:

- motorista registra abastecimento -> fato de combustível -> custo operacional -> financeiro/DRE -> indicadores do veículo;
- motorista registra despesa -> fato de despesa -> prestação de contas -> financeiro/DRE -> rentabilidade do frete;
- frete criado -> condição comercial -> previsão financeira -> contas a receber;
- peso final confirmado -> recalcula receita real do frete -> ajusta financeiro;
- encerramento da viagem -> fecha operação -> consolida rentabilidade -> libera próximo passo operacional;
- Sascar atualiza posição -> mapa e contexto operacional refletem o estado atual.

A mesma informação não deve precisar ser digitada novamente em outro módulo.

---

## 10. Regra de implementação para o Forge

Este documento representa **TO-BE / intenção de produto**, não prova do estado atual.

Quando o levantamento do VS Code estiver disponível, o Forge deverá classificar cada regra como:

- `ALREADY_IMPLEMENTED`
- `PARTIALLY_IMPLEMENTED`
- `IMPLEMENTED_DIFFERENTLY`
- `BROKEN`
- `MISSING`
- `CONFLICT_NEEDS_DECISION`

O Forge não deve alterar silenciosamente uma regra de negócio apenas porque o código atual faz diferente.

O objetivo é produzir uma matriz **AS-IS x TO-BE** e transformar a diferença em backlog técnico priorizado.

---

## Norte do produto

A Frotak deve agir como um sistema único.

A missão prioritária não é acrescentar dezenas de novas features, e sim garantir que o que já existe converse corretamente de ponta a ponta, com uma única cadeia coerente entre operação, motorista, documentos, telemetria, combustível e financeiro.
