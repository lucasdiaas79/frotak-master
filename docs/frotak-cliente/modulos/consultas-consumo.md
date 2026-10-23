# Historico, abastecimentos e mapa

## MOD-HISTORY: `/historicos`

Fontes: `src/routes/historicos.tsx:49`, `src/lib/services/freight-history.ts`; tipos FreightHistory/LongTripHistory. OBS: pagina e filtros. Carga inicial faz `Promise.all(listFreightHistory, listLongTripHistory)` com loading/erro e protecao de componente desmontado.

| Controle/superficie | Regra e efeito | Dados e retorno |
|---|---|---|
| Placa, UF, documento e datas | Filtra viagens individuais; datas usam inicio/fim do dia local. Tipo de documento admite aliases CT-e, nota e descarga | `items.filter`; nao altera banco. |
| Lista de tiros longos | Filtra placa e fechamento no periodo; nao aplica necessariamente os filtros de UF/documento dos individuais | `filteredLongTrips`; ler predicados distintos antes de unificar filtros. |
| Abrir frete | Modal de dados consolidados, documentos e timeline | Snapshots historicos podem diferir do cadastro atual; SUP do arquivo aponta componente. |
| Abrir tiro longo | Modal do ciclo e trechos, fechamento, entradas/despesas/saldo | Resumo calculado no encerramento; dados ausentes nao podem ser inventados. |
| Selecionar todos/individual | Mantem IDs selecionados e opera sobre o conjunto elegivel | Selecao nao significa consentimento para excluir. |
| Exportar documentos | Usa viagens selecionadas, gera resumo.json e tenta anexar cada documento em ZIP | Arquivo indisponivel/falha de download vira .txt dentro do ZIP, sem necessariamente falhar a exportacao inteira; signed URL pode expirar. NE. |
| Excluir selecionados | Handler de confirmacao/exclusao de historico | Mutavel e potencialmente destrutivo; nao executado. Ver RPC/service para restricoes efetivas. |

FLOW-HISTORY: rota -> effects -> services -> tabelas/historico/ciclos/documentos -> mappers/signed URLs -> filtros/modais -> render. Historico nao equivale a fonte canonica financeira em todos os estados. Nao ha E2E de exportacao, exclusao, snapshot ou fechamento identificado.

## MOD-FUEL: `/abastecimentos`

Fontes: `src/routes/abastecimentos.tsx:51`, `src/lib/services/fuel-records.ts`. OBS: pagina e abas Abastecimentos/Por frete. Nao ha cadastro de combustivel realizado nesta auditoria; os registros podem vir do app motorista.

Filtros gerais: placa, periodo e posto; modo diesel_s10/arla/diesel_arla para ranking/valores. Lista por caminhao, posto, data, produto, litros, valor e odometro; detalhes/documentos podem ser abertos em modal conforme registro. Selecao permite exportar comprovantes e excluir registros; handlers mantem loading/exporting/deleting, confirmacao e erro. Exclusao de registro nao deve ser presumida como estorno financeiro completo.

### RULE-KML-INTERVAL

`calculateKmPerLiter` usa somente diesel com litros/odometro positivos, ordena por odometro e desempata por data. Para cada par consecutivo com delta positivo, soma `odometroAtual - anterior` e litros **do registro atual**. Retorna distancia acumulada / litros acumulados, ou null se nao ha base. ARLA nao entra no denominador; primeiro abastecimento fornece referencia de KM, nao seus litros no intervalo. Filtrar periodo muda a base calculavel. A media exibida e a formula implementada, nao medicao comprovada de tanque cheio.

### RULE-KML-CYCLE

Na aba Por frete, seleciona caminhao e um ciclo/tiro longo. `listTripFuelEfficiencyCycles` le driver_trip_cycles com freights e fuel_records relacionados, ordena ciclos por inicio e trechos por sequencia. `tripDistance` exige odometros inicial/final e diferenca positiva. `tripKmPerLiter = (final - inicial) / soma(litrosDieselDoCiclo)`. Sem odometros ou litros, retorna null/Sem Km/L. Nao usar registros de outros ciclos para preencher silenciosamente.

Contrato do app: `202609300004_long_trip_fuel_efficiency.sql` inclui odometros no ciclo, ordem final>=inicial e freight_id/trip_cycle_id em combustivel. RPC de combustivel exige frete ativo, posto, odometro positivo, pares de litros/valor consistentes e pelo menos um produto. Arquivos de bomba/comprovante sao metadados proprios. UI do motorista permanece externa ao escopo observado.

### RULE-CASH

Combustivel e custo operacional e conta a pagar da empresa, com payment_source=company_payable. Caixa de viagem soma `freight_cash_entries` e subtrai apenas `freight_expenses.payment_source='trip_cash'`. Despesa paga pela empresa pode impactar DRE por competencia e fluxo realizado apos liquidacao, sem reduzir caixa do motorista. Ver migration `202609300001_driver_cash_excludes_fuel.sql`, nao usar o somatorio de todas as despesas como caixa.

## MOD-MAP: `/mapa` e `?focus=...`

Fontes: `src/routes/mapa.tsx:61`, `components/FleetMap.tsx`, `services/positions.ts`, `integrations/sascar.ts`. OBS: tela, busca por placa, seletores de status/UF, painel/lista e mapa. Query `focus` preseleciona veiculo. Lista e virtualizada por scroll/altura; nem todos os veiculos existem simultaneamente no DOM.

| Controle | Comportamento |
|---|---|
| Busca/status/UF | Deriva lista/marcadores dos veiculos carregados; limpar remove filtros. |
| Selecionar veiculo/marcador | Abre detalhe e foco geografico; mostra horario da ultima posicao e informacoes operacionais. |
| Expandir mapa | Modal/mapa maior; acao local, nao recalcula posicoes. |
| Sincronizar Sascar | POST mutavel em integracao, protegido por flag em andamento; estatisticas atualizam cabecalho/toast e frota. NE. |
| Indicador de sincronizacao | Consulta integration_sync_state e observa canal filtrado por tenant |

Estados: mapa sem coordenada/veiculos, falha ao ler estado de sync, sincronizacao em andamento e stale/ultima atualizacao. O canal nao inicia sincronizacao manual por si: cron e outra origem. Cores podem indicar documento/comando pendente, nao so movimento. Map tiles e geocoding sao externos; carregar mapa pode fazer requests de tiles, mas nao aciona dispositivos.

Regressoes: filtros combinados, data invalida/fuso, SignedURL expirada, diesel/ARLA separados, odometro repetido/retroativo, ciclo aberto/fechado sem odometro, foco sem coordenadas, virtualizacao e reconexao com estado antigo. TEST nesta auditoria cobre apenas renderizadores deterministas de consumo da IA, nao o ciclo completo.
