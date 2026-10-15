---
name: cliente-manutencao-guide
description: "Planejar, alterar ou revisar manutencao especificamente no FrotaK cliente."
---

Trabalhe no módulo manutencao do projeto cliente. Consulte o contrato do projeto e knowledge/projects/cliente/manutencao.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Plano; serviço; ordem; veículo; oficina; vencimento por data/km; custo; anexos.
Regras a confirmar no código/contrato: Programada versus realizada; limites de odômetro; peças/serviços; reabertura; vínculo ao financeiro.
Fluxo para inspecionar: Planejar → gerar ordem → executar → registrar custo → atualizar próxima manutenção.
Verificações específicas: Atraso; execução parcial; alertas; duplicação de ordem; atualização do veículo e financeiro.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/cliente/manutencao.md
