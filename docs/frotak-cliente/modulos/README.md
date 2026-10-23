# Modulos e telas

Use [rotas.json](../inventarios/rotas.json) para IDs ROT e localizacao exata. `rotas-componentes.json` relaciona cada rota aos IDs CTL/SUP de seus componentes. Estado observado por rota em [navegacao](../evidencias/navegacao.md); regras transversais em [padroes](../padroes.md).

| Modulo | Documento | Superficies incluidas |
|---|---|---|
| Shell e acesso | [Acesso e administracao](acesso-administracao.md) | Login/SSO, usuarios, busca/notificacoes, sidebar, 404, acesso do motorista |
| Operacional | [Operacao](operacao.md) | Dashboard, pipeline/tabela, detalhe, criacao individual/grupo/tiro longo, documentos, manual move, retorno/arquivamento |
| Cadastros | [Cadastros](cadastros.md) | Veiculos, motoristas, carretas, clientes, produtos, redirects e edicao/vinculo/exclusao |
| Consultas | [Consultas e consumo](consultas-consumo.md) | Historico individual/tiro longo, anexos, exportacao, abastecimento geral/por frete, mapa/foco/detalhe |
| Financeiro | [Financeiro](financeiro.md) | Painel, titulos, baixa/lote, detalhamento, DRE geral/caminhao, caixa/lote, rentabilidade, contas, gerenciais, apropriacoes, folha, recorrencias, diarias |
| IA e ajuda | [IA e suporte](ia-suporte.md) | Chat, voz, ferramentas/dominos, confirmacao, reconexao, orb e manual expansivel |

Cada documento descreve os controles por familia funcional. A referencia individual de cada declaracao, campos, condicoes de renderizacao e handlers e o inventario estruturado, para nao duplicar centenas de linhas de JSX em prosa. A cobertura semantica individual ainda nao deve ser inferida da existencia desse inventario; veja os limites no checkpoint.
