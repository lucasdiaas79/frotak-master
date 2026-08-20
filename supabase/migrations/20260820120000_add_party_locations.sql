alter table public.senders
  add column if not exists address text,
  add column if not exists location_label text,
  add column if not exists location_source text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz;

alter table public.recipients
  add column if not exists address text,
  add column if not exists location_label text,
  add column if not exists location_source text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'senders_location_source_chk'
      and conrelid = 'public.senders'::regclass
  ) then
    alter table public.senders
      add constraint senders_location_source_chk
      check (location_source is null or location_source in ('geocoded', 'manual'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipients_location_source_chk'
      and conrelid = 'public.recipients'::regclass
  ) then
    alter table public.recipients
      add constraint recipients_location_source_chk
      check (location_source is null or location_source in ('geocoded', 'manual'));
  end if;
end $$;

create index if not exists senders_location_idx
  on public.senders (tenant_id, lat, lng)
  where lat is not null and lng is not null;

create index if not exists recipients_location_idx
  on public.recipients (tenant_id, lat, lng)
  where lat is not null and lng is not null;
