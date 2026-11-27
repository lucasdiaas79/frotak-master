-- Corrige private.freight_ownership_snapshot (migration 202611260002): a mesma funcao roda em
-- freights e freight_history, e freights nao tem freight_id. Ler new.freight_id direto quebrava
-- todo insert em freights ("record new has no field freight_id"). Agora le pelo jsonb da linha.

create or replace function private.freight_ownership_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  if new.ownership is null then
    if tg_table_name = 'freight_history' and v_row ->> 'freight_id' is not null then
      select f.ownership into new.ownership
      from public.freights f
      where f.id::text = v_row ->> 'freight_id';
    end if;
    if new.ownership is null and v_row ->> 'vehicle_id' is not null then
      select v.ownership into new.ownership
      from public.vehicles v
      where v.id::text = v_row ->> 'vehicle_id';
    end if;
    new.ownership := coalesce(new.ownership, 'propria');
  end if;
  return new;
end;
$$;
