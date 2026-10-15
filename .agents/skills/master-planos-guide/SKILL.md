---
name: master-planos-guide
description: "Planejar, alterar ou revisar planos especificamente no FrotaK master."
---

Trabalhe no módulo planos do projeto master. Consulte o contrato do projeto e knowledge/projects/master/planos.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Plano; módulos; limites; vigência; assinatura; cliente; cobrança.
Regras a confirmar no código/contrato: Entitlements; transição; limites; efeito no uso existente; aprovação comercial.
Fluxo para inspecionar: Definir plano → associar cliente → aplicar vigência → conferir acesso e limites.
Verificações específicas: Upgrade/downgrade; limites atingidos; fronteiras de cobrança; histórico de vigência.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/master/planos.md
