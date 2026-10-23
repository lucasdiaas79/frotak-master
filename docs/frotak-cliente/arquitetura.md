# Arquitetura e onboarding

Referencia: [checkpoint](CHECKPOINT.md). Status deste documento: COD, com observacoes de interface referidas por EV-NAV. Caminhos de codigo sao relativos a raiz do repositorio.

Atualizacao de evidencia: o deploy usa revisao posterior ao checkout; [versao-publicada](versao-publicada.md) documenta as alteracoes de IA, voz e push. Catalogos do Supabase vinculado foram consultados por leitura, sem executar funcoes de negocio. Os testes locais permanecem associados exclusivamente ao checkout.

## ARCH-01: limites do produto

`central-dias-main` e o FrotaK Cliente compartilhado por tenants. A raiz hospeda o Master e a pasta `supabase/` compartilhada. O app motorista e um consumidor externo: existem contratos SQL e provisionamento no checkout, mas isso nao comprova presenca do frontend atual do motorista. O frontend publicado em `centralnovo.vercel.app` foi uma referencia historica e nao e a fonte desta auditoria.

```mermaid
flowchart LR
  Master[Master: login e provisionamento] -->|SSO| Layout[Cliente: AppLayout]
  Layout --> UI[Rotas React / TanStack]
  UI --> Store[Zustand useFleet]
  Store --> Services[services: CRUD, mappers, RPC]
  Services --> DB[(Supabase Postgres + RLS)]
  DB -->|Realtime| Store
  UI --> Fin[financial: RPCs de relatorios e titulos]
  Fin --> DB
  UI --> SF[Server functions: IA, usuarios, geocoding]
  SF --> DB
  SF --> Gemini[Gemini e pesquisa externa]
  UI --> API[/api/sascar/sync]
  API --> Sascar[Sascar SOAP]
  API --> DB
  Motorista[App motorista externo] -->|RPC, Storage e Realtime| DB
  Cron[pg_cron + pg_net] --> DB
  Cron --> API
```

## ARCH-02: runtime

Fonte: `central-dias-main/package.json`, `vite.config.ts`, `src/router.tsx`, `src/routes/__root.tsx`.

| Camada | Implementacao existente | Contrato de manutencao |
|---|---|---|
| Aplicacao | React 19, TypeScript, TanStack Router/Start, Vite 7, Nitro | Rotas por arquivos; server functions compiladas pelo Start, nao sao apenas funcoes do browser. |
| Build | `@lovable.dev/vite-tanstack-config`, `nitro/vite` | Config Lovable ja injeta plugins e alias; duplicar plugins pode quebrar build. Cloudflare desabilitado explicitamente. |
| Estado | Zustand `src/lib/store.ts` | Fonte operacional central; CRUD delega a services e mappers. |
| Dados | Supabase JS, Auth, PostgREST/RPC, Realtime, Storage | Diferenciar cliente com JWT do cliente administrativo de servidor. |
| UI | Tailwind 4, Radix, componentes compartilhados, lucide | Contrato visual em `central-dias-main/AGENTS.md`; nao copiar regras visuais aqui. |
| Operacao | dnd-kit, Leaflet, datas, formatos | Drag abre fluxo manual; posicao nao e avancar etapa automaticamente em todos os casos. |
| Exportacao | jsPDF, JSZip, Blob/CSV | Downloads podem conter dados de negocio; nao foram gerados nesta auditoria. |
| IA | `@google/genai`, server functions, Web Audio/Live | Tokens efemeros para voz; financeiro da IA exige owner. |

As versoes acima sao as declaradas no manifesto. O lockfile e a referencia de resolucao; nao houve instalacao ou atualizacao de dependencias.

## ARCH-03: entrada, sessao e tenant

