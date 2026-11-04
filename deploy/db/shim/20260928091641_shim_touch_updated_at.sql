-- A migration 20260928091642 usa public.touch_updated_at(), que no repositorio so e criada em
-- 202610150001. Em producao ela veio do projeto antigo. Este arquivo so existe para montar um
-- banco do zero; nao vai para supabase/migrations para nao entrar fora de ordem em producao.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
