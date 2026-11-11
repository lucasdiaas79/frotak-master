-- Frotak Embarcador: terceiros, Rede Frotak e link do motorista.
--
-- Como os dados se encaixam:
--   driver_network_profiles   cadastro unico do motorista na Frotak, identificado pelo telefone.
--                             Links diferentes, de viagens e transportadoras diferentes, caem aqui.
--   driver_network_links      liga o motorista de uma transportadora (drivers.id) ao cadastro unico,
--                             com o vinculo: frota propria, agregado ou terceiro.
--   driver_network_documents  CNH, RNTRC, seguro, CRLV e gerenciadora de risco, com validade.
--   driver_trip_ratings       avaliacao de cada viagem concluida (pelo embarcador ou pela transportadora).
--   shipper_driver_decisions  o embarcador aprova, poe em revisao ou bloqueia um motorista para as cargas dele.
--   shipper_driver_notes      observacao interna do embarcador; nunca sai da empresa dele.
--   shipper_network_settings  o que o embarcador aceita compartilhar com a Rede Frotak (opt-in).
--   driver_trip_links         link unico por viagem que a transportadora manda ao motorista (sem app).
--   driver_link_events        registro do que o motorista fez pelo link (status, posicao, lancamentos).
--
-- O que o motorista lanca pelo link (abastecimento, despesa) vai para as tabelas que a
-- transportadora ja usa: fuel_records e freight_expenses.
--
-- Regras de privacidade (garantidas no servidor, que e o unico que le estas tabelas):
--   - o embarcador nunca ve valor pago ao motorista, valor do frete nem outros clientes da transportadora;
--   - a Rede Frotak mostra so motoristas que aceitaram entrar nela, e nunca diz com quem rodaram;
--   - o motorista ve so o proprio acerto, nunca o resultado da viagem para a transportadora.
--
-- Como nas tabelas do portal (202611110002), anon e authenticated nao tem acesso direto:
-- tudo passa pelo servidor do app com service role, depois de conferir a sessao ou o link.

begin;

create table if not exists public.driver_network_profiles (
  id uuid primary key default gen_random_uuid(),
  phone_digits text not null,
  full_name text not null,
  cpf_digits text,
  vehicle_kind text,
  base_city text,
  base_state text,
  network_opt_in boolean not null default false,
  network_opt_in_at timestamptz,
  available_from date,
  available_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_network_profiles_phone_key unique (phone_digits),
  constraint driver_network_profiles_phone_chk check (phone_digits ~ '^[0-9]{10,13}$'),
  constraint driver_network_profiles_cpf_chk check (cpf_digits is null or cpf_digits ~ '^[0-9]{11}$'),
  constraint driver_network_profiles_name_chk check (btrim(full_name) <> '')
);

create unique index if not exists driver_network_profiles_cpf_uidx
  on public.driver_network_profiles (cpf_digits) where cpf_digits is not null;
create index if not exists driver_network_profiles_opt_in_idx
  on public.driver_network_profiles (base_state, base_city) where network_opt_in;

create table if not exists public.driver_network_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  profile_id uuid not null references public.driver_network_profiles(id) on delete cascade,
  relation text not null default 'terceiro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_network_links_driver_key unique (tenant_id, driver_id),
  constraint driver_network_links_relation_chk check (relation in ('frota', 'agregado', 'terceiro'))
);

create index if not exists driver_network_links_profile_idx on public.driver_network_links (profile_id);

create table if not exists public.driver_network_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.driver_network_profiles(id) on delete cascade,
  kind text not null,
  number_hint text,
  expires_at date,
  storage_bucket text,
  storage_path text,
  informed_by text not null default 'motorista',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_network_documents_kind_key unique (profile_id, kind),
  constraint driver_network_documents_kind_chk check (kind in ('cnh', 'rntrc', 'seguro', 'crlv', 'gr')),
  constraint driver_network_documents_hint_chk check (number_hint is null or length(number_hint) <= 8),
  constraint driver_network_documents_informed_chk check (informed_by in ('motorista', 'transportadora'))
);

create table if not exists public.driver_trip_ratings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.driver_network_profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  freight_id uuid not null,
  shipper_id uuid references public.shippers(id) on delete cascade,
  rater text not null,
  score smallint not null,
  on_time boolean,
  comment text,
  rated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint driver_trip_ratings_rater_chk check (rater in ('embarcador', 'transportadora')),
  constraint driver_trip_ratings_score_chk check (score between 1 and 5),
  constraint driver_trip_ratings_shipper_chk check ((rater = 'embarcador') = (shipper_id is not null)),
  constraint driver_trip_ratings_comment_chk check (comment is null or length(comment) <= 500)
);

