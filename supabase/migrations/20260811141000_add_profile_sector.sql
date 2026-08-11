alter table public.profiles
add column if not exists sector text;

comment on column public.profiles.sector is
  'Operational sector/department informed by the workspace owner when creating tenant users.';
