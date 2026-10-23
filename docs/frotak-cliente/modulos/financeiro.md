# Financeiro

Implementacao principal: `src/components/financial/FinancialModule.tsx` (arquivo compartilhado extenso), `FleetProfitabilityPage.tsx`, `FinancialNav.tsx`; services em `src/lib/financial/`. Cada rota financeira importa o componente correspondente. Permissoes: AUTHZ-02. Evidencias de leitura: EV-NAV-13 a 22. Rotas de titulos foram excluidas da navegacao em producao por efeito automatico de geracao de recorrencias.

## MOD-FIN-OVERVIEW: `/financeiro`

`FinancialOverviewPage` -> `FinancialBoundary` -> conteudo -> `getFinancialDashboard` RPC por workspace e periodo. Apresenta obrigacoes/alertas, competencia, caixa realizado e categorias. Filtros de periodo mudam payload; CSV quando oferecido gera download. Permissao `financial.dashboard.view` ou owner. Falha exibe feedback e estado sem dados; observar card nao certifica total correto contra razao.

## MOD-FIN-TITLES: `/financeiro/receber`, `/financeiro/pagar` e aliases contas-receber/contas-pagar

`FinancialTitlesPage({direction})` em `FinancialModule.tsx:2433` compartilha dados e modais; listas Receivables e Payables possuem apresentacao/agrupamentos distintos. Prerequisitos: acesso, parceiro, gerencial/conta contabil, apropriacao/referencias compativeis e conta financeira ativa para baixa.

| Superficie/controles | Campos, validacoes e condicoes | Fluxo/efeitos e resultado |
|---|---|---|
| Filtros e paginacao | Busca com debounce, situacao, parceiro, periodo/vencimento e demais filtros expostos; pagina/limite | `listFinancialDocumentsPage` -> RPC `list_financial_documents_page` -> resumo/lista; nao confundir total paginado com total global. |
| Agenda a pagar | Agrupa vencidos/proximos vencimentos/demais faixas | `payableAgendaGroup`/`payableDueState`; saldo aberto e status derivado. |
| Lista a receber | Prioridade/vencidos/saldos e selecao | `receivableDueState`, primeira parcela aberta elegivel. |
| Novo/editar titulo | Parceiro, descricao, numero, emissao, competencia, data de lancamento, valor, vencimento, parcelas, gerencial, apropriacao, caminhao, funcionario, produto, situacao, observacoes, recorrencia | `DocumentDialog` -> saveFinancialDocument ou saveFinancialDocumentWithRecurring -> RPCs -> documentos/parcelas/rateios/auditoria. Guard no banco e obrigatorio mesmo se botao estiver disabled. |
| Parcelas personalizadas | Quantidade limitada na UI a 1..120; cada valor>0/data; soma igual ao total com tolerancia <0,005 | `customInstallmentsValid`; defaults proporcionais devem manter arredondamento do backend. |
| Criar parceiro no modal | Nome, CPF/CNPJ e prazos padrao a pagar/receber | `PartnerDialog` -> saveBusinessPartner; altera catalogo financeiro do tenant. |
| Detalhes | Dados de titulo, parcelas, rateios, liquidacoes, referencias e recorrencia | `getFinancialDocumentDetails` sob demanda; editar/baixar/cancelar dependem de permissao/status. |
| Cancelar/estornar | Motivo exigido no fluxo aplicavel, confirmacao e permissao | `voidFinancialDocument` / `reverseSettlement`; preserva trilha. NE. |
| Reconciliacao ao abrir | Se canManageRecurring e workspace ainda nao processado nesta instancia, gera competencias pendentes | `generateDueFinancialRecurringDocuments` em effect, antes de nova carga. Mutacao automatica; BLQ-NAV-TITLES. |

### FLOW-SETTLE: baixar parcela

Selecionar parcela -> `SettlementDialog` -> valor principal positivo, data, conta, forma, juros, multa, desconto, observacao e apropriacao de ajustes -> `settleInstallment` -> RPC `settle_financial_installment` -> validacao de saldo/periodo/referencias/permissao -> liquidacao + saldos + razao/ajustes -> retorno -> toast e reload. Liquido e principal+juros+multa-desconto, conforme regras do banco; ajustes sao fatos separados classificados por gerenciais. Estorno e um evento compensatorio, nao apagar linha.

