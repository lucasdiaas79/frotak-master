---
name: cliente-financeiro-guide
description: "Planejar, alterar ou revisar financeiro especificamente no FrotaK cliente."
---

Trabalhe no módulo financeiro do projeto cliente. Consulte o contrato do projeto e knowledge/projects/cliente/financeiro.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.
Identifique antes as regras de contas a pagar/receber, vencimento, liquidação, parcelas, categorias, centros de custo, conciliação e permissões por tenant. Dinheiro exige precisão e política explícita de arredondamento. Teste estorno, duplicidade, pendência e timezone. Não derive receitas ou pagamentos pela aparência da tela.

Inventário de entidades: Contas a pagar/receber; parcelas; liquidação; categorias; centros de custo; conciliação.
Regras a confirmar no código/contrato: Precisão monetária; vencimento versus pagamento; pagamentos parciais; estorno; idempotência; autorizações por tenant.
Fluxo para inspecionar: Registrar título → conferir vencimento → liquidar → conciliar → consultar histórico.
Verificações específicas: Saldo/total após liquidação; duplicidade; estorno; filtros de período/situação; exportação com os mesmos critérios.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/cliente/financeiro.md
