-- Link de acompanhamento do frete para o cliente (embarcador), sem login.
-- A transportadora gera um link por frete; o link guarda apenas o hash do token.
-- A pagina publica le os dados pelo servidor (service role), nunca pelo anon:
-- por isso anon nao tem nenhum acesso a esta tabela.

begin;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.freight_share_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  freight_id uuid not null,
  token_hash text not null,
  recipient_label text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freight_share_links_token_hash_key unique (token_hash),
  constraint freight_share_links_token_hash_chk check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint freight_share_links_expiry_chk check (expires_at <= created_at + interval '90 days')
);

create index if not exists freight_share_links_tenant_freight_idx
  on public.freight_share_links (tenant_id, freight_id);

drop trigger if exists freight_share_links_touch_updated_at on public.freight_share_links;
create trigger freight_share_links_touch_updated_at before update on public.freight_share_links
  for each row execute function public.touch_updated_at();

alter table public.freight_share_links enable row level security;

revoke all on public.freight_share_links from anon;
revoke delete on public.freight_share_links from authenticated;

-- Membros do tenant enxergam e criam links dos proprios fretes.
drop policy if exists freight_share_links_tenant_select on public.freight_share_links;
create policy freight_share_links_tenant_select on public.freight_share_links
for select to authenticated
using (private.can_access_tenant(tenant_id));

drop policy if exists freight_share_links_tenant_insert on public.freight_share_links;
create policy freight_share_links_tenant_insert on public.freight_share_links
for insert to authenticated
with check (
  private.can_access_tenant(tenant_id)
  and exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_id
      and v.tenant_id = freight_share_links.tenant_id
  )
);

-- Atualizacao pelo usuario serve so para revogar (revoked_at). A contagem de
-- visitas e gravada pelo servidor com service role.
drop policy if exists freight_share_links_tenant_update on public.freight_share_links;
create policy freight_share_links_tenant_update on public.freight_share_links
for update to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));

revoke update on public.freight_share_links from authenticated;
grant update (revoked_at) on public.freight_share_links to authenticated;

commit;
