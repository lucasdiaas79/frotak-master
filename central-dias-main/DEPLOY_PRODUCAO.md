# Fluxo de Producao Alinhado

Este projeto passa a usar um fluxo unico para manter `sistema`, `GitHub`, `Vercel` e `Supabase` alinhados.

## Fonte de verdade

- Codigo de producao: branch `main`
- Dominio de producao: `https://centralpedrabranca.vercel.app`
- Banco de dados: projeto remoto do Supabase vinculado pelas migrations em `supabase/migrations`
- Project ref remoto da Central: `pvcgdudtkysgbmkeoums`
- Ambiente local: `.env` local, nunca versionado

## Regra operacional

Uma alteracao so e considerada publicada quando os 4 itens abaixo estiverem alinhados:

1. O codigo estiver commitado e presente na branch `main`
2. O GitHub tiver recebido o `push` da `main`
3. A Vercel estiver publicando a `main`
4. Qualquer mudanca de banco estiver registrada em migration e aplicada no Supabase remoto

## Fluxo padrao

### 1. Desenvolvimento

- Trabalhar localmente na branch de trabalho
- Rodar:

```bash
npm run dev
```

- Validar build:

```bash
npm run build
```

### 2. Banco de dados

Toda mudanca estrutural deve entrar em:

```text
supabase/migrations/
```

Scripts operacionais de demo, reset ou preenchimento manual nao devem entrar em `supabase/migrations`.
Eles devem ficar fora da trilha oficial de producao, para nao serem exigidos pelo `db push`.

Aplicacao no remoto:

```bash
npm run supabase:link:prod
npm run supabase:push:prod
```

Se houver seed operacional intencional:

```bash
npm run supabase:seed:prod
```

### 3. Publicacao

- Promover a versao validada para `main`
- Dar `push` na `main`
- Confirmar deploy da Vercel na mesma branch

### 4. Conferencia final

- GitHub: `origin/main` precisa apontar para o commit esperado
- Vercel: o dominio precisa refletir esse mesmo commit
- Supabase: migrations aplicadas
- Sistema local: sem diferencas pendentes no `git status`

## Variaveis obrigatorias

### Local

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SASCAR_WSDL_URL=
SASCAR_USER=
SASCAR_PASSWORD=
SASCAR_SYNC_TOKEN=
```

### Vercel

Definir no projeto da Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` se houver rotas server-side que precisem dela
- `SASCAR_WSDL_URL`
- `SASCAR_USER`
- `SASCAR_PASSWORD`
- `SASCAR_SYNC_TOKEN`

## Regra de branch

- `main`: producao
- `feature/*`: trabalho

Se o dominio estiver diferente do servidor local, a primeira checagem deve ser:

```bash
git rev-parse HEAD origin/main
```

Se os commits forem diferentes, a Vercel provavelmente ainda esta publicando outra revisao.

## Comando de checagem local

No Windows/PowerShell:

```powershell
npm run check:production
```
