# Inventarios derivados

Gerados por `../tools/inventory.mjs`, executado da raiz com `node docs/frotak-cliente/tools/inventory.mjs`. Escreve apenas nesta documentacao e le fontes do Cliente e migrations da raiz. Nao carrega variaveis de ambiente, nao consulta banco e nao executa codigo do app.

Para a revisao publicada, `node docs/frotak-cliente/tools/inventory.mjs --revision=974adae7cde3b1d02eec09fb7abf2b065df3a153` le objetos Git sem checkout e grava em `deploy-974adae/`. As duas revisoes sao deliberadamente separadas. Arrays sao compactados em uma linha por item para facilitar busca sem despejar fontes inteiras.

| Arquivo | Conteudo e uso |
|---|---|
| `cobertura-estatica.json` | Contagens, revisao/data e limites de extracao. |
| `rotas.json` | 33 declaracoes createFileRoute, IDs, arquivos/linhas e redirects encontrados. |
| `rotas-componentes.json` | Imports transitivos e CTL/SUP candidatos por rota; nao e prova de renderizacao. |
| `controles.json` | Campos, labels/colunas, botoes, links, formularios e componentes com eventos; ID, owner, atributos, handler e condicoes. |
| `superficies.json` | Modais, drawers/sheets, dialogs/popovers, details e wrappers; declaracoes, nao instancias. |
| `matriz-controles.json` | Uma linha por CTL com grupo de rastreabilidade e estados de evidencia. |
| `grupos-rastreabilidade.json` | Fonte/funcao -> regras, guards, simbolos/calls diretos e candidatos importados. |
| `component-data-sources.json` | Candidatos de dados por arquivo, referenciados pelos grupos para evitar repeticao. |
| `validacoes.json`, `feedback.json` | Guards por funcao e mensagens de sucesso/erro; buscar handler referenciado para validacao completa. |
| `simbolos.json`, `imports.json` | Funcao/variavel/chamadas e dependencias; nao usar como prova de codigo morto. |
| `chamadas-dados.json`, `rpc-sql-rastreio.json` | Tables/RPC/Storage/invoke e definicoes SQL candidatas, inclusive historico de redefinicoes. |
| `efeitos-automaticos.json` | useEffect/setInterval e chamadas internas; ajuda a identificar navegacao mutavel. |
| `tipos.json` | Interfaces/unions TypeScript e campos/optional; tipos longos podem estar abreviados. |
| `ambiente-referencias.json` | Nomes de configuracao referenciados diretamente no codigo, sem valores. Acesso dinamico readEnv pode exigir leitura adicional. |
| `sql-declaracoes.json` | CREATE/REPLACE/DROP de tabelas/funcoes/views/triggers/policies/enums/indices/RLS da cadeia raiz. |
| `sql-colunas.json`, `sql-relacoes.json` | Colunas e referencias declaradas; nao consolidam todo ALTER/drop/rename nem banco aplicado. |
| `sql-contratos.json`, `sql-seguranca-jobs.json` | Assinaturas, policy/trigger/checks abreviados e locais de grants/revokes/jobs. Ler fonte completa para contrato executavel. |
| `testes.json` | Arquivos/casos de teste identificados; resultados reais em evidencias, nao aqui. |
| `regras.json`, `rotas-navegacao.json` | Regras revisadas e cobertura de navegacao por declaracao de rota, com excecoes explicitas. |

IDs e conteudos passam por sanitizacao de e-mail, placas, numeros cadastrais e credencial de demo conhecida. Expressao truncada aponta para fonte/linha; nao reconstruir logica executavel copiando essas expressoes. Controles abstratos e condicoes podem aparecer em mais de uma rota e precisam de leitura do componente efetivamente usado.
