# Financeiro Frotak - Fase 1: Fundação

## Escopo

Esta fase cria somente o domínio financeiro compartilhado. A operação continua usando
`vehicles`, `freight_history`, `fuel_records` e `freight_expenses` exatamente como antes.
A tela Receitas e Despesas não foi alterada.

## Auditoria anterior à migração

- 2 fretes ativos em `vehicles.current_freight_id`.
- 43 fretes em `freight_history`.
- 0 conflitos de UUID entre viagens ativas e históricas.
- 6 viagens com algum dado ausente e preservadas com `requires_review = true`.
- 9 abastecimentos existentes e 0 vinculados a lançamentos financeiros.
- Nenhum abastecimento, despesa ou frete gera documento financeiro nesta fase.

Dados ausentes nunca são inventados. Os motivos ficam em `freights.review_reasons`.

## Fonte canônica de viagem

`freights` preserva o UUID de `vehicles.current_freight_id` e
`freight_history.freight_id`. Triggers passivos espelham alterações futuras sem mudar
o Smart Flow. O sistema operacional ainda não lê dessa tabela.

## Parceiros

`business_partners` unifica papéis por documento fiscal normalizado. Os vínculos com
`senders` e `recipients` ficam em `legacy_partner_links`. Nomes parecidos não são
mesclados. Os cadastros legados permanecem sendo a fonte da operação.

## Fato econômico

Um fato deve existir uma única vez em `financial_documents`. A chave parcial
`(tenant_id, source_type, source_id, source_event)` impede duplicidade. Exemplos futuros:

- Frete concluído: `freight / <id> / completion_revenue`.
- Abastecimento: `fuel_record / <id> / expense_recognition`.
- Despesa do frete: `freight_expense / <id> / expense_recognition`.

Essas automações ainda não existem.

`financial_installments` representa vencimento e liquidação. Competência permanece no
documento. `financial_allocations` distribui o valor por frete, veículo, parceiro,
produto e centro de custo, sem rateio silencioso e sem ultrapassar o valor original.

## DRE Gerencial Frotak

O plano de contas usa `dre_group`, permitindo calcular futuramente:

1. Receita Bruta
2. (-) Deduções = Receita Líquida
3. (-) Custos Variáveis = Margem de Contribuição
4. (-) Despesas Operacionais = EBITDA
5. (-) Depreciação/Amortização = Resultado Operacional
6. (+/-) Resultado Financeiro
7. (-) Impostos = Resultado Líquido

É uma DRE gerencial e não substitui a contabilidade fiscal.

## Segurança e auditoria

Todas as novas tabelas têm RLS. Leitura e escrita dependem do workspace do usuário,
das permissões financeiras ou da condição de owner. A service role continua exclusiva
do servidor. Documentos contabilizados não podem ser apagados fisicamente, e eventos de
criação e alteração são gravados em `financial_audit_events`.

## Próximas fases

- Reconciliar os 9 abastecimentos sem duplicidade.
- Reconhecer receita somente na conclusão do frete.
- Criar liquidações, bancos/caixas e fornecedores operacionais.
- Derivar lançamentos balanceados no razão.
- Criar as interfaces financeiras e relatórios.