### FLOW-BULK: pagar/receber selecionados

`ReceivablesTitleList`/`PayablesTitleList` mantem selecao por IDs elegiveis. `BulkSettlementDialog` mostra quantidade/total e pede data, forma, conta e observacao; em pagamentos exige nome de fatura com maximo 120 caracteres. Baixa cada primeira parcela elegivel pelo saldo aberto, com juros/multa/desconto zerados neste fluxo.

Ao pagar, gera batchId e chama `settleInstallment` sequencialmente usando `settle_financial_installment_with_batch`. Nome/batch sao gravados em cada liquidacao. Ao receber, nao gera esse agrupamento de pagamento. O lote inteiro **nao e atomico**: erro no item posterior pode deixar anteriores liquidados. Testar reabertura, nova selecao e repeticao depois de falha antes de alterar a logica.

## MOD-FIN-CASHFLOW: `/financeiro/fluxo-caixa`

`CashFlowContent` usa `getCashFlowSummary`, `getCashFlowEntries` e contas. Filtros: periodo, realizado/previsto, entrada/saida, conta consolidada/especifica. CSV exporta dados filtrados. Movimentacoes ordenadas por data decrescente; visao temporal agrega cronologicamente. Na tela ampla, movimentacoes ficam maiores a esquerda e temporal menor a direita conforme CSS compartilhado.

Titulo visivel prioriza `partner_name`, usando descricao como fallback; gerencial fica no metadado. Realizado depende de liquidacoes/estornos; previsto de parcelas/vencimentos. Projecoes usam saldo realizado + net_7d/net_30d. Nao interpretar titulo contabilizado como dinheiro ja no banco.

`CashFlowMovementList` agrupa apenas settlement com batch_id e batch_name. `CashFlowSettlementBatchRow` abre dropdown sob demanda -> `get_cash_flow_settlement_batch_details` -> titulos, parcelas, gerenciais, apropriacoes, caminhao/motorista/produto/frete e conta. Total da linha deriva das entries filtradas; detalhes da RPC podem trazer o lote completo. Essa diferenca precisa ser preservada ou explicitamente decidida ao refatorar. Erro no carregamento de lote tem feedback proprio.

## MOD-FIN-DRE: `/financeiro/dre`

Abas DRE Geral/DRE por caminhao; periodo livre, base competencia/caixa e apropriacao; aba por caminhao exige veiculo. `getDrePeriodStatement`/`getDre12MonthStatement`/summary/detail sao wrappers do banco; UI formata e apresenta hierarquia. Exportacao jsPDF usa periodo, criterios e logo selecionada do tenant, fundo branco; e efeito de download, NE.

O demonstrativo de periodo soma fatos assinados por dre_group. Conforme `20260928193200_dre_period_and_vehicle_statement.sql:617`: netRevenue=gross_revenue+revenue_deductions; grossResult=netRevenue+variable_costs; operatingResult=grossResult+operating_expenses+depreciation_amortization; managerial_result=soma de todos os signed_amount, incluindo descontos obtidos/outros/nao classificados; managerialMargin=null se receita bruta zero, senao round(managerial_result/gross_revenue*100,2). Despesas ja carregam sinal negativo: nao subtrair novamente. Essa formula efetiva e mais especifica que o modelo didatico da documentacao historica.

Nomes/grupos/sinais sao definidos em migrations `202609250002_frotak_dre_managerial_model.sql`, `20260925190858*` e `20260928193200*`, nao pelo texto da categoria na UI. Base accrual pode aparecer como Lancamento e cash como Conciliacao; o campo basis e o contrato. Caixa e competencia usam fatos diferentes. Despesas company_payable entram como custo reconhecido conforme integracao e classificacao, sem necessidade de reduzir caixa de motorista. Salvar despesa ou ve-la num titulo nao comprova que o job ja a contabilizou.

## MOD-FIN-PROFIT: `/financeiro/rentabilidade` e `/lucros-despesas`

