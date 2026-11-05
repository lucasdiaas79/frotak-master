# Checkpoint · Master modular e liberação por cliente

Atualizado em 2026-11-05. Escopo: o PDF "FrotaK Master · Arquitetura" em dois modos: **banco único**, na produção atual (decisão de 2026-10-31), e **um banco por cliente**, nas VPS (pedido do usuário em 2026-11-05). Detalhes em [arquitetura-modular](arquitetura-modular.md).

## Git e ambiente

| Item | Estado |
|---|---|
| Base | `main` @ `92a7213` (igual a `origin/main` em 2026-11-02) |
| Branch | `feat/master-modulos-por-cliente`, commits locais, **sem push** |
| Commits | `0cc1f2a` Master modular e liberação; `1f98144` registro de módulos do TMS; `659faef` Frotak IA; `e77489b` Rastreadores; `08de70b` App Motorista; `cad1469` Financeiro; `0643e97` Gestão de Frota; `df82eec` documentação; clean architecture: `848b3ab` App Motorista e guarda de dependências, `b99e26b` Rastreadores, `e7cdebc` Financeiro, `66b3851` Gestão de Frota, `4008c4c` Frotak IA; `d04bede` documentação; `a7ad7a3` implantação nas VPS; correções de 2026-11-05: `e680637` banco, `a6a6c5d` Master, `18d5e95` TMS, `7a44c93` implantação; banco por cliente: `e92f1d9` agente e VPS de banco, `4c60c58` modelo, `631dce3` e `76f1690` portão, `d7f74ac` API, `3173f4e` Master, `86c40ad` e `5b3c8fd` TMS, `06cbc6e` sessão no TMS, `a596ddd` e `36408a9` ordem do cadastro, `6a107d4` restauração |
| Teste de ponta a ponta | Supabase local descartável (`project_id` `frotak-e2e`, portas 553xx) criado do zero e removido no fim |
| Banco remoto e banco local `frota-master` | Não alterados |
| VPS de banco e de Serviço | Reinstaladas em 2026-11-05 com um banco por cliente, versão `6a107d4`, com um operador e o cliente fictício "FrotaK Demonstração". Ver [Ambiente nas VPS](#ambiente-nas-vps) |
| VPS View | Fora do escopo por decisão do usuário em 2026-11-05. Não alterada |

## Concluído

1. Migration `202610310001_master_product_module_entitlements.sql`: produtos (`tms`, `view`), produtos por cliente, módulo `driver_app`, backfill que preserva o acesso atual, bloqueio por módulo no financeiro e no app motorista, leitura de liberações, comandos auditados do Master e contagem de uso.
2. Master em `src/core` e `src/modules/{catalog,entitlements,tenants,provisioning}`. Toda server function exige login da equipe FrotaK.
3. Tela Clientes com a ficha "Gerenciar" (produtos e módulos), cadastro com produtos e módulos, estados de erro e vazio, contagens reais.
4. Cliente: menu, rotas e servidor obedecem às liberações. Sem TMS ou com o cliente suspenso, o menu fica só com Ajuda e a barra inferior do celular some; Suporte continua acessível.
5. TMS separado em módulos (`src/modules/{fleet-core,financial,frotak-ai,frotak-tracking,driver-app,cte-issuance}`), cada um com manifesto e camadas `domain`, `application`, `infrastructure`, `api` e `ui`. Menu e bloqueio de rota vêm do registro de módulos. As rotas ficaram finas. Um commit por módulo.
6. Clean architecture no TMS: casos de uso e portas em `application/`, adaptadores em `infrastructure/`, composição em `api/` e `container.ts`. Rastreador, modelo de IA e envio de push ficam atrás de portas, então um fornecedor novo é um adaptador novo. O lint barra import fora da regra, e `npm run test:modules` testa os casos de uso com portas falsas, sem banco e sem rede.
7. 2FA obrigatório para a equipe, cobrado no login, no servidor e no banco. Redefinição em `deploy/db/reset-mfa.sh`.
8. "Login como cliente" com credencial de uso único do dono do cliente, registrada em `audit_logs`, e aviso de modo suporte no TMS. O token do operador não sai mais do Master.
9. Frota por módulo: com o TMS desligado, tabelas, RPCs e arquivos da frota deixam de responder pela API.
10. Sequência de migrations monta um banco do zero, com os jobs financeiros, a limpeza de posições de 24 horas e o job da Sascar.
11. Telas fictícias do Master escondidas com `VITE_FROTAK_HIDE_PROTOTYPES=true`; o nome e o logo de um cliente não aparecem mais para os outros; `/api/sascar/sync` sempre exige o cliente.
12. `tsc` sem erros nos dois apps.
13. Um banco por cliente na VPS de banco, criado pelo Master por meio de um agente. Cada cliente tem banco, login, API, chaves e arquivos próprios. Sem `FROTAK_AGENT_URL`, Master e TMS seguem em banco único, como na produção atual.
14. TMS por endereço: `<cliente>.<domínio>` abre o banco daquele cliente, com login próprio em `/login`.
15. Backup e restauração por cliente, sem encostar nos outros. Migrations novas chegam ao modelo, ao Central e a todos os clientes com um comando.

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

## Ambiente nas VPS

Guia de operação e mapa do PDF para o que foi instalado: [deploy/README.md](../../deploy/README.md). IPs e papéis ficam fora do repositório.

| VPS | O que roda |
|---|---|
| Banco | Um Postgres 17 com os bancos `frotak_central` (Master), `frotak_jobs` (agendamentos), `frotak_template` (modelo) e um `frotak_<cliente>` por cliente. Login, API e arquivos em contêineres por cliente; Realtime e Kong únicos; PgBouncer nativo; agente provisionador; backup diário e teste semanal de restauração |
| Serviço | Master e TMS em Node 24 sob systemd, Caddy com HTTPS, Redis, cópia dos backups |
| Rede | WireGuard entre as duas. O banco expõe só SSH; o Serviço, só SSH, 80 e 443 |

O ambiente é **novo e sem dados de cliente real**: tem só o operador `admin@frotak.log.br` no Central e o cliente fictício "FrotaK Demonstração" (`tms@frotak.log.br`, CNPJ só de zeros), no endereço `frotak-demonstracao.`. O endereço antigo `app.` não existe mais. A produção atual (Lovable, Vercel e Supabase) continua sendo a que atende os clientes, e nenhum dado foi migrado. Os endereços são temporários, em `*.sslip.io`, até o DNS ser apontado.

### Banco por cliente (versão `6a107d4`, 2026-11-05)

Rodadas contra os endereços públicos, com dois clientes de teste. Depois disso a VPS de banco foi reinstalada para apagar os dados de teste, e a reinstalação foi conferida com login nos dois apps, seis telas do TMS abertas, backup e restauração.

- Fluxo principal: 20 de 20. Roteiros complementares: 6 de 6 e 4 de 4. As 28 telas do TMS: 28 de 28.
- Isolamento: 47 de 47. Logins separados; token, chave anônima e chave de serviço do cliente A recusados no B e no Central; papéis de banco de um cliente sem `CONNECT` no banco do outro; Realtime simultâneo sem vazamento; módulo desligado muda só um cliente; "Login como cliente" abre o cliente certo e não repete; endereço inexistente não recebe certificado.
- Falha ao criar o banco não deixa cliente fantasma no Central.
- Restauração: o cliente A perdeu dados e voltou do backup, com o Realtime ativo e arquivo incluído; o cliente B manteve o que tinha gravado depois do backup. `restore-test.sh` passou.
- `migrate` aplicou uma migration nova no modelo, no Central e nos clientes; a segunda rodada aplicou 0.
- Reboot simultâneo das duas VPS com clientes: 12 de 12 saudáveis; login, Realtime e TMS OK.
- Consumo medido: cerca de 175 MB por cliente parado, o que dá cerca de 20 clientes nesta VPS. É estimativa, **sem teste de carga**.

**Banco único, depois das mudanças (Supabase local descartável; `frota-master` intacto):** as 75 migrations montam do zero, com os 5 jobs; testes SQL passam, exceto `financial_foundation_phase1` ("DRE account groups are incomplete"), que já falhava em banco vazio; navegador 7 de 7, sem carregar o script de cliente.

**Código na versão `6a107d4`:** `tsc` sem erros nos dois apps; `test:modules` 30, `test:frotak-ai` 16, `test:visual` 3, `test-financial-recurring` 6; lint sem erro nos arquivos da entrada do servidor e do login; nenhuma senha ou IP de VPS em `deploy`, `docs/frotak-master`, `src` ou `supabase`.

### Antes do banco por cliente (versão `7a44c93`, banco único nas VPS)

Estes itens não foram repetidos por inteiro no desenho novo:

- Roteiro de segurança: 38 de 38. Senha sem 2FA não lê clientes nem frota pela API e é recusada nas server functions; confirmar o 2FA derruba as sessões sem ele. TMS desligado ou cliente suspenso: a API não devolve a frota, não grava e a RPC recusa; religar devolve tudo, sem perda.
- Storage: enviar, baixar e apagar; anônimo não baixa.
- API: cadastro público recusado, REST sem `apikey` recusado, anônimo não lê `platform_users`, administração do Realtime bloqueada.
- PgBouncer pela WireGuard aceita e recusa senha errada; Postgres fechado mesmo dentro da WireGuard. A chave de backup não abre shell, não baixa e não usa `--delete`.

A varredura externa de portas em IPv4 foi repetida na instalação final e confirmou a tabela acima. O IPv6 foi conferido só pelo firewall e pelas portas em escuta no servidor.

Não testado: chamada real ao Gemini e à Sascar e envio real de push, porque as chaves não estão na instalação; a restauração completa numa máquina nova; e carga com vários clientes em uso.

## Achados em aberto

1. **Existe uma migration fora do Git.** O banco local `frota-master` tem `202610220001_client_onboarding` (planos TRIAL/STARTER/BUSINESS/ENTERPRISE, `tenant_contracts`, `tenant_migration_requests`), que não está em nenhum branch do GitHub. Ela não colide com as migrations novas, mas indica outro fluxo de cadastro de clientes em outro checkout. Confirmar a origem e se ela está em produção antes de aplicar as novas.
2. **HTTP/3.** Com ele ligado, o Chrome numa máquina com antivírus que intercepta TLS falhou com `ERR_QUIC_PROTOCOL_ERROR` e a tela não carregou; sem ele, tudo passou. A causa exata não foi isolada. O Caddy das VPS serve só HTTP/1.1 e HTTP/2.
3. **Telas fictícias do Master.** `/usuarios`, `/financeiro`, `/operacoes` e outras continuam protótipo. Escondê-las evita decisão com número inventado, mas alguém precisa decidir quais delas construir.
4. **Sem troca de senha nos apps.** O login é marcado com `must_change_password`, mas nenhuma tela pede ou permite a troca, no Master nem no TMS. Hoje a senha só muda pela API de administração.
5. **App Motorista sem interface neste repositório.** Aqui só existe a gestão do acesso (TMS > Motoristas), então não há ambiente do motorista nas VPS.
6. **Três edições em migrations já aplicadas.** `202609240001`, `202610150001` e `20260928091642` ganharam guardas ou instruções idempotentes para o banco novo montar, inclusive fora do banco que recebe o `pg_cron`. Migration aplicada não roda de novo, então a produção não muda; `supabase db push` compara só a versão.
7. **"Central" entendido como o Master.** O usuário não confirmou nem corrigiu essa leitura. Se Central for outro sistema, o banco `frotak_central` e o endereço `master.` precisam de revisão.
8. **Partes do PDF não feitas no banco por cliente:** mTLS entre Master e agente (hoje WireGuard e token), cofre de segredos (hoje arquivos em `/etc/frotak`), fila de jobs repetíveis, tela para apagar cliente (só a API do agente) e armazenamento de objetos. Os arquivos de cada cliente ficam no disco da VPS.

Não houve revisão independente por outro executor.

## Próxima ação

1. Confirmar que "Central" é o Master (achado 7).
2. Instalar chave SSH nas VPS de banco e de Serviço e desligar o login por senha. As senhas do root foram trocadas e são diferentes em cada uma; ficam só com o usuário.
3. Decidir se as VPS substituem a produção atual. Se sim: criar o DNS curinga `*.<domínio>` para os clientes, preencher as chaves (Gemini, Sascar, Maps) e migrar os dados.
4. Fazer um teste de carga antes de passar de poucos clientes, porque a capacidade de cerca de 20 é estimativa de memória.
5. Resolver a origem de `202610220001_client_onboarding` (`select version from supabase_migrations.schema_migrations order by version desc limit 5;`).
6. Na produção atual: aplicar as migrations e publicar Master e Cliente em seguida, porque `202611050001` passa a exigir 2FA da equipe no banco. Depois, desligar os módulos que cada cliente não contratou.
