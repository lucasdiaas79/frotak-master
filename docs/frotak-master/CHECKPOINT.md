# Checkpoint · Master modular e liberação por cliente

Atualizado em 2026-11-02. Escopo: Fase 1 do PDF "FrotaK Master · Arquitetura", adaptada ao Supabase compartilhado atual (decisão do usuário em 2026-10-31). Detalhes em [arquitetura-modular](arquitetura-modular.md).

## Git e ambiente

| Item | Estado |
|---|---|
| Base | `main` @ `92a7213` (igual a `origin/main` em 2026-11-02) |
| Branch | `feat/master-modulos-por-cliente`, commit local, **sem push** |
| Teste de ponta a ponta | Supabase local descartável (`project_id` `frotak-e2e`, portas 553xx) criado do zero e removido no fim |
| Banco remoto e banco local `frota-master` | Não alterados |

## Concluído

1. Migration `202610310001_master_product_module_entitlements.sql`: produtos (`tms`, `view`), produtos por cliente, módulo `driver_app`, backfill que preserva o acesso atual, bloqueio por módulo no financeiro e no app motorista, leitura de liberações, comandos auditados do Master e contagem de uso.
2. Master em `src/core` e `src/modules/{catalog,entitlements,tenants,provisioning}`. Toda server function exige login da equipe FrotaK.
3. Tela Clientes com a ficha "Gerenciar" (produtos e módulos), cadastro com produtos e módulos, estados de erro e vazio, contagens reais.
4. Cliente: menu, rotas e servidor obedecem às liberações. Sem TMS ou com o cliente suspenso, o menu fica só com Ajuda e a barra inferior do celular some; Suporte continua acessível.

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

## Achados fora do escopo

1. **A sequência de migrations não monta um banco do zero.** `20260928091642_workspace_sascar_integrations` usa `public.touch_updated_at()`, que só é criada em `202610150001`. Em produção funciona porque a função veio do projeto antigo. No teste, criei a função num arquivo só da cópia descartável.
2. **Existe uma migration fora do Git.** O banco local `frota-master` tem `202610220001_client_onboarding` (planos TRIAL/STARTER/BUSINESS/ENTERPRISE, `tenant_contracts`, `tenant_migration_requests`), que não está em nenhum branch do GitHub. Ela não colide com a migration nova, mas indica outro fluxo de cadastro de clientes do Master em outro checkout, que pode conflitar com a nova tela Clientes. Confirmar se ela está em produção antes de aplicar.
3. O cabeçalho do menu do celular do Cliente mostra "Central Transportes" fixo para qualquer cliente. Já estava assim antes.

Não houve revisão independente por outro executor.

## Próxima ação

1. Resolver a origem de `202610220001_client_onboarding` e conferir o banco de produção (`select version from supabase_migrations.schema_migrations order by version desc limit 5;`).
2. Aplicar `202610310001` em produção, depois publicar Master e Cliente.
3. Desligar no Master os módulos que cada cliente não contratou.