1. `__root.tsx` instala shell, `AppLayout`, notificacoes, pagina 404 e service worker apenas em producao.
2. `/login` e um redirecionador (`login.tsx:5`), nao o formulario descrito no README antigo. Processa parametros SSO da query/hash e encaminha ao Master quando ausentes.
3. `auth.ts::acceptMasterSsoFromUrl` tenta persistir a sessao Supabase com refresh token; mantem tambem sessao local e remove parametros da URL. O fallback merece revisao de seguranca, ver GAP-AUTH-01.
4. `getProfile` busca profile, memberships ativas, workspace e tenant. Prefere workspace salvo, depois o tenant do profile, depois primeiro membership. Owner e obtido do membership, nao do nome do usuario.
5. `AppLayout` carrega acesso financeiro, inicializa store/realtime e monta menus. Esconder item de menu nao equivale a bloquear API.

## ARCH-04: sincronizacao e caches

`store.ts` tem TTL de carga completa de 120 s, reconciliacao por dominio de 60 s e verificacao a cada 30 s. Deduplica requisicoes, acompanha versoes para respostas concorrentes e usa cleanup de canais compartilhados. Eventos Realtime disparam recargas por dominio; reconexao, foco e visibilidade complementam a entrega. Nao tratar o websocket como unica garantia de frescor.

Financeiro: `getFinancialAccess` usa cache por usuario/workspace de 60 s e valida novamente o contexto ao concluir a requisicao. `FinancialModule.tsx::useFinancialRealtimeVersion` observa documentos e jobs, agrupa eventos por 250 ms e reconcilia em foco/visibilidade/timer. Relatorios deduplicam requisicoes identicas. Migração de publicacao nao comprova que os canais estejam operacionais em producao.

## ARCH-05: ambientes e execucao segura

Na verificacao inicial nao havia servidor local nas portas 5173/5174/4180. `.env.local` nao continha as duas variaveis publicas Supabase; tampouco foram encontradas essas variaveis no ambiente herdado consultado. Existem `.env.runtime.local` e `.env.vercel.local`, mas o Vite em modo development nao os carrega automaticamente com esses nomes. Scripts, modos customizados e outro terminal podem mudar isso.

`hasSupabaseConfig()` testa somente presenca de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, nao autenticidade ou isolamento do destino. Sem elas, `shouldUseLocalTenantData()` habilita frota local; varias funcoes financeiras e server functions continuam exigindo backend. Logo, localhost nao certifica ambiente de testes completo nem banco isolado. Nenhum servidor foi iniciado nesta etapa; a navegacao usou a sessao remota existente, somente em superficies previamente consideradas de leitura.

Onboarding recomendado:

1. Confirmar Git, pasta do Cliente e `AGENTS.md`, `.frotak/RESUME.md`, `.frotak/project.json` do Cliente.
2. Ler [permissoes](dados-permissoes.md), [integracoes](integracoes.md) e efeitos automaticos antes de abrir rotas em ambiente real.
3. Conferir nomes e origem das variaveis, sem imprimir valores. Usar projeto isolado para testes mutaveis; nao executar seeds antigos para obter acesso.
4. Consultar `package.json` para comandos. Nesta auditoria foram executados somente `test:frotak-ai` e `test:visual`, previamente inspecionados como testes sem escrita externa.
5. Para reconstruir: recuperar lockfile, assets/public, config Vite/Nitro, esquema compartilhado em ordem e configuracao de Auth/Storage/Realtime/jobs. Isso exige ambiente separado e autorizacao propria; nao e uma receita para executar contra producao.

## Fontes historicas

`README.md`, `DOCUMENTACAO_TECNICA.md` e `DEPLOY_PRODUCAO.md` do Cliente continuam disponiveis. Tratam parcialmente de arquitetura anterior e seeds. Os documentos financeiros da fase 1 sao historicos de implantacao; automacoes descritas la como futuras aparecem implementadas em migrations posteriores. Manifestos FrotaK Agents declaram que papeis de agentes nao sao modelos executando automaticamente. Nao foi localizado checkpoint operacional Jaxx atual nas pastas consultadas; preservar os arquivos existentes, nao presumir aprovacoes antigas.