create unique index if not exists driver_trip_ratings_shipper_uidx
  on public.driver_trip_ratings (freight_id, shipper_id) where shipper_id is not null;
create unique index if not exists driver_trip_ratings_carrier_uidx
  on public.driver_trip_ratings (freight_id) where rater = 'transportadora';
create index if not exists driver_trip_ratings_profile_idx on public.driver_trip_ratings (profile_id);

create table if not exists public.shipper_driver_decisions (
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  profile_id uuid not null references public.driver_network_profiles(id) on delete cascade,
  status text not null,
  reason text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (shipper_id, profile_id),
  constraint shipper_driver_decisions_status_chk check (status in ('aprovado', 'em_revisao', 'bloqueado')),
  constraint shipper_driver_decisions_reason_chk check (reason is null or length(reason) <= 300)
);

create index if not exists shipper_driver_decisions_profile_idx
  on public.shipper_driver_decisions (profile_id, status);

create table if not exists public.shipper_driver_notes (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  profile_id uuid not null references public.driver_network_profiles(id) on delete cascade,
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  constraint shipper_driver_notes_body_chk check (btrim(body) <> '' and length(body) <= 1000)
);

create index if not exists shipper_driver_notes_lookup_idx
  on public.shipper_driver_notes (shipper_id, profile_id, created_at desc);

create table if not exists public.shipper_network_settings (
  shipper_id uuid primary key references public.shippers(id) on delete cascade,
  share_approved boolean not null default false,
  share_ratings boolean not null default true,
  share_blocks boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_trip_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  freight_id uuid not null,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  profile_id uuid not null references public.driver_network_profiles(id) on delete cascade,
  token_hash text not null,
  phone_digits text not null,
  -- Valor combinado com o motorista para esta viagem (so ele e a transportadora veem).
  driver_pay_amount numeric(14,2),
  expires_at timestamptz not null default (now() + interval '20 days'),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_trip_links_token_key unique (token_hash),
  constraint driver_trip_links_token_chk check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint driver_trip_links_pay_chk check (driver_pay_amount is null or driver_pay_amount >= 0),
  constraint driver_trip_links_expiry_chk check (expires_at <= created_at + interval '60 days')
);

create index if not exists driver_trip_links_freight_idx on public.driver_trip_links (tenant_id, freight_id);
create index if not exists driver_trip_links_profile_idx on public.driver_trip_links (profile_id, created_at desc);

create table if not exists public.driver_link_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.driver_trip_links(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  freight_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint driver_link_events_kind_chk check (
    kind in ('aberto', 'status', 'posicao', 'abastecimento', 'despesa', 'documento', 'rede')
  )
);

create index if not exists driver_link_events_freight_idx
  on public.driver_link_events (tenant_id, freight_id, created_at desc);

-- updated_at automatico (funcao criada em 202611110002).
drop trigger if exists driver_network_profiles_touch on public.driver_network_profiles;
create trigger driver_network_profiles_touch before update on public.driver_network_profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists driver_network_links_touch on public.driver_network_links;
create trigger driver_network_links_touch before update on public.driver_network_links
  for each row execute function public.touch_updated_at();
drop trigger if exists driver_network_documents_touch on public.driver_network_documents;
create trigger driver_network_documents_touch before update on public.driver_network_documents
  for each row execute function public.touch_updated_at();
drop trigger if exists driver_trip_links_touch on public.driver_trip_links;
create trigger driver_trip_links_touch before update on public.driver_trip_links
  for each row execute function public.touch_updated_at();

alter table public.driver_network_profiles enable row level security;
alter table public.driver_network_links enable row level security;
alter table public.driver_network_documents enable row level security;
alter table public.driver_trip_ratings enable row level security;
alter table public.shipper_driver_decisions enable row level security;
alter table public.shipper_driver_notes enable row level security;
alter table public.shipper_network_settings enable row level security;
alter table public.driver_trip_links enable row level security;
alter table public.driver_link_events enable row level security;

revoke all on public.driver_network_profiles from anon, authenticated;
revoke all on public.driver_network_links from anon, authenticated;
revoke all on public.driver_network_documents from anon, authenticated;
revoke all on public.driver_trip_ratings from anon, authenticated;
revoke all on public.shipper_driver_decisions from anon, authenticated;
revoke all on public.shipper_driver_notes from anon, authenticated;
revoke all on public.shipper_network_settings from anon, authenticated;
revoke all on public.driver_trip_links from anon, authenticated;
revoke all on public.driver_link_events from anon, authenticated;

-- Sem policies de proposito: so o service role (servidor do app) le e grava.

commit;