`FleetProfitabilityPage` e comum as rotas. Resumo/ranking por veiculo/frete/parceiro via RPCs dedicadas. Filtros: periodo, veiculo, cliente pagador, remetente, destinatario, produto, modelo implemento e CIF/FOB; ranking possui busca/ordenacao/expansao. Campos revenue/costs/result/margin/unallocatedCosts sao calculados no backend. Custos nao apropriados devem aparecer como lacuna, nao ser rateados silenciosamente.

Formula basica de resultado=receita-custos; margem percentual com tratamento de receita zero e datas deve seguir SQL de rentabilidade, nao recalculo do modelo IA. Fretes ativos, concluidos, custos reconhecidos e realizados nao podem ser misturados sem indicar base. Exportacoes e detalhe condicionados a acesso; testes reais de numeros pendentes.

## MOD-FIN-STRUCTURE: contas, gerenciais e apropriacoes

| Rota | Componente e controles | Regras |
|---|---|---|
| `/financeiro/contas` | AccountsContent; novo/editar, nome, tipo, banco, agencia, conta, saldo/data iniciais, ativo | `financial.manage_accounts`; saldo/data de abertura bloqueados na edicao. saveFinancialAccount -> RPC. Sem transferencia bancaria externa comprovada. |
| `/financeiro/plano-contas` | StructurePage kind=chart; codigo/nome/pai/tipo/grupo DRE/ativo | Permissao de gerenciais; hierarquia e classificacao afetam DRE/integracao. Botao pode usar termo Nova conta. |
| `/financeiro/centros-custo` | StructurePage kind=centers; codigo/nome/pai/ativo | Apropriacoes ligam documentos/rateios/folha; nao sao sinonimo de parceiro ou conta bancaria. |

## MOD-FIN-RECUR: `/financeiro/recorrencias`

`FinancialRecurringPage`. Formulario: tipo, nome, favorecido/funcionario/motorista/veiculo, gerencial, apropriacao, valor, frequencia, dia de vencimento, mes inicial/final, gerar lancado e observacao. `saveFinancialRecurringRule`, alterar status, gerar competencia global ou por regra. Status ativo/pausado/cancelado conforme contrato. Gerar exige financial.manage_recurring, executa RPC mutavel e retorna generated/skipped por idempotencia. Nao acionado.

Fonte canonica de scheduler: `central-dias-main/docs/FINANCIAL_RECURRING_SCHEDULER.md`. Cancelar regra nao equivale a estornar titulos passados. Frequencia/competencia/fim de mes devem ser testados contra SQL.

## MOD-FIN-PAYROLL: `/financeiro/salarios`

`FinancialPayrollPage`. Filtros: competencia, funcionario, funcao, apropriacao e status. Novo funcionario abre perfil financeiro (nome, motorista opcional, funcao, salario, data de pagamento, conta contabil, apropriacao, admissao, ativo e notas), nao usuario Auth. Services `payroll.ts`: perfil -> folha -> itens -> calcular -> aprovar -> contabilizar -> cancelar/adiantamentos. Permissoes view/manage/approve/post/void sao distintas.

Cards exibem bruto/descontos/liquido e progresso; detalhes permitem itens de proventos/descontos e acoes por status. Valores finais derivam do banco; contabilizar gera titulo a pagar e eventos. Adiantamento e desconto posterior precisam preservar vinculo para nao descontar duas vezes. Nenhuma acao de folha foi executada.

## MOD-ALLOWANCE: painel de diarias

`components/daily-allowances/DailyAllowancePanel.tsx` e services/daily-allowances. Integracao e condicional ao modo/capacidade do workspace. Configurar habilitacao, valor diario e prazo 0..365; valor positivo necessario para habilitar. Lista pedidos por ciclo e status, aprovar/reprovar com observacao; aprovacao retorna financialDocumentId. SQL exige quantidade 1..120 e unitario positivo. Efeito: titulo/fornecedor/gerencial/apropriacao conforme regras, nao baixa automatica de caixa de motorista.

Testes financeiros SQL estao em `supabase/tests` (fundacao, scheduler etc.), mas escrevem fixtures e nao foram executados. Nao ha E2E de lote/DRE/rentabilidade/folha identificado no Cliente. Ver [regressoes](../rastreabilidade.md) antes de modificar.
