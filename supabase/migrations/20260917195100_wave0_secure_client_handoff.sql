-- Frotak Wave 0 — handoff Master -> Central sem transportar access/refresh token na URL.
--
-- O navegador recebe apenas um codigo aleatorio, curto e de uso unico. O codigo
-- real nunca e armazenado no banco: somente SHA-256. A troca final e feita por
-- Edge Function, que valida novamente membership/tenant antes de emitir um
-- token de login Supabase de uso unico.

create table public.auth_handoff_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint auth_handoff_codes_hash_chk check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_handoff_codes_expiry_chk check (expires_at > created_at)
);

create index auth_handoff_codes_expires_idx
  on public.auth_handoff_codes(expires_at);
create index auth_handoff_codes_user_created_idx
  on public.auth_handoff_codes(user_id, created_at desc);

alter table public.auth_handoff_codes enable row level security;

-- Nao existe acesso direto do browser a esta tabela. Somente a Edge Function
-- usa a service role. A posse do codigo de handoff nao concede acesso ao banco.
revoke all on table public.auth_handoff_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_handoff_codes to service_role;

comment on table public.auth_handoff_codes is
  'Codigos efemeros e de uso unico para handoff Master -> Central. Armazena somente SHA-256 do codigo; nunca access/refresh tokens.';
comment on column public.auth_handoff_codes.code_hash is
  'SHA-256 hexadecimal do codigo aleatorio entregue ao browser.';
comment on column public.auth_handoff_codes.consumed_at is
  'Preenchido atomicamente no primeiro exchange bem-sucedido; impede replay.';
