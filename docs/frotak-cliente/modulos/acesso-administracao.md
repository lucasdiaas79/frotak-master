# Acesso e administracao

## MOD-ACCESS: shell, login e rotas especiais

Fontes: `src/routes/login.tsx`, `src/lib/auth.ts`, `src/components/AppLayout.tsx`, `src/routes/__root.tsx`. Prerequisito geral: usuario autenticado, profile ativo e contexto de workspace/tenant resolvido. Estado sem sessao encaminha ao login central; estados de falha nao equivalem a senha incorreta.

| Controle/superficie | Comportamento e condicao | Resposta e efeitos |
|---|---|---|
| `/login` | Le query e hash, exige origem Master e token para aceitar SSO; caso contrario redireciona | Tela de espera, tentativa de persistir sessao, volta ao inicio; erro volta ao Master. Nao ha formulario proprio nesta rota. |
| Menu operacional/cadastros | Links para dashboard, gestao, IA, historico, abastecimentos, mapa, veiculos/motoristas/carretas/clientes/produtos | Navegacao; configuracao pode ocultar acoes de vinculo. Rotas antigas permanecem. |
| Financeiro | Menu calculado por `financialNavFor(access)` | Visibilidade condicionada a `canView`; subpagina faz guard adicional. |
| Usuarios | Pagina de administracao, controle efetivo no servidor pelo owner | Nao assumir acesso apenas porque link apareceu. |
| Suporte | Abre `/manual` no shell do sistema | Busca/topicos/ancoras e artigos expansiveis. |
| Recolher/sidebar mobile | Muda shell e abre Sheet em telas pequenas | Estado/preferencia local; sem alteracao de tenant. |
| Busca global | Pesquisa dados carregados de placa/motorista/implemento e oferece destinos | Rotas/focus apontam registros; nao pesquisa todos os documentos financeiros remotos. |
| Notificacoes | Abre painel de pendencias/atualizacoes do estado operacional | Leitura; comandos associados devem manter as confirmacoes da tela de destino. |
| Tema | Alterna preferencia visual via `ThemeToggle` | Persistencia do browser; contrato visual compartilhado. |
| Sair | `signOut`, limpeza das chaves de sessao/contexto, navegacao para login | Pode falhar no logout remoto; limpeza local e parte do contrato. NE na sessao existente. |
| Rota inexistente | NotFoundComponent exibe 404 e link Dashboard | Erro de carregamento do componente tem fallback distinto de 404. |

Perfil, permissao e configuracao nao sao o mesmo conceito: `isOwner` vem do membership; permissoes especificas podem liberar partes do financeiro; modo do app/ativos e configuracao do tenant. Nenhum teste com troca de perfil ou tenant foi executado.

## MOD-USERS: `/usuarios`

Fonte principal `src/routes/usuarios.tsx:100`; backend `src/lib/workspaceUsers.ts`. OBS: pagina de usuarios e colunas nome/e-mail/setor/role/telefone/status/criacao renderizadas na sessao existente; conteudo pessoal omitido.

Campos de criacao: nome completo, login/e-mail, setor, role, telefone e senha temporaria. `createUser` valida campos essenciais e senha com pelo menos 8 caracteres; exige access token da sessao. Busca filtra usuarios carregados por nome/e-mail/status. Listagem de roles e usuarios possui estados de carregamento, acesso negado e erro com fallback proprio.

FLOW-USER-CREATE: formulario -> `createUser` -> `createWorkspaceUser` server function -> normalizacao/validacao -> `requireOwnerContext`/JWT/membership -> Auth + profile + membership + membership_roles + audit_logs -> retorno publico -> toast/fechar/reloadUsers. Nao confiar na role enviada sem validar que pertence ao workspace. A funcao possui compensacoes para algumas falhas, mas sequencia de Auth e Postgres nao constitui transacao unica; testes de falha parcial pendentes.

## MOD-DRIVER-ACCESS: efeito no cadastro de motorista

`motoristas.tsx::onSave` salva motorista e, se ha telefone, chama `createDriverAppAccess`. O servidor normaliza telefone, procura identidade correspondente, valida owner e driver do tenant e associa `auth_user_id`. O login do app e derivado do telefone; credenciais nao sao reproduzidas na documentacao. Isso e provisionamento real, portanto salvar um motorista nao e somente editar cadastro.

FLOW-DRIVER-ACCESS: modal -> upsertDriver -> getCurrentAccessToken -> server function -> owner/driver -> Auth/profile/driver/audit -> mensagem e recarga. Se sessao expira depois de salvar, existe caminho de sucesso parcial. Se provisionamento falha, o cadastro pode ja existir. Nenhuma conta foi criada, alterada ou autenticada nesta auditoria.

Testes: SQL `identity_rbac_foundation`, `authorization_functions`, `tenant_workspace_foundation`, `tenant_provisioning_rpc` sao fontes de contrato, nao executados pois escrevem fixtures. Nao ha E2E dedicado de login/SSO/usuarios identificado no pacote do Cliente.
