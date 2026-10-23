# Cadastros

Fontes comuns: `src/lib/store.ts`, `src/lib/services/{vehicles,drivers,trailers,parties,products}.ts` e `mappers.ts`. Prerequisito: sessao e RLS do tenant; concessoes do servidor prevalecem sobre botoes. UI-01/02/03 descrevem estados e comportamentos comuns.

## MOD-VEH: `/veiculos`

Fonte `src/routes/veiculos.tsx:57`. OBS: lista e modal Novo veiculo. Filtros: busca por placa/marca/modelo/Renavam, status e UF; limpar restaura valores. Tabela: tipo, marca, modelo, ano, placa, Renavam, situacao, status, motorista, cacamba e acoes, com colunas condicionadas ao modo de ativos. Exportar produz CSV da lista derivada; NE.

Formulario inclui tipo/metadados do ativo, placa, ano, Renavam, situacao/status, vinculos e posicao. `onSave` normaliza placa alfanumerica maiuscula, tipo/marca/modelo maiusculos e Renavam numerico. Patio/oficina ajustam status e etapa; outros status mapeiam para etapa legada. No modo manual por frete, nao fixa motorista no cadastro. No modo fixo, pode salvar veiculo e depois chamar vinculacao separada.

FLOW-VEH-SAVE: formulario -> validacoes de placa/tipo no handler -> `upsertVehicle` -> `vehicleToRow` -> upsert vehicles -> `vehicleFromRow` -> eventual `link_vehicle_operation` -> toast/fecha modal -> store/Realtime. Vinculacao e persistencia do cadastro podem falhar em momentos diferentes. Excluir abre confirmacao e chama delete; ha caminho sem aguardar promise antes do toast. Falhas de FK, RLS e unicidade devem ser testadas, nao inferidas como sucesso pelo fechamento.

## MOD-DRIVER: `/motoristas`

Fonte `src/routes/motoristas.tsx:26`. OBS: abas Todos/Ativos/Inativos, busca por nome, tabela e modal. Campos: nome, telefone, CNH e ativo. Nome e validado no handler. Salvar usa flag saving e pode provisionar app conforme MOD-DRIVER-ACCESS. Ativar/desativar altera disponibilidade do condutor; nao confundir com revogacao comprovada de todos os tokens Auth.

Vincular abre modal com veiculos sem motorista ou ja vinculados ao condutor. `onLink` -> store.link -> RPC -> veiculos/motoristas/implementos/eventos. Colunas e botao de vinculo sao omitidos quando ativos sao escolhidos por frete. Edicao/exclusao possuem estado proprio; envio NE. Telefone/CNH nunca aparecem nas evidencias salvas.

## MOD-TRAILER: `/carretas`

Fonte `src/routes/carretas.tsx:21`. Sidebar pode dizer Cacambas; pagina publicada mostra Carretas. OBS: tabela e modal Nova carreta. Busca cobre tipo/metadados/identificador/Renavam/modelo do implemento; filtro Todas/Acopladas/Livres. Ordenacao por sequencia da frota, depois identificador.

Campos: numero sequencial, tipo, marca, modelo, ano, placa/identificador, Renavam, tipo/modelo do implemento. `onSave` exige identificador/tipo, normaliza texto e dispara `upsertTrailer`, mas nao aguarda antes de sucesso/fechamento. O vinculo exibido e derivado dos ativos; disponibilidade para um novo trecho e outra regra (RULE-ASSET). Nao foi executada mutacao.

## MOD-CUSTOMER: `/clientes`, aliases `/remetentes` e `/destinatarios`

`src/components/CustomersPage.tsx` e implementacao compartilhada. Rotas antigas redirecionam para `/clientes` (OBS). A listagem une senders/recipients por chave normalizada e combina papeis; ativacao combinada usa OR quando ambos existem. Isso nao significa que tabelas foram fisicamente unificadas.

Filtros: texto (nome/CNPJ/cidade/UF/endereco/localizacao), papel e ativo. Colunas cliente, CNPJ, cidade/UF, localizacao, papel, status e acoes. OBS: Novo cliente abre modal com nome/documento, papeis, localizacao/endereco/CEP/UF, estado ativo. O handler `save` recusa silenciosamente nome vazio ou ausencia de papel; nao exige cidade/CNPJ no proprio guard. Demais restricoes de banco devem ser conferidas, sem presumir validacao fiscal do documento.

FLOW-CUSTOMER-SAVE: estado do modal -> validar nome/papel -> criar/atualizar sender e/ou recipient via store -> services -> tabelas -> triggers de parceiro financeiro -> recarga. Desmarcar papel existente chama deleteSender/deleteRecipient no proprio save. Os dois papeis podem envolver varias escritas; verificar falha parcial e restricoes de FK em ambiente isolado. Esse efeito de exclusao precisa de decisao explicita antes de alterar o cadastro unificado.

Localizacao: Buscar envia dados a geocoding; Aplicar interpreta link Maps; CEP consulta ViaCEP e preenche lacunas; sugestao/mapa altera coordenadas locais; Salvar persiste lat/lng/source/label/geocodedAt. Nenhuma consulta externa com endereco real foi acionada. Erro de CEP e ignorado como auxilio, erro de busca gera feedback; a edicao manual continua possivel.

## MOD-PRODUCT: `/produtos`

`src/components/ProductsPage.tsx`; OBS: pagina, busca/status, tabela e modal Novo produto. Campos nome/ativo; nome obrigatorio. Novo/editar/ativar/excluir usam store -> services/products -> products -> refresh/feedback. Produto e referenciado por frete/financeiro, portanto exclusao pode ser impedida ou afetar historico conforme FK. Nao presumir limpeza em cascata.

## Contratos e testes

Preservar normalizacao e mappers, multiplos implementos em `vehicle_trailers`, alias legado, selecao manual/fixa por configuracao e efeitos de provisionamento. Validacao de campos e tabela de origem completas ficam nos inventarios CTL/TYPE/GUARD. Nao ha suite E2E de CRUD identificada. Testar duplicidade de placa/documento, inativo, RLS, vinculo ocupado, erro depois do primeiro save e envio duplo antes de refatorar.
