# Retomada, agentes e reconstrucao segura

Este e um roteiro de manutencao documental, nao autorizacao para alterar ambientes. Estado e limites em [CHECKPOINT](CHECKPOINT.md); topologia em [arquitetura](arquitetura.md).

## RUN-01: recuperar o contexto certo

1. Confirmar raiz Git, branch, HEAD e alteracoes locais. O nome do repositorio contem master, mas o produto auditado esta em `central-dias-main`. Nao presumir que o deploy acompanha o HEAD local.
2. Ler `AGENTS.md`, `.frotak/RESUME.md` e `.frotak/project.json` da raiz e do Cliente. O manifesto raiz identifica Master; o manifesto interno identifica Cliente. As limitacoes historicas dos manifests nao substituem o checkpoint desta auditoria.
3. Ler somente os contratos e skills necessarios ao modulo. Fontes canonicas ficam em `.frotak/knowledge/` e `.agents/skills/`; nao criar outra copia editavel aqui.
4. Consultar o documento do modulo, IDs ROT/CTL/SUP e regra RULE correspondente. Abrir o handler e seguir o servico/RPC ate banco ou integracao. Referencias candidatas do inventario precisam de confirmacao humana.
5. Registrar revisao, ambiente, acao executada e evidencia nova. OBS de producao nao equivale a TEST do checkout; TEST isolado nao prova integracao externa.

## RUN-02: selecao de skills

| Trabalho | Skill/contrato a consultar | Evidencia minima antes de concluir |
|---|---|---|
| Retomada ou troca de modulo | context-manager + governanca | Pasta/produto/revisao/ambiente e limite de acesso |
| Schema, tenant, APIs ou integracoes | architecture-guardian + skill Supabase quando aplicavel | Caminho completo, RLS/owner, consumidores e falhas |
| Frontend do Cliente | design-system-guardian + contrato visual interno | Preservacao de handlers/permissoes, componentes compartilhados, desktop/mobile e verificacoes exigidas no AGENTS |
| Mudanca de comportamento | verification-guide | Testes proporcionais ao risco, diferenciando contrato, fixture, E2E e integracao real |
| Atualizacao deste pacote | documentation-manager | Fonte canonica, IDs, links, revisao e evidencias consistentes |
| Interrupcao/transferencia | session-handoff | Concluido, pendencias, proxima acao, Git e comandos/resultados reais |

FrotaK Agents sao papeis e contratos que orientam o executor; a instalacao nao comprova varios modelos trabalhando em paralelo. Estado operacional pode existir no portal/CLI e nao foi certificado nesta auditoria. Nao houve revisao independente nem nova sessao operacional Jaxx criada; nenhum arquivo de controle existente foi substituido.

## RUN-03: navegacao sem efeitos de negocio

Antes de abrir uma rota, verificar efeitos de montagem, loaders, timers e handlers de sincronizacao. O caso concreto BLQ-NAV-TITLES mostra que ate uma visita pode gerar titulos. Ver [efeitos-automaticos.json](inventarios/efeitos-automaticos.json), [navegacao](evidencias/navegacao.md) e [integracoes](integracoes.md).

Inspecionar formularios ate a confirmacao sem salvar. Nao ativar microfone/push, sincronizar rastreador, enviar documentos/mensagens, gerar recorrencias ou executar acoes IA para completar cobertura. Nao exportar dados pessoais como evidencia. Usar nomes de campos, estados e contagens sanitizadas; valores reais nao sao necessarios para documentar um controle.

## RUN-04: reconstrucao em ambiente isolado

| Etapa | Preservar/verificar | Nao presumir |
|---|---|---|
| Fonte | Revisao escolhida, lockfile, rotas geradas, public/assets, Vite/Nitro/Lovable | Checkout local igual ao deployment atual |
| Runtime | Versoes dos manifestos e comandos do package.json | Dependencias instaladas certificam build |
| Configuracao | Nomes e origem de variaveis publicas/servidor, modo Vite, URL de destino | localhost ou arquivo com nome local significa banco isolado |
| Banco | Sequencia de migrations, objetos atuais e divergencias de versao/nome | Inventario lexical e dump executavel/final do schema |
| Identidade | Auth, memberships, roles e vinculos de tenant em fixtures separadas | Seed antigo e forma segura de entrar em producao |
| Integracoes | Auth/Storage/Realtime, cron, workers e terceiros em sandbox ou desabilitados | Mock, toast ou registro de job demonstra entrega real |
| Contratos externos | App motorista, Master/SSO, documentos e consumidores de RPC | Frontend desses produtos esta integralmente neste diretorio |
| Regressao | Matriz de fluxos, calculos, concorrencia, isolamento e falhas parciais | 19 testes locais ou inventario de controles garantem ausencia de regressoes |

Execucao de migrations/seeds/escritas exige autorizacao e destino isolado comprovado. Nao inclui copiar dados de producao. Metadados e hashes de funcoes ajudam na comparacao, mas nao constituem backup restauravel de todos os objetos.

## RUN-05: atualizar os inventarios

Os geradores abaixo foram preparados para os dois snapshots desta auditoria, nao como ferramenta generica de atualizacao continua. Sem `--revision`, `inventory.mjs` substitui o inventario base com o checkout; com `--revision`, escreve no diretorio fixo `deploy-974adae`. Nao os rode indiscriminadamente em uma revisao nova: primeiro adapte o destino, os comparadores e o registro de cobertura para preservar o historico.

Com os snapshots preservados, da raiz do repositorio, Node e dependencias locais ja disponiveis, a checagem estrutural pode ser executada com:

```powershell
node docs/frotak-cliente/tools/verify.mjs
```

Esses scripts escrevem somente o pacote documental. O primeiro le o checkout; o segundo le objetos Git existentes. `verify.mjs` usa evidencias remotas previamente salvas e nao as atualiza: resultado positivo nao comprova que o banco/deploy continuam iguais. Ao mudar a revisao, revisar comparadores e cobertura OBS manualmente; nao copiar certificacao de outra versao.

Os dados de evidencia sanitizada devem permanecer separados de logs brutos, credenciais e dados pessoais. Mudancas no contrato ou no comportamento exigem atualizar a fonte do modulo e a regra correspondente, nao apenas regenerar JSON.
