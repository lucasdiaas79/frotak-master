---
name: master-usuarios-permissoes-guide
description: "Planejar, alterar ou revisar usuarios permissoes especificamente no FrotaK master."
---

Trabalhe no módulo usuarios permissoes do projeto master. Consulte o contrato do projeto e knowledge/projects/master/usuarios-permissoes.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Usuário; papel; concessão; grupo; tenant; sessão; aprovação.
Regras a confirmar no código/contrato: Matriz de permissão; escopo de dados; revogação; convite; último administrador.
Fluxo para inspecionar: Criar/convidar → autorizar função e dados → verificar → revogar quando necessário.
Verificações específicas: Acesso negado; fronteira frontend/backend; revogação de sessão; trilha de mudança.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/master/usuarios-permissoes.md
