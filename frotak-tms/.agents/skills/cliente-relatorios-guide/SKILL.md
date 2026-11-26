---
name: cliente-relatorios-guide
description: "Planejar, alterar ou revisar relatorios especificamente no FrotaK cliente."
---

Trabalhe no módulo relatorios do projeto cliente. Consulte o contrato do projeto e knowledge/projects/cliente/relatorios.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Definição de relatório; filtros; escopo; colunas; geração; arquivo; agendamento.
Regras a confirmar no código/contrato: Mesmos filtros entre tela/exportação; limite por tenant; fusos; precisão; jobs longos.
Fluxo para inspecionar: Definir escopo → pré-visualizar → gerar → baixar → registrar resultado.
Verificações específicas: Dados vazios; grande volume; autorização; totais reconciliados; falha e repetição de job.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/cliente/relatorios.md
