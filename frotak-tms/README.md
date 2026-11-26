# Central Transportes e Servicos - Sistema de Gestao de Frota

Aplicacao TanStack Start + React conectada ao Supabase para gestao operacional de frota rodoviaria.

## Requisitos

- Node.js 20+
- npm
- Supabase CLI
- Projeto Supabase local ou hospedado

## Instalar dependencias

```bash
npm install
```

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SASCAR_WSDL_URL=https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService?wsdl
SASCAR_USER=seu-login-integrador
SASCAR_PASSWORD=sua-senha-integrador
SASCAR_SYNC_TOKEN=token-opcional-para-proteger-a-rota-de-sync
```

Nunca versionar `.env`.

## Banco Supabase

As migrations ficam em `supabase/migrations` e o seed em `supabase/seed.sql`.
SQLs de demo operacional ou reset manual nao devem ficar nessa pasta.

Aplicar em um projeto local:

```bash
supabase start
supabase db reset
```

Aplicar em um projeto remoto:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase db seed
```

## Usuario admin inicial

Crie o usuario no Supabase Auth:

- Email: `admin@central.com.br`
- Senha: definida por voce no painel do Supabase

Depois ajuste o profile para admin:

```sql
update public.profiles
set role = 'admin', name = 'Administrador Central', active = true
where email = 'admin@central.com.br';
```

## Rodar localmente

```bash
npm run dev
```

Abra a URL exibida pelo Vite e acesse `/login`.

## O que ja esta conectado ao backend

- Supabase Auth com email e senha
- Tabelas PostgreSQL reais para profiles, vehicles, drivers, trailers, senders, recipients, fleet_events e vehicle_positions
- RLS com leitura autenticada, escrita por `admin`, `gestor` e `operador`, exclusao por `admin`
- Store `useFleet` usando Supabase como fonte de verdade
- CRUD operacional via services em `src/lib/services`
- RPCs transacionais para status, vinculacao operacional e registro de posicao
- Realtime preparado para vehicles, fleet_events e vehicle_positions
- Integracao Sascar por Supabase Edge Function com cron no banco em `supabase/functions/sascar-sync`

## Integracao Sascar

O projeto sincroniza posicoes da Sascar pela infraestrutura do Supabase, sem depender da tela aberta nem do servidor da aplicacao.

- Metodo principal de leitura: `getPositionPacketWithLicensePlateJSON`
- Recuperacao de lacunas por `packetId`: `getPositionPacketByRangeJSON`
- Vinculo de frota Sascar: `getVehiclesJSON`
- Agendamento: `pg_cron` no Supabase executando a cada 1 minuto
- Execucao: Supabase Edge Function `sascar-sync`

Fluxo:

1. A Edge Function consulta a frota Sascar e tenta vincular `vehicles.sascar_id` pela placa.
2. A Edge Function busca os pacotes de posicao mais recentes.
3. As coordenadas sao gravadas em `vehicle_positions` e refletem em `vehicles.lat/lng/city/state/last_position_at`.
4. O ultimo `packetId` processado fica salvo em `integration_sync_state`.
5. Um lock no banco (`integration_locks`) impede conflito entre cron e botao manual.

Acionamento manual:

- Pela tela `Mapa da Frota`, no botao `Sincronizar Sascar`
- Ou via Supabase Edge Function `sascar-sync`

Acionamento automatico:

- Migration `202605120001_add_sascar_supabase_cron.sql`
- Job `sascar-sync-every-minute`
- Frequencia: `* * * * *` (a cada 1 minuto)

Configure os secrets da Edge Function:

```bash
supabase secrets set \
  SUPABASE_URL=... \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SASCAR_WSDL_URL=https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService?wsdl \
  SASCAR_USER=... \
  SASCAR_PASSWORD=... \
  SASCAR_SYNC_TOKEN=...
```

Depois de aplicar as migrations, configure o cron no banco:

```sql
insert into public.integration_cron_settings (key, value)
values
  ('sascar_function_url', 'https://<project-ref>.supabase.co/functions/v1/sascar-sync'),
  ('sascar_sync_token', '<mesmo SASCAR_SYNC_TOKEN dos secrets>')
on conflict (key) do update set value = excluded.value;
```

Se `SASCAR_SYNC_TOKEN` estiver configurado, envie:

```bash
x-sascar-sync-token: <token>
```

## Deploy

1. Configure um projeto Supabase remoto.
2. Rode `supabase db push` e `supabase db seed`, se desejar dados iniciais.
3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no provedor de deploy.
4. Rode o build:

```bash
npm run build
```

5. Publique o output conforme o alvo escolhido para TanStack Start/Vite.

## Fluxo de producao

O fluxo oficial para manter `GitHub`, `Vercel`, `Supabase` e sistema alinhados esta em [DEPLOY_PRODUCAO.md](./DEPLOY_PRODUCAO.md).
