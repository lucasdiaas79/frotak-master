# Padroes compartilhados de interface e rastreio

## UI-01: shell e estados

`AppLayout.tsx` implementa sidebar expansivel, grupos operacionais/cadastros/financeiro/administracao/suporte, cabecalho, busca global, notificacoes, tema, perfil e navegacao mobile. `__root.tsx` inclui 404 e Toaster. `PageHeader`, `Modal`, `components/frotak/*` e `components/ui/*` concentram geometria e interacoes. Contrato visual canonico: `central-dias-main/AGENTS.md` e `.frotak/knowledge/global/visual.md` do Cliente.

Busca global cruza registros carregados e oferece navegação/foco; nao e busca em todo banco remoto. Tema e recolhimento sao preferencias de browser. Sair limpa sessao/cache e redireciona para login central. Nao foram acionados logout ou preferencias nesta auditoria.

Os inventarios registram `disabled`, `open`, validacoes condicionais e handlers. Campos sem atributo HTML `required` podem ter validacao obrigatoria no handler e banco; ausencia do atributo nao significa opcional. Colunas/acoes podem desaparecer depois da carga assincrona de configuracao do tenant (modo de vinculo de ativos).

## UI-02: padrao de acao

| Tipo | Fluxo comum | Evidencia necessaria para afirmar sucesso |
|---|---|---|
| Filtro/aba | Estado React -> derivacao local ou nova consulta -> lista/KPI | Resultado/estado selecionado observado. Nao modifica negocio. |
| Novo/editar | Abre modal -> alteracao local -> salvar -> service/RPC -> refresh/fechar | Nesta auditoria observado apenas abrir/fechar; persistencia NE. |
| Excluir/arquivar | Selecionar registro -> confirmacao/motivo -> delete ou RPC -> recarga | Confirmacao inspecionada em codigo; envio NE. Arquivar e excluir nao sao equivalentes. |
| Documento | File picker -> validar -> Storage -> metadados -> status/evento -> UI | Upload real NE; URL assinada nao prova arquivo baixavel indefinidamente. |
| Exportar | Derivar selecao -> fetch anexos/Blob/ZIP/PDF -> download | NE para evitar copiar dados reais; logica COD. |
| Operacao manual | Drag/acao -> dialog com informacao/motivo -> RPC -> flags/eventos/status | Mover visualmente nao equivale a executar a transacao. |
| Financeiro | Modal -> validacao de acesso/valor/referencias -> RPC -> razao/saldos -> recarga | Totais da tela nao foram reconciliados com ledger real. |

## UI-03: erros e carregamento

Frota possui `loading/error` central, com preservacao de dados em recargas silenciosas. Historico/abastecimentos consultam dados em effects com estado loading/erro e filtros. Financeiro usa guard de acesso, placeholders de carga, mensagens de erro/vazio e permissoes por operacao. Usuario tem fallback proprio. Estados especificos estao nos modulos e em `inventarios/efeitos-automaticos.json`, `validacoes.json`, `feedback.json`.

Ha handlers que disparam promises sem `await` e exibem sucesso imediatamente (ex.: salvar carreta, algumas exclusoes/vinculos de cadastro). Isso e comportamento confirmado no codigo, nao prova de persistencia. Uma refatoracao deve separar preservacao de contrato e eventual correcao aprovada.

## UI-04: responsividade e acessibilidade

Codigo usa breakpoints Tailwind, sidebar/Sheet mobile, tabelas com min-width e overflow horizontal, formularios em grid e modais limitados a viewport. A existencia dessas classes nao certifica ausencia de overflow. A auditoria documenta o viewport observado e os checks efetivamente executados; fluxos por toque, teclado, leitores de tela e todos os breakpoints continuam como testes pendentes quando nao houver EV especifica.

## TRACE-01: como seguir um controle

1. Localizar rota em `rotas.json`; `rotas-componentes.json` associa imports transitivos, nao ramos renderizados.
2. Localizar `CTL-*` em `controles.json` e `SUP-*` em `superficies.json` por source/owner. `attributes` guarda campos, limites, condicoes e callbacks; `handlers` guarda a expressao do evento, possivelmente abreviada.
3. Abrir source:line para detalhes. `simbolos.json` lista chamadas por funcao; `validacoes.json` aponta guards; `feedback.json` aponta retorno de UI.
4. Seguir `chamadas-dados.json` e `rpc-sql-rastreio.json` ate todas as definicoes SQL. Nomes RPC dinamicos exigem leitura dos mapas de dispatch.
5. Cruzar `rastreabilidade.md` e evidencias. Nao promover COD para TEST/OBS por proximidade no grafo.

`CTL/SUP/ROT` sao calculados por arquivo/contexto/tag/rotulo e ordinal entre duplicatas; nao dependem de numero de linha. Renomear/remover e reinspecionar um controle pode exigir registrar alias de ID na proxima revisao. Fontes dinamicas, templates repetidos e componentes abstratos geram uma declaracao, nao uma contagem de instancias.
