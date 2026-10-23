# Dashboard e operacao de fretes

## MOD-DASH: `/`

Fonte `src/routes/index.tsx:35`; OBS EV-NAV-01. Tela resume frota, mapa, caixa por caminhao, pendencias e tabela. KPIs filtram total, em rota, parados, manutencao, quebrados e sem motorista usando `matchesFilter`/`statusGroup`. Mapa mostra posicao disponivel, nao tracking certificado online de todos os veiculos. Caixa agrega entradas/despesas por veiculo e ciclo/frete (`movementKey`); combustivel e excluido pelo contrato de caixa atual.

Pendencias sao classificadas por `pendingActionKindOfVehicle`: CT-e, confirmacao do motorista ou comando final. Links levam a gestao/mapa, com foco quando previsto. Eventos recentes usam `fleet_events` e fallback em updatedAt do veiculo se nao ha eventos. Data de posicao e data de atualizacao operacional nao sao intercambiaveis. Detalhes/modais e expandidos ficam em SUP do arquivo; nao acionar comandos de atribuicao a partir do dashboard para testar documentacao.

## MOD-FREIGHT: `/gestao-frota` e `/vinculacao`

Fonte principal `src/routes/gestao-frota.tsx:127`; alias `/vinculacao` encaminha para gestao. Prerequisitos: cadastros, ativos disponiveis, modos do tenant, dados de pagador e permissao de backend. OBS: pipeline, filtros e criacao nos tres modos. Detalhes condicionais de registro ainda dependem de etapa e anexos existentes.

Filtros: texto de codigo/placa/motorista/cidades/origem/destino, macroetapa, status, modelo de implemento, UF e situacao; limpar restaura filtros. Pipeline/Tabela mudam representacao. Cabecalho de coluna e Ver todos abrem conjunto filtrado. Cards abrem detalhe; arrastar para macrocoluna abre conciliacao manual. Nao confundir arraste com alteracao sem confirmacao.

### RULE-STAGE: micro e macroetapas

Fonte canonica: `src/lib/freight-workflow.ts`, `src/lib/types.ts` e RPCs atuais.

| Microetapa | Macrocoluna | Contrato |
|---|---|---|
| `DISPONIVEL` | Disponiveis; com currentFreightId pode aparecer em Carregamento | Status aguardando motorista pode representar frete atribuido ainda nao aceito. |
| `EM_ROTA_CARREGAR` | Carregamento | Deslocamento para origem. |
| `AGUARDANDO_NOTA` | Carregamento | Parado esperando carga/documento. |
| `NOTA_EM_CONFERENCIA` | Aguardando CT-e/MDF-e | Nota recebida para revisao. |
| `NOTA_APROVADA_AG_CTE` | Aguardando CT-e/MDF-e | Emissao/anexo de CT-e pendente. |
| `CTE_GERADA_AG_CONFIRMACAO_MOTORISTA` | Aguardando CT-e/MDF-e | CT-e anexado, aguarda confirmacao no app. |
| `EM_ROTA_ENTREGA` | Descarga | Deslocamento para destinatario. |
| `ENTREGUE_AG_FINALIZACAO` | Descarga | Aguarda encerramento/comprovante conforme fluxo. |
| `ENTREGA_FINALIZADA` | Rota finalizada | Aguardar comando, novo frete ou retorno; nao necessariamente patio. |

`stageOfVehicle` prefere freightStage e faz fallback de status legado. `macroStageOfVehicle` trata currentFreightId. Eventos do app/SQL tambem mudam etapa; nao reconstruir o workflow apenas pela ordem dos cards no browser.

### RULE-CREATE: assistente de criacao

| Modo | Campos e validacao | Handler/servico/efeito |
|---|---|---|
| Individual | Trator, motorista, remetente, destinatario, produto, valor fixo OU tonelada, CIF/FOB, prazo; implemento conforme modo | `createFreight` -> `createFreightOperation` -> store.link -> `link_vehicle_operation` -> status aguardando motorista. Mensagens de erros de pagador/preco sao traduzidas. |
| Grupo | Mesmos dados comerciais e pelo menos um caminhao disponivel com motorista vinculado | `createGroupFreight` itera recursos e chama operacao individual. Pode concluir parcialmente; nao e transacao unica de grupo. |
| Tiro longo | Trator/motorista e lista de trechos; cada trecho exige origem/destino/produto/implemento/CIF-FOB e preco valido | `createLongTripFreights` -> RPC `create_long_trip_freights` -> ciclo/freights sequenciados -> startedNow/contagem -> recarga. Adicionar/remover trecho atua no formulario ate confirmar. |

