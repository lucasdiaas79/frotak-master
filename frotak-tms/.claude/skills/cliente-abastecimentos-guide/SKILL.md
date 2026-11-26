---
name: cliente-abastecimentos-guide
description: "Planejar, alterar ou revisar abastecimentos especificamente no FrotaK cliente."
---

Trabalhe no módulo abastecimentos do projeto cliente. Consulte o contrato do projeto e knowledge/projects/cliente/abastecimentos.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Abastecimento; combustível; volume; valor; odômetro; veículo; posto; comprovante.
Regras a confirmar no código/contrato: Unidades; arredondamento; odômetro regressivo; duplicidade; consumo derivado; exclusão/estorno.
Fluxo para inspecionar: Registrar abastecimento → validar valores/odômetro → consultar histórico → analisar consumo.
Verificações específicas: Duas cobranças reais semelhantes; período e placa; consumo sem base suficiente; permissões de edição.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/cliente/abastecimentos.md
