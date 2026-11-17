-- Portal do embarcador (Frotak Embarcador), gratis para o embarcador.
--
-- Como os dados fluem:
--   1. O embarcador cria a conta (shippers + shipper_members).
--   2. Ele convida as transportadoras que usa (shipper_carriers, status 'convidada').
--   3. A transportadora aceita dentro da Frotak (status 'ativa', tenant_id preenchido).
--   4. A partir dai o embarcador enxerga so os fretes desse tenant em que o CNPJ dele
--      e remetente ou destinatario, sem valores nem custos.
--
-- Todas as leituras e gravacoes passam pelo servidor do app (service role), que
-- confere a sessao do usuario. Por isso anon e authenticated nao tem acesso direto.

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

create or replace function public.digits_only(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

create table if not exists public.shippers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  cnpj text not null,
  phone text,
  city text,
  state text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shippers_cnpj_key unique (cnpj),
  constraint shippers_cnpj_chk check (cnpj ~ '^[0-9]{14}$'),
  constraint shippers_legal_name_chk check (btrim(legal_name) <> ''),
  constraint shippers_status_chk check (status in ('active', 'suspended'))
);

create table if not exists public.shipper_members (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipper_members_user_key unique (user_id),
  constraint shipper_members_role_chk check (role in ('admin', 'member')),
  constraint shipper_members_status_chk check (status in ('active', 'disabled'))
);

create index if not exists shipper_members_shipper_idx on public.shipper_members (shipper_id);

create table if not exists public.shipper_carriers (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  carrier_name text not null,
  carrier_cnpj text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'convidada',
  invite_token_hash text,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipper_carriers_status_chk check (status in ('convidada', 'ativa', 'recusada', 'pausada')),
  constraint shipper_carriers_cnpj_chk check (carrier_cnpj is null or carrier_cnpj ~ '^[0-9]{14}$'),
  constraint shipper_carriers_token_chk check (invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$'),
  constraint shipper_carriers_name_chk check (btrim(carrier_name) <> '')
);

create unique index if not exists shipper_carriers_shipper_cnpj_uidx
  on public.shipper_carriers (shipper_id, carrier_cnpj) where carrier_cnpj is not null;
create unique index if not exists shipper_carriers_shipper_tenant_uidx
  on public.shipper_carriers (shipper_id, tenant_id) where tenant_id is not null;
create unique index if not exists shipper_carriers_token_uidx
  on public.shipper_carriers (invite_token_hash) where invite_token_hash is not null;
create index if not exists shipper_carriers_tenant_idx on public.shipper_carriers (tenant_id);
create index if not exists shipper_carriers_cnpj_idx on public.shipper_carriers (carrier_cnpj);

-- Busca dos fretes do embarcador pelo CNPJ do remetente ou destinatario.
create index if not exists senders_tenant_cnpj_digits_idx
  on public.senders (tenant_id, public.digits_only(cnpj));
create index if not exists recipients_tenant_cnpj_digits_idx
  on public.recipients (tenant_id, public.digits_only(cnpj));

drop trigger if exists shippers_touch_updated_at on public.shippers;
create trigger shippers_touch_updated_at before update on public.shippers
  for each row execute function public.touch_updated_at();
drop trigger if exists shipper_members_touch_updated_at on public.shipper_members;
create trigger shipper_members_touch_updated_at before update on public.shipper_members
  for each row execute function public.touch_updated_at();
drop trigger if exists shipper_carriers_touch_updated_at on public.shipper_carriers;
create trigger shipper_carriers_touch_updated_at before update on public.shipper_carriers
  for each row execute function public.touch_updated_at();

alter table public.shippers enable row level security;
alter table public.shipper_members enable row level security;
alter table public.shipper_carriers enable row level security;

revoke all on public.shippers from anon, authenticated;
revoke all on public.shipper_members from anon, authenticated;
revoke all on public.shipper_carriers from anon, authenticated;

-- Sem policies de proposito: so o service role (servidor do app) le e grava.

commit;
