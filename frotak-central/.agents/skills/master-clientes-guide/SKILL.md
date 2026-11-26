---
name: master-clientes-guide
description: "Planejar, alterar ou revisar clientes especificamente no FrotaK master."
---

Trabalhe no módulo clientes do projeto master. Consulte o contrato do projeto e knowledge/projects/master/clientes.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Cliente/tenant; cadastro; contato; estado; plano; ambiente; domínio.
Regras a confirmar no código/contrato: Isolamento; ativação/inativação; efeitos em usuários e serviços; dados obrigatórios.
Fluxo para inspecionar: Cadastrar cliente → configurar escopo/plano → provisionar → acompanhar situação.
Verificações específicas: Nenhuma leitura cruzada; tenant incompleto; falha parcial; ações auditadas.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/master/clientes.md
