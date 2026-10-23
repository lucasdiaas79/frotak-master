# FrotaK Cliente: engenharia reversa documental

Auditoria realizada em 2026-10-19. Checkout auditado: `central-dias-main/` do repositorio `lucasdiaas79/frotak-master`, branch `main`, commit `9acb0592f57db6299594035b1a17e4c0160a67af`. Naquela verificacao, o dominio real usava `974adae7cde3b1d02eec09fb7abf2b065df3a153`; ambas as revisoes foram inventariadas separadamente. Sao retratos historicos, nao comprovacao da versao publicada hoje.

Este diretorio documenta o **Cliente**, nao a aplicacao Master da raiz. A referencia de schema compartilhado e `supabase/migrations/` da raiz; as migrations antigas de `central-dias-main/supabase/` exigem tratamento historico. Nao executar seeds ou migrations como parte da leitura deste manual.

## Para que usar

- **Onboarding:** entender onde cada funcionalidade mora antes de trabalhar no Cliente.
- **Manutencao e diagnostico:** seguir uma tela ate handler, servico, RPC, banco ou integracao e localizar seus efeitos.
- **Agentes/skills:** fornecer contexto verificavel e carregar apenas o modulo necessario, sem tratar relatos anteriores como prova.
- **Refatoracao:** identificar contratos, calculos, permissoes e consumidores que precisam ser preservados; planejar regressoes antes de mudar codigo.
- **Reconstrucao:** orientar o levantamento de dependencias em ambiente isolado. Este pacote nao e backup, dump restauravel ou especificacao exaustiva certificada.

Nao e o manual de uso publicado em `/manual`, nao e carregado automaticamente pela Frotak IA e nao habilita agentes ou integracoes. O envio ao GitHub apenas versiona os documentos para consulta da equipe.

## Como usar na pratica

1. Leia [CHECKPOINT](CHECKPOINT.md) para conhecer revisoes, cobertura, exclusoes e pendencias.
2. Confirme a pasta `central-dias-main`, o commit atual e o ambiente. Compare com a revisao auditada; linhas e comportamentos podem ter mudado.
3. Consulte [arquitetura](arquitetura.md), [permissoes](dados-permissoes.md) e o [modulo](modulos/README.md) afetado.
4. Procure a rota/controle nos inventarios. Siga seus IDs ate a regra, o handler e o servico/RPC; confirme o caminho no codigo atual. Associacao por import e candidata, nao prova de execucao.
5. Antes de mudar algo, leia [rastreabilidade](rastreabilidade.md) e [lacunas](impacto-lacunas.md). Defina testes de erro, isolamento, concorrencia e efeitos em outros modulos.
6. Apos uma mudanca autorizada, atualize a fonte documental correspondente e registre nova revisao, data, verificacao e limites. Nao sobrescreva evidencia historica como se fosse atual.

Exemplo: para investigar titulos a pagar, comece em `modulos/financeiro.md`, localize `MOD-FIN-TITLES`, siga a rota ate `FinancialModule.tsx` e os servicos financeiros; confira RPCs e efeitos de recorrencia antes de abrir a tela em producao. O commit posterior `7fe8940`, de 2026-10-22, corrigiu o formato de data dessas chamadas; essa correcao nao integra os dois snapshots de 2026-10-19.

## Instrucao para agentes e desenvolvedores

Use este roteiro ao iniciar uma tarefa:

> Leia AGENTS.md e os manifests FrotaK do produto correto. Consulte docs/frotak-cliente/README.md e CHECKPOINT.md, depois apenas o modulo afetado. Confirme as regras no codigo da revisao atual; preserve tenant, permissoes e contratos externos. Diferencie codigo, observacao, teste e inferencia. Nao execute migrations, seeds, acoes mutaveis ou deploy com base apenas nesta documentacao. Registre evidencias novas e pendencias sem alegar completude ou revisao independente inexistentes.

Nao copie logs brutos, tokens, credenciais ou dados pessoais para esta pasta. Catalogos remotos salvos sao metadados sanitizados, nao consultas livres aos dados de clientes.

## Indice

- [Checkpoint e cobertura](CHECKPOINT.md)
- [Arquitetura e onboarding](arquitetura.md)
- [Retomada por agentes e reconstrucao segura](onboarding-agentes.md)
- [Versao publicada e diferencas](versao-publicada.md)
- [Dados, isolamento e permissoes](dados-permissoes.md)
- [Integracoes e execucoes externas](integracoes.md)
- [Padroes compartilhados](padroes.md)
- [Modulos e telas](modulos/README.md)
- [Rastreabilidade e contratos de regressao](rastreabilidade.md)
- [Impacto, lacunas e divergencias](impacto-lacunas.md)
- [Inventarios estruturados](inventarios/README.md), [navegacao real](evidencias/navegacao.md) e [verificacoes](evidencias/verificacao.md).

## Leitura e manutencao

Comece pelo checkpoint, arquitetura e permissoes. Depois use o inventario de rotas para localizar o modulo; o inventario de controles aponta o componente e a linha de cada declaracao encontrada. IDs `ROT`, `CTL`, `SUP`, `FLOW`, `RULE`, `INT`, `EV` e `GAP` sao referencias cruzadas, nao indicadores de validacao.

Rotulos de evidencia: **COD** confirmado por leitura do codigo; **OBS** observado na interface; **TEST** teste executado e identificado; **HIST** relato/documento anterior; **INF** inferencia; **NE** nao executado; **BLQ** bloqueado. Uma declaracao JSX inventariada nao comprova que o controle foi renderizado, acionado ou testado.

Fontes canonicas anteriores continuam em seus locais: `central-dias-main/docs/FINANCIAL_FOUNDATION_PHASE1.md`, `central-dias-main/docs/FINANCIAL_RECURRING_SCHEDULER.md`, manifests `.frotak`, `AGENTS.md`, contratos e testes. Aqui ficam referencias e diferencas verificadas, sem copiar essas fontes integralmente.
