---
name: cliente-gestao-de-frota-guide
description: "Planejar, alterar ou revisar gestao de frota especificamente no FrotaK cliente."
---

Trabalhe no módulo gestao de frota do projeto cliente. Consulte o contrato do projeto e knowledge/projects/cliente/gestao-de-frota.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.
Inventarie veículos, placas, vínculos com motoristas, grupos, dispositivos e situação operacional. Confira unicidade, transferência de grupo, histórico de vínculos e limites de tenant. Verifique filtros, paginação, permissões e sincronização com a fonte real.

Inventário de entidades: Veículos; placas; grupos; motoristas; documentos; dispositivos; vínculos históricos.
Regras a confirmar no código/contrato: Unicidade da placa no escopo definido; transferência; inativação; limites de grupo; vigência de vínculos.
Fluxo para inspecionar: Cadastrar veículo → vincular grupo/motorista → atualizar situação → consultar histórico.
Verificações específicas: Filtros e paginação; acesso entre grupos; associação dispositivo-veículo; referência cruzada com viagens.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/cliente/gestao-de-frota.md
