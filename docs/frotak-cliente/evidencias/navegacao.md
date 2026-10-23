# Evidencias sanitizadas de navegacao

Data: 2026-10-19. Browser: Chrome, sessao autenticada existente; dominio Cliente `https://central-dias.vercel.app`. Nenhuma credencial, telefone, CNH, placa, endereco, valor financeiro ou identificador de registro foi persistido nesta evidencia. A origem do dado observado e o DOM da pagina real; nao sao mocks nem screenshots reconstruidas.

Revisao publicada confirmada posteriormente por EV-REMOTE-01: `974adae7cde3b1d02eec09fb7abf2b065df3a153`. Revisao do checkout: `9acb0592f57db6299594035b1a17e4c0160a67af`. Diferencas em [versao-publicada](../versao-publicada.md). OBS comprova renderizacao/abertura, nao exatidao numerica nem persistencia.

## Rotas

| ID | URL solicitada | Resultado observado |
|---|---|---|
| EV-NAV-00 | `/gestao-frota` | Pipeline com cinco macroetapas, metricas e filtros; havia registros e pendencias de documentos/retorno. |
| EV-NAV-01 | `/` | Dashboard operacional, mapa, caixa por caminhao, pendencias e tabela de frota. |
| EV-NAV-02 | `/veiculos` | Lista, busca/status/UF e colunas de cadastro; colunas de vinculo mudam apos carregar configuracao. |
| EV-NAV-03 | `/motoristas` | Lista, abas Todos/Ativos/Inativos, busca e acoes. |
| EV-NAV-04 | `/carretas` | Lista Carretas, filtros e tabela de metadados/vinculo. |
| EV-NAV-05 | `/clientes` | Cadastro unificado, filtros de papel/status e tabela. |
| EV-NAV-06 | `/produtos` | Lista, busca, status e acao Novo produto. |
| EV-NAV-07 | `/abastecimentos` | Abas Abastecimentos/Por frete; ranking e filtros de placa/data/posto. |
| EV-NAV-08 | `/historicos` | Pagina, filtros de caminhao e datas; registros/anexos individuais nao abertos. |
| EV-NAV-09 | `/mapa` | Mapa, lista/filtros e controle de sincronizacao; nao sincronizado. |
| EV-NAV-10 | `/frotak-ia` | Chat e entrada Pergunte a Frotak IA; nao enviado texto, nao iniciado audio. |
| EV-NAV-11 | `/manual` | Busca, indice e grupos; artigos e mobile detalhados abaixo. |
| EV-NAV-12 | `/usuarios` | Lista de acessos do workspace; dados pessoais omitidos. |
| EV-NAV-13 | `/financeiro` | Painel, periodo, obrigacoes, evolucao mensal, caixa e alertas. |
| EV-NAV-14 | `/financeiro/fluxo-caixa` | Realizado, direcao, consolidado, CSV; movimentos/temporal e proximos compromissos apos carga. |
| EV-NAV-15 | `/financeiro/dre` | DRE Geral e DRE por caminhao; periodo/base/apropriacao. |
| EV-NAV-16 | `/financeiro/rentabilidade` | Periodo/operacao, ranking, atencao e resultado. |
| EV-NAV-17 | `/financeiro/contas` | Bancos e Caixas e botao Nova conta. |
| EV-NAV-18 | `/financeiro/salarios` | Salarios, competencia e filtros de funcionario/funcao/centro/status; apos carga confirmada em revisita. |
| EV-NAV-19 | `/financeiro/recorrencias` | Despesas Recorrentes, competencia, Gerar competencia e Nova despesa; nenhuma geracao acionada. |
| EV-NAV-20 | `/financeiro/plano-contas` | Gerenciais e Nova conta, confirmado em revisita apos carga. |
| EV-NAV-21 | `/financeiro/centros-custo` | Apropriacoes e Novo centro. |
| EV-NAV-22 | `/lucros-despesas` | Mesma tela de rentabilidade, sem redirect obrigatorio. |
| EV-NAV-23 | `/vinculacao` | Encaminhou para `/gestao-frota`. |
| EV-NAV-24 | `/remetentes` | Encaminhou para `/clientes`. |
| EV-NAV-25 | `/destinatarios` | Encaminhou para `/clientes`. |
| EV-NAV-26 | `/login` (IAB separado) | Encaminhou ao login central `https://login.frotak.log.br/login`, com formulario de entrada; nao efetuado login nem encerrada sessao Chrome. |

Foram observadas 27 URLs de interface, contando aliases e redirects. `/financeiro` e sua declaracao de index `/financeiro/` correspondem ao mesmo destino observado; nao contar como duas telas navegadas. Resultado inicial vazio logo apos goto nao foi tratado como pagina carregada: foram feitas esperas e revisitas. As contagens de linhas de negocio foram descartadas das evidencias.

## Superficies e variantes

