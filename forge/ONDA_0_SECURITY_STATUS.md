# Frotak Forge — Onda 0 / Segurança e fonte de verdade

Atualizado em: 2026-09-17

Objetivo da Onda 0: remover riscos P0 e consolidar identidade, autorização e caminhos canônicos antes de ampliar features de produto.

## Status

### 0.1 — Gate da Frotak IA — IMPLEMENTADO NESTA BRANCH

Branch: `forge/onda-0-security-foundation`

Escopo concluído:
- autenticação real do usuário antes de consumir o provedor de IA;
- perfil precisa estar ativo;
- membership e workspace precisam estar ativos;
- tenant precisa estar `active` ou `trial`;
- módulo `frotak_ai` precisa estar habilitado e dentro da vigência;
- usuário precisa possuir a permissão `ai.assistant.use`;
- chat e emissão de token Live possuem rate limit por usuário/canal;
- consumo é registrado em `ai_usage_events` com tenant, workspace, usuário, canal, modelo e resultado;
- rate limit é decidido atomicamente no banco por RPC server-only;
- chamadas de browser continuam usando a API de alto nível anterior, mas o access token é anexado pelo wrapper e validado no servidor;
- mensagem e histórico possuem limites defensivos de tamanho;
- configuração de ambiente da IA foi documentada em `.env.example`.

Arquivos alterados:
- `central-dias-main/src/lib/frotakAi.ts`
- `central-dias-main/.env.example`
- `supabase/migrations/20260917070000_create_ai_usage_events.sql`

### Ordem de implantação desta fatia

1. aplicar a migration `20260917070000_create_ai_usage_events.sql`;
2. validar que `ai_usage_events`, `start_ai_usage_event` e `finish_ai_usage_event` existem;
3. configurar os limites/envs se os defaults não forem desejados;
4. somente depois publicar o código da Central com o novo gate;
5. executar smoke tests com usuário autorizado, usuário sem módulo, usuário sem permissão e excesso de requisições.

O código falha fechado se a infraestrutura de auditoria/rate limit ainda não existir. Por isso a migration deve entrar antes do runtime novo.

### Validação realizada

- revisão estática do fluxo de autenticação, entitlement, RBAC e rate limit;
- comparação da branch contra `forge/bootstrap-architecture`: mudanças restritas aos 3 arquivos acima antes deste status;
- não houve merge em `main` nem deploy de produção.

### Validação ainda pendente

Não foi possível executar o build no ambiente de trabalho usado para esta implementação porque a tentativa de baixar o repositório/dependências encontrou indisponibilidade de resolução de rede. O repositório também não possui workflow de GitHub Actions encontrado em `.github/workflows` para substituir essa validação automaticamente.

Antes de merge/deploy deve ser executado:
- build/typecheck da Central;
- aplicação da migration em ambiente seguro;
- smoke test do chat;
- emissão de token Live;
- teste de permissão e módulo;
- teste de rate limit;
- confirmação de registros em `ai_usage_events`.

## Próximos P0

### 0.2 — Handoff Master → Central — PRÓXIMO

Substituir o fluxo atual de access/refresh token no hash + sessão local de fallback por uma troca server-side de código curto, de uso único e com expiração. A Central não deve criar identidade confiável a partir de parâmetros de URL se a validação real falhar.

### 0.3 — Identidade do motorista

Fazer o aplicativo Motorista usar a identidade Supabase já preparada por `drivers.auth_user_id`, eliminando telefone + código fixo como barreira de autenticação e evitando que o telefone enviado pelo cliente seja tratado como identidade suficiente para chamadas service-role.

### 0.4 — Storage de documentos

Endurecer policies do bucket de documentos por tenant/frete/path e testar acesso cruzado entre tenants.

### 0.5 — RLS e service-role

Inventariar cada caminho service-role operacional, definir justificativa e fronteira de autorização e remover caminhos redundantes em favor de uma fonte de verdade por domínio.

## Gate

Esta branch é de preparação/revisão. Nada aqui autoriza deploy de produção automaticamente. Produção continua dependendo de validação técnica e aprovação explícita de Lucas sobre o commit/preview correspondente.