`openCreate`/`openLongTripCreate` semeiam valores; sessionStorage `central:new-freight-seed` permite chegar por outra tela e abre assistente uma vez. Observacoes presentes no estado nao devem ser presumidas persistidas em todos os modos: conferir payload enviado. Prazo personalizado e parseado como dias. Preco por tonelada depende de toneladas descarregadas para valor final, nao assumir estimativa como faturamento.

### RULE-ASSET: disponibilidade

`assetAssignmentMode`/`manualAssetAssignment` mudam selecao fixa por veiculo ou manual por frete. `activeDriverIds`/`activeTrailerIds` e helpers finais de gestao controlam opcoes bloqueadas. Uma cacamba visualmente livre no cadastro pode estar ocupada em frete/ciclo. Sao necessarias verificacoes de concorrencia no banco alem da lista de opcoes carregada.

### RULE-ICMS: pagador, preco e tributo

`freightIcmsRate`/`freightIcmsPreview` calculam preview por UF: UF ausente/invalida resulta em taxa 0 e UF pendente; mesma UF usa mapa interno; origem SP/RJ/MG/PR/SC/RS para destino fora desse conjunto usa 7%; demais interestaduais usam 12%. Preview de imposto=round(valorBruto*taxa/100,2), liquido=round(bruto-imposto,2). Essas sao regras de codigo encontradas, nao orientacao tributaria atualizada. Regras efetivas no banco em `202609210001_auto_freight_icms_by_route.sql` e migrations posteriores.

CIF vincula pagador ao embarcador e FOB ao destinatario, por parceiro financeiro mapeado; falta de mapeamento impede fluxo. Tributo nao se determina pela string da placa nem pelo nome do tenant. Preco por tonelada usa modo e tonelagem final. Nao tratar preview de tela como lancamento fiscal validado.

## FLOW-DOC: documento e avanco

`DemandWorkspace`, `DemandStageSection`, `DocumentPanel`, `AwaitingCtePanel`, `DriverConfirmations` e `FreightTimeline` organizam detalhe. Selecionar arquivo -> `handleDocument` -> `uploadFreightDocument` -> consulta veiculo/tenant/frete -> Storage -> insert metadados -> recarrega documentos -> avanco/feedback quando aplicavel. Aprovar nota e rejeitar nota sao comandos distintos; rejeicao exige reenvio e altera estados. Botao WhatsApp monta URL externa; nao e envio automatico comprovado.

`advanceFreightStage` recusa avanco normal para conferencia sem nota e para confirmacao sem CT-e. Um explicitNext altera essas verificacoes no helper; o backend deve continuar aplicando seu contrato. `rejectNote` marca documento rejeitado, coloca status aguardando-cte/NOTA_APROVADA_AG_CTE e insere evento nota_fiscal_rejeitada pedindo nova foto; nao retrocede automaticamente a AGUARDANDO_NOTA. O toast que informa motorista avisado nao comprova entrega de mensagem externa. Documento salvo e status avancado sao passos distintos, portanto testar erro entre eles. Visualizar/baixar usa URL assinada; downloads NE.

## FLOW-MANUAL: conciliacao de etapas

Fonte `components/fleet/ManualMoveDialog.tsx`, `lib/freight-kanban.ts`, `services/manual-kanban.ts`. Campos: destino permitido, motivo >=8 caracteres, fonte de informacao, data/hora valida, observacao e confirmacao de documentos faltantes. Mostra etapas puladas/retrocesso e pendencias. Submit -> `manualMoveFreightCard` -> RPC com versao -> flags/override/evento/veiculo -> onApplied; conflito `WorkflowConflictError` recarrega, avisa e fecha, em vez de sobrescrever silenciosamente. Confirmar movimentacao NE.

## FLOW-END: encerramento, retorno e novo trecho

`applyFinalFreightCommand`: Retorno solicitado altera para rota-retornando/ENTREGA_FINALIZADA; Pronto para novo frete arquiva operacao e devolve seed para criar proxima. Arquivamento tem modal e motivo, handler `confirmCloseFreight`. O ciclo longo pode permanecer aberto sem frete atual; contexto do app deve entregar returnToYard e Cheguei no patio. `private.activate_next_long_trip_freight` foi redefinido em `202609300002*` para seguir status normal no proximo trecho. `driver_app_complete_return` fecha ciclo, registra odometro e libera patio, com patches posteriores. UI do app externo nao foi auditada aqui.

Regressoes necessarias: nota rejeitada/reenvio, CT-e anexado/confirmado, proximo trecho, retorno sem frete, concorrencia manual, grupo parcialmente criado, aliases de documentos, mudanca de tenant durante carga e reflexos de receita/ICMS/historico. Suites existentes de IA/visual nao exercitam essas transacoes.
