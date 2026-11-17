-- Teste local de ponta a ponta da operacao com embarcador (rodar num banco de teste, nunca em producao).
\set ON_ERROR_STOP 1
\pset pager off
\set QUIET 1
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@exemplo.test'),('00000000-0000-0000-0000-0000000000d1','motorista@exemplo.test');
insert into public.profiles(id,full_name,email) values ('00000000-0000-0000-0000-0000000000a1','Admin Demo','admin@exemplo.test') on conflict (id) do update set active=true;
insert into public.platform_users(user_id,platform_role) values ('00000000-0000-0000-0000-0000000000a1','super_admin');
insert into public.tenants(id,slug,legal_name,trade_name,status) values ('10000000-0000-0000-0000-000000000001','transportes-serigy-demo','Transportes Serigy (demonstracao)','Transportes Serigy','active');
insert into public.workspaces(id,tenant_id,name,slug,is_default) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Matriz','matriz',true);
insert into public.vehicles(id,tenant_id,plate,type,brand,model,manufacture_year) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','FTK4A21','truck','VW','Delivery 13.180',2022);
insert into public.drivers(id,tenant_id,name,phone,vehicle_id,auth_user_id) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Motorista Demo','79999990000','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000d1');
update public.vehicles set driver_id='40000000-0000-0000-0000-000000000001' where id='30000000-0000-0000-0000-000000000001';

-- admin
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false), set_config('request.jwt.claims','{"aal":"aal2"}',false) \gset
select public.master_enable_driver_ops('10000000-0000-0000-0000-000000000001','Operacao Ambev SE','Ambev','Aracaju/SE') as enable;
select public.driver_ops_seed_demo('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','distribuicao') as seed;
-- historico de abastecimento direto
insert into public.fuel_records(tenant_id,vehicle_id,driver_id,vehicle_plate,station,liters,amount,odometer,recorded_at,tank_full)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','FTK4A21','Posto',v.l,v.l*5.9,v.o,now()-v.d*interval '1 day',v.f
from (values (180000,200,10,true),(180210,50,8,true),(180420,49,6,false),(180640,52,4,true)) v(o,l,d,f);
insert into public.vehicle_positions(tenant_id,vehicle_id,lat,lng,speed,recorded_at)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',-10.96+g*0.01,-37.09,case when g=5 then 88 else 50 end, now()-interval '3 hours'+g*interval '10 minutes' from generate_series(0,12) g;

-- motorista
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false), set_config('request.jwt.claims','{}',false) \gset
select jsonb_pretty(jsonb_build_object('modules',c->'modules','vehicle',c->'vehicle','trips',jsonb_array_length(c->'trips'),'stations',jsonb_array_length(c->'stations'),'tpl',jsonb_array_length(c->'checklistTemplate'),'docs',jsonb_array_length(c->'documents'),'notices',jsonb_array_length(c->'notices'),'score',c->'score'->'total','eff',c->'fuelEfficiency'->'average')) from public.get_driver_ops_context() c;

select (public.driver_journey_start(now()-interval '2 hours','{"lat":-10.9622,"lng":-37.0941}',true,'ev1'))->'workDays'->0->'segments'->0->>'reason' as j1;
-- rota sem checklist deve falhar
do $$ begin perform public.driver_route_start((select id from delivery_routes limit 1), 182700, null, null, 'ev2'); raise exception 'deveria falhar'; exception when others then raise notice 'ok bloqueio: %', sqlerrm; end $$;
select jsonb_array_length(public.driver_checklist_submit('saida', (select jsonb_object_agg(i->>'id', jsonb_build_object('answer', case when i->>'id'='limpeza' then 'nok' else 'ok' end, 'note','sujo')) from vehicle_checklist_templates t, jsonb_array_elements(t.items) i), 182700, null, null, now()-interval '100 minutes','ev3')->'checklists') as checklists;
select c->'trips'->0->>'status' st, c->'trips'->0->'stops'->0->>'status' s0 from public.driver_route_start((select id from delivery_routes limit 1), 182700, '{"lat":-10.9622,"lng":-37.0941}', now()-interval '90 minutes', 'ev4') c;
select public.driver_route_start_unload((select id from delivery_route_stops where seq=1), null, now()-interval '80 minutes','ev5')->'trips'->0->'stops'->0->>'status' as s0;
select public.driver_route_finish_stop((select id from delivery_route_stops where seq=1), 'entregue', '{}', null, now()-interval '60 minutes','ev6')->'trips'->0->'stops'->1->>'status' as s1;
select public.driver_route_arrive((select id from delivery_route_stops where seq=2), 'cerca', '{"lat":-10.9139,"lng":-37.0565,"source":"gps"}', now()-interval '40 minutes','ev7')->'trips'->0->'stops'->1->>'arrivalSource' as src;
select public.driver_route_finish_stop((select id from delivery_route_stops where seq=2), 'parcial', '{"boxes_delivered":40,"refusal_reason":"avaria","receiver_name":"Joana (exemplo)","signature":"data:image/png;base64,AAA","returnables":{"garrafeira":38},"payment":{"method":"boleto","amount":3200,"received":true}}', null, now()-interval '30 minutes','ev8')->'trips'->0->'stops'->1->'delivered' as pod;
-- repetir evento: idempotente
select public.driver_route_finish_stop((select id from delivery_route_stops where seq=2), 'parcial', '{}', null, null,'ev8')->'trips'->0->'stops'->1->>'status' as repeat_ok;
-- abastecimento com alerta sem justificativa falha; com justificativa passa
do $$ begin perform public.driver_fuel_register(182760, 60, 420, 3, 12, true, (select id from fuel_stations order by name limit 1), null, 'cartao_frota', null, null, null, null, null, null, 'ev9'); raise exception 'deveria falhar'; exception when others then raise notice 'ok alerta: %', sqlerrm; end $$;
select jsonb_pretty(c->'fuelRecords'->-1) from public.driver_fuel_register(182760, 60, 420, 3, 12, true, (select id from fuel_stations order by name limit 1), null, 'cartao_frota', null, 'Posto cobrou bomba errada', 'tenant/cupom.jpg', null, null, null, 'ev9') c;
do $$ begin perform public.driver_fuel_register(100, 60, 420, 0, 0); raise exception 'deveria falhar'; exception when others then raise notice 'ok odometro: %', sqlerrm; end $$;
select public.driver_occurrence_create('pneu','Pneu furado na Av. Hermes Fontes','alta','{}',null,null,null,null,'ev10')->'occurrences'->0->>'kind' occ;
select jsonb_array_length(c->'occurrences') occs, c->'notices'->0->>'ackAt' ack from public.driver_notice_ack((select id from driver_notices where requires_ack limit 1)) c;
select public.driver_journey_set_activity('refeicao','motorista',null,null,null,'ev11')->'workDays'->-1->'segments'->-1->>'activity' act;
select (select count(*) from driver_punches) punches, (select string_agg(activity||':'||source, ', ' order by started_at) from driver_punches) seq;
select jsonb_pretty(c->'score') from public.get_driver_ops_context() c;
select count(*) events from delivery_route_events;
