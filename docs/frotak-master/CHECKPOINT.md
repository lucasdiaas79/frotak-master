# Checkpoint · Master modular e liberação por cliente

Atualizado em 2026-11-04. Escopo: Fase 1 do PDF "FrotaK Master · Arquitetura", adaptada ao Supabase compartilhado atual (decisão do usuário em 2026-10-31). Detalhes em [arquitetura-modular](arquitetura-modular.md).

## Git e ambiente

| Item | Estado |
|---|---|
| Base | `main` @ `92a7213` (igual a `origin/main` em 2026-11-02) |
| Branch | `feat/master-modulos-por-cliente`, commits locais, **sem push** |
| Commits | `0cc1f2a` Master modular e liberação; `1f98144` registro de módulos do TMS; `659faef` Frotak IA; `e77489b` Rastreadores; `08de70b` App Motorista; `cad1469` Financeiro; `0643e97` Gestão de Frota; `df82eec` documentação; clean architecture: `848b3ab` App Motorista e guarda de dependências, `b99e26b` Rastreadores, `e7cdebc` Financeiro, `66b3851` Gestão de Frota, `4008c4c` Frotak IA |
| Teste de ponta a ponta | Supabase local descartável (`project_id` `frotak-e2e`, portas 553xx) criado do zero e removido no fim |
| Banco remoto e banco local `frota-master` | Não alterados |
| VPS de banco e de Serviço | Instaladas em 2026-11-04 com a versão `d04bede`, sem dados de cliente. Ver [Ambiente nas VPS](#ambiente-nas-vps-2026-11-04) |
| VPS View | Não alterada: só aceita chave SSH, e a credencial recebida não entra |

## Concluído

1. Migration `202610310001_master_product_module_entitlements.sql`: produtos (`tms`, `view`), produtos por cliente, módulo `driver_app`, backfill que preserva o acesso atual, bloqueio por módulo no financeiro e no app motorista, leitura de liberações, comandos auditados do Master e contagem de uso.
2. Master em `src/core` e `src/modules/{catalog,entitlements,tenants,provisioning}`. Toda server function exige login da equipe FrotaK.
3. Tela Clientes com a ficha "Gerenciar" (produtos e módulos), cadastro com produtos e módulos, estados de erro e vazio, contagens reais.
4. Cliente: menu, rotas e servidor obedecem às liberações. Sem TMS ou com o cliente suspenso, o menu fica só com Ajuda e a barra inferior do celular some; Suporte continua acessível.
5. TMS separado em módulos (`src/modules/{fleet-core,financial,frotak-ai,frotak-tracking,driver-app,cte-issuance}`), cada um com manifesto e camadas `domain`, `application`, `infrastructure`, `api` e `ui`. Menu e bloqueio de rota vêm do registro de módulos. As rotas ficaram finas. Um commit por módulo.
6. Clean architecture no TMS: casos de uso e portas em `application/`, adaptadores em `infrastructure/`, composição em `api/` e `container.ts`. Rastreador, modelo de IA e envio de push ficam atrás de portas, então um fornecedor novo é um adaptador novo. O lint barra import fora da regra, e `npm run test:modules` testa os casos de uso com portas falsas, sem banco e sem rede.

## Verificações executadas

**Banco (Supabase local criado do zero):** as 72 migrations do repositório aplicaram, inclusive a nova, com um ajuste só no ambiente de teste (ver Achados). Testes SQL:

| Arquivo | Resultado |
|---|---|
| `master_product_module_entitlements.sql` (novo) | Passou |
| `plan_module_entitlements.sql` (ajustado para 6 módulos) | Passou |
| `authorization_functions`, `identity_rbac_foundation`, `post_apply_identity_audit`, `tenant_provisioning_rpc`, `tenant_workspace_foundation`, `financial_recurring_scheduler` | Passaram |
| `financial_foundation_phase1.sql` | Falhou: exige plano de contas de clientes existentes; o banco vazio não tem nenhum. Não relacionado a esta mudança |

**Navegador (Chrome headless, Master 5173 + Cliente 5174 contra o banco de teste):** 27 verificações OK em três roteiros. As 2 falhas da primeira rodada eram do roteiro, que lia o aviso anterior na tela; as mesmas ações foram refeitas e passaram.

- Master: cliente criado pela tela; chaves ligam e desligam módulos e o produto TMS com o aviso certo; o módulo base não desliga; com o TMS desligado, as chaves dos módulos travam; religar o TMS devolve o estado anterior.
- Server functions do Master chamadas sem login: HTTP 403, sem vazar dados.
- Cliente: menu sem Frotak IA e sem Financeiro quando desligados; `/frotak-ia` e `/financeiro` mostram a tela de bloqueio; religar a IA no Master a devolve ao menu sem deploy; TMS desligado mostra "TMS FrotaK não liberado"; Suporte abre mesmo assim.
- Celular (390 px): ficha Gerenciar e telas de bloqueio sem rolagem horizontal; menu lateral sem os módulos desligados.
- Banco com o token do dono: `get_workspace_entitlements` sem os módulos desligados; `get_financial_access.canView = false`; `financial_documents` vazio.
- App motorista: `get_driver_app_context` responde com o módulo ligado e recusa com `MODULE_DISABLED:driver_app`.
- IA no servidor (`resolveFrotakAiContext`): aceita com o módulo ligado e recusa com `MODULE_DISABLED:frotak_ai`.

**Código:** build OK nos dois apps; `tsc` sem erros novos (6 no Master e 19 no Cliente, os mesmos de antes); lint OK nos arquivos alterados; `test:frotak-ai` com 16 aprovados; `test:visual` com 3 aprovados.

**Separação do TMS em módulos (2026-11-02):** em cada uma das 6 etapas, `tsc` com as mesmas 19 mensagens da base, build OK, `test:frotak-ai` (16), `test:visual` (3) e, a partir do financeiro, `test-financial-recurring.mjs` (6). Os avisos de lint que restam nos arquivos movidos já existiam antes. Depois da última etapa, num banco de teste novo:

- os três roteiros acima rodaram de novo: 29 de 29 verificações OK;
- um roteiro novo abriu as 28 telas do TMS (frota, cadastros, IA, financeiro, Suporte) com o dono do cliente de teste: 28 de 28 sem erro de execução, sem tela de erro e com conteúdo.

**Clean architecture no TMS (2026-11-04), depois da última etapa, num banco de teste novo:**

- `tsc`: 11 mensagens no Cliente, todas anteriores a esta frente (eram 19); nenhuma nova.
- Lint das camadas sem violação nos módulos `driver-app`, `frotak-tracking`, `financial`, `fleet-core` e `frotak-ai`.
- Testes: `test:modules` 30, `test:frotak-ai` 16, `test:visual` 3, `test-financial-recurring` 6. Build OK. Nenhum vestígio de `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `@google/genai` ou `generateContent` no pacote do navegador.
- Os três roteiros de navegador: 29 de 29 verificações OK.
- As 28 telas do TMS: 28 de 28 sem erro.
- IA no servidor: aceita com o módulo ligado e recusa com `MODULE_DISABLED:frotak_ai`.

A Frotak IA foi testada com modelo e ferramentas falsos e com a checagem de módulo no servidor. Não houve chamada real ao Gemini, porque o ambiente de teste não tem a chave.

## Ambiente nas VPS (2026-11-04)

Guia de operação e mapa do PDF para o que foi instalado: [deploy/README.md](../../deploy/README.md). IPs e papéis ficam fora do repositório.

| VPS | O que roda |
|---|---|
| Banco | Supabase em Docker (Postgres 17, Auth, REST, Realtime, Storage, Kong), PgBouncer nativo, backup diário e teste semanal de restauração |
| Serviço | Master e TMS em Node 24 sob systemd, Caddy com HTTPS, Redis, cópia dos backups |
| Rede | WireGuard entre as duas. O banco expõe só SSH; o Serviço, só SSH, 80 e 443 |

O ambiente é **novo e vazio**: a produção atual (Lovable, Vercel e Supabase) continua sendo a que atende os clientes, e nenhum dado foi migrado. Os endereços são temporários, em `*.sslip.io`, até o DNS ser apontado.

Evidências, rodadas contra os endereços públicos:

- Instalação do zero repetida 3 vezes com as 72 migrations mais 2 arquivos de ajuste em `deploy/db/shim`.
- Os três roteiros de navegador: 29 de 29. As 28 telas do TMS: 28 de 28. IA no servidor: aceita e recusa por módulo.
- Realtime: inserção com RLS chegou pelo WebSocket através de Caddy, WireGuard e Kong. Storage: enviar, baixar e apagar; anônimo não baixa.
- API: cadastro público recusado, REST sem `apikey` recusado, anônimo não lê `platform_users`, administração do Realtime bloqueada.
- `pg_cron` chamou o TMS pela internet com HTTP 200. Sem token, `push-dispatch` e `sascar/sync` respondem 401.
- Varredura externa de portas em IPv4 confirmou a tabela acima. O IPv6 foi conferido só pelo firewall e pelas portas em escuta no servidor.
- PgBouncer pela WireGuard aceita e recusa senha errada; Postgres fechado mesmo dentro da WireGuard.
- Backup restaurado em contêiner descartável e conferido com o banco em uso. A chave de backup não abre shell, não baixa e não usa `--delete`.
- Reboot simultâneo das duas VPS: tudo voltou sozinho.

Não testado: chamada real ao Gemini e à Sascar e envio real de push, porque as chaves não estão na instalação, e a restauração completa numa máquina nova.

## Achados fora do escopo

1. **A sequência de migrations não monta um banco do zero.** `20260928091642_workspace_sascar_integrations` usa `public.touch_updated_at()`, que só é criada em `202610150001`. Em produção funciona porque a função veio do projeto antigo. No teste, criei a função num arquivo só da cópia descartável.
2. **Existe uma migration fora do Git.** O banco local `frota-master` tem `202610220001_client_onboarding` (planos TRIAL/STARTER/BUSINESS/ENTERPRISE, `tenant_contracts`, `tenant_migration_requests`), que não está em nenhum branch do GitHub. Ela não colide com a migration nova, mas indica outro fluxo de cadastro de clientes do Master em outro checkout, que pode conflitar com a nova tela Clientes. Confirmar se ela está em produção antes de aplicar.
3. **Jobs do `pg_cron` que um banco novo não recebe.** `financial-recurring-daily` e `financial-integrations-every-5-minutes` só são agendados se o `pg_cron` já existir, mas no repositório a extensão nasce depois, e nenhum erro aparece. Corrigido nas VPS por `deploy/db/shim`. `sascar-sync-every-minute` existe em produção e em nenhuma migration; as VPS o agendam em `db/configure-cron.sh`.
4. **Função que só existe em produção.** `purge_old_vehicle_positions` e o job `vehicle-positions-retention-hourly` estão no retrato do banco remoto e em nenhuma migration. Não instalei nas VPS, porque apaga dados e não tenho a definição nem o prazo. Sem isso, `vehicle_positions` cresce sem limite quando a Sascar for ligada.
5. **HTTP/3.** Com ele ligado, o Chrome numa máquina com antivírus que intercepta TLS falhou com `ERR_QUIC_PROTOCOL_ERROR` e a tela não carregou; sem ele, tudo passou. A causa exata não foi isolada. O Caddy das VPS serve só HTTP/1.1 e HTTP/2.
6. **2FA do Master.** O PDF exige e o código não tem. O Master está exposto na internet só com e-mail e senha.
7. O cabeçalho do menu do celular do Cliente mostra "Central Transportes" fixo para qualquer cliente. Já estava assim antes.

Não houve revisão independente por outro executor.

## Próxima ação

1. Trocar a senha das VPS e instalar chave SSH; a senha circulou em texto e é a mesma nas três.
2. Liberar o acesso à VPS View e decidir o papel dela.
3. Decidir se as VPS substituem a produção atual. Se sim: apontar o DNS, preencher as chaves (Gemini, Sascar, Maps), migrar os dados e implementar 2FA antes de abrir para clientes.
4. Trazer de produção para o repositório `purge_old_vehicle_positions` e resolver a origem de `202610220001_client_onboarding` (`select version from supabase_migrations.schema_migrations order by version desc limit 5;`).
5. Na produção atual: aplicar `202610310001`, publicar Master e Cliente e desligar os módulos que cada cliente não contratou.
