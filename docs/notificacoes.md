# Notificações

Avisos para os usuários do TMS (sino, popup na tela e notificação do Windows), gerados por regras
que a equipe FrotaK cria no Master. Feito em 2026-11-26 a partir da história "sistema de
notificação". A View e a notificação para a própria equipe no Master ficaram para depois.

## Como funciona

| Etapa | Onde | O quê |
|---|---|---|
| 1. Regra | Master > **Notificações** (`frotak-central/src/modules/notifications`) | Nome, para quais clientes, o que observa (Fretes, Veículos, Eventos da operação, Documentos do motorista), quando dispara, condições, texto com `{{campos}}`, papéis que recebem, tela que abre ao clicar |
| 2. Cópia | Agente da VPS de banco (`POST /clients/<slug>/notification-rules`) | Banco por cliente: cada banco recebe as regras gerais e as dele (`master_sync_notification_rules`). Banco único: não há cópia |
| 3. Avaliação | Banco do cliente (`supabase/migrations/202611260001_notifications.sql`) | **Ao gravar**: trigger nas 4 tabelas do catálogo. **Dado no banco**: `evaluate_scheduled_notification_rules()` a cada 15 min, um aviso por registro enquanto os campos das condições não mudam |
| 4. Aviso | Tabela `notifications` | Um aviso por usuário, respeitando as preferências dele. Quem desligou a regra não recebe |
| 5. Na tela | TMS: sino no cabeçalho, popup e **/notificacoes** (`frotak-tms/src/modules/notifications`) | Chega pelo Realtime na hora; sem Realtime, a lista se atualiza a cada minuto |
| 6. No Windows | TMS `/api/notifications/dispatch` | Web Push para os aparelhos de quem ligou o "Aviso do Windows". Chamada a cada minuto pelo agente (VPS) ou pelo pg_cron (Supabase hospedado) quando há aviso pendente |

Regras iniciais (ids fixos, valem para todos os clientes): **Frete mudou de etapa** e **Novo frete**.

Uma regra com erro nunca impede a gravação do frete: o aviso não sai e o erro vai para o log do banco.

## Quem pode o quê

| Papel no Master | Pode |
|---|---|
| `super_admin` | Tudo, inclusive regras para **todos os clientes** |
| `operations` | Criar e alterar regras de um cliente específico |
| `support`, `read_only` | Só consultar |

No TMS, cada usuário escolhe em **Notificações > Preferências** quais tipos recebe e quais também
aparecem no Windows. O aparelho do Windows usa o mesmo cadastro do aviso da Frotak IA.

## Ligar em cada ambiente

**VPS (banco por cliente):** automático depois de aplicar a migration, publicar os apps e atualizar o
agente (`deploy/db/agent`). As chaves VAPID e o `FROTAK_PUSH_CRON_TOKEN` já existem.

**Supabase hospedado (banco único):** aplicar a migration e configurar o envio ao Windows:

```sql
insert into public.integration_cron_settings (key, value) values
  ('notification_dispatch_url', 'https://<endereço do TMS>/api/notifications/dispatch')
on conflict (key) do update set value = excluded.value;
-- frotak_push_token já existe se o aviso da Frotak IA estiver configurado.
```

O TMS precisa de `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `FROTAK_PUSH_CRON_TOKEN` no ambiente.

## Testes

| Comando | O que testa |
|---|---|
| `supabase/tests/notifications.sql` (num banco de teste) | Frete novo e mudança de etapa pelo caminho da tela, preferências, papel, condição de valor, agendada sem repetir, regra torta sem quebrar gravação, RLS e cópia das regras |
| `cd frotak-tms && npm run test:modules` | Preferências, lista, links seguros e envio ao Windows com portas falsas |
| `cd frotak-central && npm run test:notifications` | Validação, prévia igual à do banco e permissões |
| `python3 -m unittest deploy/db/agent/test_agent.py` | Cópia das regras e disparos do agente |

## Limites conhecidos

- O aviso do Windows chega em até 1 minuto (ciclo do agente); o popup na tela é imediato.
- Regra agendada lê até 5.000 registros por fonte em cada passada.
- Avisos com mais de 90 dias saem sozinhos; aviso do Windows que não saiu em 1 dia não sai mais.
- O catálogo de campos é o mesmo em dois lugares: `catalog.ts` do Master e `private.notification_record` no banco.