| ID | Superficie | Acao observada e limite |
|---|---|---|
| EV-SUP-01 | Criar frete individual | Abriu modal com origem/destino/produto, preco, CIF/FOB, prazo, trator/motorista/implemento. Fechado sem dados. |
| EV-SUP-02 | Criar frete em grupo | Mudou modalidade, mostrou dados comerciais e selecao/filtro de caminhoes. Nenhum selecionado/enviado. |
| EV-SUP-03 | Tiro longo | Mostrou trator/motorista, lista de trechos e Adicionar frete a rota; nenhum trecho enviado. |
| EV-SUP-04 | Novo veiculo | Abriu campos de metadados, placa/Renavam/situacao/localizacao; cancelado. |
| EV-SUP-05 | Novo motorista | Abriu nome/telefone/CNH/ativo; cancelado. Salvar teria efeito de provisionamento. |
| EV-SUP-06 | Novo cliente | Abriu identificacao, papeis, localizacao, Maps/CEP/endereco/UF; cancelado. Busca externa nao executada. |
| EV-SUP-07 | Novo produto | Abriu nome/status; cancelado. |
| EV-SUP-08 | Nova carreta | Abriu sequencia/metadados/identificador/Renavam/implemento; cancelado. |
| EV-SUP-09 | Aba Por frete em abastecimentos | Troca confirmada; exige selecao do caminhao/ciclo, sem alterar dados. |
| EV-SUP-10 | Nova conta financeira | Labels nome/tipo/banco/agencia/conta/saldo/data/ativo; fechado sem salvar. |
| EV-SUP-11 | Novo gerencial | Codigo/nome/pai/tipo/classificacao DRE/ativo; fechado. |
| EV-SUP-12 | Nova apropriacao | Codigo/nome/pai/ativo; fechado. |
| EV-SUP-13 | Funcionario financeiro | Nome/motorista/funcao/salario/pagamento/conta/apropriacao/admissao/ativo/notas; fechado. Nao e criar Auth user. |
| EV-SUP-14 | Nova recorrencia | Tipo/estado/nome/favorecido/referencias/categoria/apropriacao/valor/frequencia/vencimento/periodo/geracao/notas; fechado. |
| EV-SUP-15 | Novo usuario | Nome/login/setor/role/telefone/senha temporaria; cancelado sem preencher. |
| EV-SUP-16 | Aba DRE por caminhao | Selecao ativa confirmada, campos de caminhao/apropriacao/base/periodo. |
| EV-SUP-17 | Coluna documental expandida | Clique no titulo Aguardando CT-e/MDF-e abriu dialog da etapa. Registro/detalhe nao aberto antes do bloqueio do browser. |
| EV-SUP-18 | Artigos de suporte | 135 details encontrados e 135 abertos por cliques reais; teste final confirmou expanded=135/total=135. Isso verifica expansao, nao cada instrucao de negocio. |
| EV-SUP-19 | Busca vazia do suporte | Texto sintetico sem resultado produziu zero artigos e heading Nenhum topico encontrado; busca limpa depois. |
| EV-SUP-20 | Shell/manual mobile | Viewport 390x844, menu Abrir menu visivel e sidebar desktop oculta; sem overflow horizontal da pagina nessa verificacao. |
| EV-SUP-21 | Menu mobile | Sheet aberto com titulo e 13 links; fechamento observado, viewport restaurado. |

As 21 verificacoes nao sao 21 componentes unicos: incluem variantes, abas e estados. Declaracoes SUP incluem wrappers Dialog/DialogContent e templates que renderizam muitos artigos; nao usar o quociente 21/70 como percentual de cobertura.

## Bloqueios e exclusoes

- BLQ-NAV-TITLES: `/financeiro/pagar`, `/financeiro/receber` e os dois aliases nao abertos, pois o effect `generateDueFinancialRecurringDocuments` pode escrever titulos ao montar a tela. Inspecionados pelo codigo.
- NE-API: POST Sascar e dispatch push nao executados, pois escrevem/invocam integracoes e podem enviar notificacoes.
- NE-WRITE: nenhum formulario enviado, arquivo carregado, baixa/estorno/exclusao/status/retorno efetuado, usuario criado ou permissao alterada.
- NE-PROFILES: perfis alternativos/tenants/configuracoes nao foram trocados para satisfazer cobertura. A sessao disponibilizada so prova o proprio perfil.
- BLQ-BROWSER-01: na continuacao a ferramenta informou que uso do navegador local estava desabilitado nas configuracoes do Work. A inspeção adicional do detalhe foi interrompida nesse ponto; nao houve tentativa de contornar a restricao. Evidencias anteriores continuam validas no alcance descrito.
- NE-EVIDENCE-IMAGE: nao foram salvas capturas integrais contendo dados reais; evidencias sao extratos DOM sanitizados e registros das acoes observadas.
