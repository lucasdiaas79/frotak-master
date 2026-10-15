---
name: master-provisionamento-guide
description: "Planejar, alterar ou revisar provisionamento especificamente no FrotaK master."
---

Trabalhe no módulo provisionamento do projeto master. Consulte o contrato do projeto e knowledge/projects/master/provisionamento.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Solicitação; tenant; etapas; recursos; estado; erro; compensação.
Regras a confirmar no código/contrato: Idempotência; recursos parciais; repetição; rollback; fronteiras com provedores.
Fluxo para inspecionar: Solicitar → validar → provisionar etapas → verificar → registrar conclusão ou recuperação.
Verificações específicas: Falha em cada etapa; duplicidade; retomada; compensação; escopo de credenciais.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/master/provisionamento.md
