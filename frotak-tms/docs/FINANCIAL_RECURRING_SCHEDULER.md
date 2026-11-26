# Agendamento de Recorrencias Financeiras

Esta etapa prepara a geracao automatica dos titulos recorrentes do Financeiro sem depender da abertura das telas de A Receber ou A Pagar.

## Como funciona

- A migration `202609240001_financial_managerial_simplification.sql` cria `public.run_financial_recurring_cron(p_until_month date)`.
- A funcao varre todos os workspaces ativos com regras recorrentes ativas.
- Para cada workspace, chama `public.generate_due_financial_recurring_documents(...)`.
- A geracao continua idempotente por `source_type = recurring_rule`, `source_id = rule_id` e `source_event` da competencia.
- A abertura de A Receber/A Pagar permanece como fallback de reconciliacao/backfill.

## Ativacao no deploy

Ao aplicar a migration em um ambiente com `pg_cron` instalado, o job e criado automaticamente:

```sql
select cron.schedule(
  'financial-recurring-daily',
  '15 3 * * *',
  'select public.run_financial_recurring_cron(current_date);'
);
```

Se `pg_cron` ainda nao estiver disponivel quando a migration rodar, habilite a extensao e execute manualmente o agendamento acima.

## Execucao manual segura

Para reconciliar/backfill manualmente apos o deploy:

```sql
select public.run_financial_recurring_cron(current_date);
```

O retorno informa workspaces processados, titulos gerados, titulos pulados por idempotencia e erros por workspace.

## Seguranca

- A funcao de cron nao e concedida a `anon` nem a `authenticated`.
- Usuarios autenticados continuam usando `generate_due_financial_recurring_documents`, que exige `financial.manage_recurring`.
- O cron roda server-side no banco, sem depender de usuario especifico.
