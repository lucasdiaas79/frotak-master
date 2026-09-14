-- Rollback operacional da aliquota do frete.
-- Mantem o contrato canonico da criacao de frete em 12 parametros para evitar
-- ambiguidade no PostgREST durante a apresentacao/demo.

drop function if exists public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric, numeric
);

notify pgrst, 'reload schema';
