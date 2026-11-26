-- Reset oficial dos cadastros de frota a partir de vinculacoes_motoristas_veiculos_implementos.xlsx.
-- Fonte: aba "Vincula??es" da planilha enviada em 2026-06-10.
-- Linhas importadas: 86.
-- Duplicidades de placa normalizada tratadas pela ultima ocorrencia da planilha: SKT0H86, QMF5078, SNN1A40.

set statement_timeout = 0;

drop index if exists public.trailers_vehicle_id_unique;

create temp table official_fleet_assignments (
  row_num integer primary key,
  driver_name text not null,
  vehicle_plate text not null,
  trailer_text text null
) on commit drop;

insert into official_fleet_assignments (row_num, driver_name, vehicle_plate, trailer_text) values
  (2, 'MARCIO FERREIRA DE OLIVEIRA JUNIOR', 'OEP4630', 'FQX-5878/SE'),
  (3, 'CARLOS JOSE DOS SANTOS', 'RQY-7G96', 'QMP-0J72'),
  (4, 'GEOVAN LUCENA DOS SANTOS', 'OEP5060', 'NVL-5290/SE'),
  (5, 'ELIAS BARBOSA REIS', 'RRA-5D83', 'OEP-1428/SE'),
  (6, 'EUCLESIO ANCHIETA SILVA DE OLIVEIRA', 'OER5D76', 'QMG-1611/SE/QMG-1621/SE'),
  (7, 'GENISSON BENTO SANTOS', 'SKT-0H86', 'SKT-1F79/BA'),
  (8, 'WANDERSON SOUSA SILVA', 'OEP-4660', 'PEO-1459/SE'),
  (9, 'EDSON JOAQUIM DE FREITAS JUNIOR', 'OZB6F80', 'TNX-7F12/SE'),
  (10, 'JOSE CLAUDIO SOUZA DOS SANTOS', 'OZB6G30', 'RQX-2A52/SE'),
  (11, 'AURELIANO DIAS DOS SANTOS', 'PXA4173', 'OZB-0080/SE'),
  (12, 'WELINGTON SANTOS MENDONÇA', 'QKN9569', 'QKT-8A20/SE'),
  (13, 'MATHEUS DE CASTRO FIGUEIREDO', 'QKT8678', 'QMC-8384/SE'),
  (14, 'EVERTON OLIVEIRA PAIXAO', 'QKT8G48', 'QKN-9589/SE'),
  (15, 'CLEIBER CHRISTIAN SILVA SANTOS', 'RPK-8I62', 'BAW-1E49/SE'),
  (16, 'ALLAN SANTOS NUNES', 'TGR-4E80', 'RRF-9H61/SE'),
  (17, 'ADENOALDO SANTOS PRADO', 'QKV5G00', 'QKO-3E86/SE'),
  (18, 'JOSÉ CLÁUDIO', 'QKR-2H50', 'QKO-3079/SE'),
  (19, 'WELLINGTON DA SILVA SANTANA', 'QKX8H08', 'QKQ-6928/SE'),
  (20, 'EDIVALDO DOS SANTOS JUNIOR', 'QMB6539', 'RQX-2A61/SE'),
  (21, 'GILMAR FERNANDES DA SILVA', 'QMF1420', 'OES-6805/SE'),
  (22, 'EDIVAN CRUZ SILVA', 'QMF1430', 'AWV-9G47/SE'),
  (23, 'MISAEL SANTOS', 'QMF4977', 'OZB-9300/SE'),
  (24, 'GILVAN DA CRUZ SANTOS', 'QMF5038', 'SKA-6I58/BA'),
  (25, 'LUCAS VIEIRA DA CRUZ', 'QMF5078', 'QKN-1238/SE'),
  (26, 'MADSTON JOSE LIMA DA SILVA', 'QMH9946', 'QMI-0171/SE/QMI-0501/SE'),
  (27, 'JAILSON DOS SANTOS', 'QMH9957', 'QMH-2366/SE/QMH-2467/SE'),
  (28, 'JOSE ALBERTO FERREIRA DE MELO', 'QMH9996', 'RPK-2F93/BA'),
  (29, 'SIDNEI DE JESUS SANTOS DE OLIVEIRA', 'QMI0018', 'OEQ-5460/SE'),
  (30, 'LUIZ CARLOS DOS SANTOS', 'QMI0061', 'QMN-5166'),
  (31, 'MAURICIO DE SOUZA LIRIO', 'QMJ0813', 'QMP-0J64/SE'),
  (32, 'ADRIANO JOSE DE OLIVEIRA', 'QMJ0831', 'NYP-3I72/SE'),
  (33, 'GEILSON BARRETO DE SOUZA', 'QMJ6E24', 'QKT-2368/SE/QKT-2348/SE'),
  (34, 'CLEBER DE FREITAS GAMA', 'SNN-1A40', 'OEO-9808/SE'),
  (35, 'OBS: CONJUNTO EM REFORMA', 'QML4B91', 'QMI-0171/SE/QMI-0501/SE'),
  (36, 'ALEX DA PAIXAO SANTOS', 'QMN1E70', 'QMP-4H15/SE'),
  (37, 'JOSE FERREIRA RAMOS', 'QMN4J58', 'OEP-5313/SE'),
  (38, 'ISMAEL COELHO ROCHA', 'TOA-5E34', 'RPZ-2C69/BA'),
  (39, 'ANDRE LUIZ SIQUEIRA', 'QMN6D08', 'FCR-4516/SE/FDS-2710/SE'),
  (40, 'EDVAN GOMES DE CAMPOS', 'QML-A286', 'OZB-9280/SE'),
  (41, 'CLEONE MELO SANTOS', 'QMP1J25', 'MMH-7D63/SE/MMH-7E23/SE'),
  (42, 'ADENOALDO MARCOS DOS SANTOS', 'QMP3D73', 'QMG-8J94/SE/QMG-8J95/SE'),
  (43, 'DIEGO DA SILVA', 'QPG3F30', 'QKN-9F79/SE'),
  (44, 'FERNANDO MELO SANTOS', 'RDO9C94', 'FYQ-7J37/BA/FXW-5G27/BA'),
  (45, 'PAULO ROBERTO DOS SANTOS PINTO', 'RPK6D80', 'NZG-5781/SE'),
  (46, 'EDSON DOS SANTOS ALVES', 'RPK7C29', 'SJU-1C29/BA'),
  (47, 'JOSELITO FELIX DOS SANTOS', 'OES-5D04', 'FNM-8193/SE'),
  (48, 'ELENILSON DOS SANTOS', 'RPL7I72', 'QMN-5I87/SE'),
  (49, 'EDINALDO DOS SANTOS ALVES', 'RQX6A36', 'THH-3A25/BA'),
  (50, 'ADILSON DA CRUZ SANTOS', 'RQX9G64', ''),
  (51, 'ADILSON SILVA DE SOUZA SANTOS', 'RQY5C86', 'QKZ-2903/SE'),
  (52, 'THIAGO JOSE DA SILVA', 'RQY5C96', 'OES-1E64/SE'),
  (53, 'LEANDRO PERREIRA DA SILVA', 'RQY8D61', 'KIT-8I42/PE/KIT-8I22/PE'),
  (54, 'EDSON PINHEIRO DOS SANTOS', 'RRA3C55', 'RPR-2J38/BA'),
  (55, 'LAYS BRAZ CRUZ', 'QMN-6B48', 'RRB-0H36'),
  (56, 'LUIZ CARLOS MATIAS', 'RRB2I87', 'THH-5G21/BA'),
  (57, 'PAULO CESAR MENEZES DE SOUZA', 'QMI-OOO8', 'EQK-8F29/SE/EWO-7D69/SE'),
  (58, 'MACIEL SILVA AZEVEDO', 'RRD1D03', 'SJN-3I69/BA'),
  (59, 'GILMARKNEI DE SOUZA', 'RRD3I84', 'SJN-6C17/BA'),
  (60, 'EDIMILSO RAMOS BONFIM', 'RRG4G15', 'RPO-9I10/BA'),
  (61, 'MARCELO VIEIRA DE SOUZA', 'RRG4G22', 'SKL-8C11/BA'),
  (62, 'RENILDO DA SILVA', 'RRG4I84', 'QKR-8B09/SE'),
  (63, 'AILTON DOS SANTOS OLIVEIRA', 'RRH1B72', 'THH-5E39/BA'),
  (64, 'GENIVALDO DA CONCEIÇÃO', 'RZJ3D34', 'QKQ-5838/SE'),
  (65, 'LUIS FERNANDO CARDOSO ALVES', 'RZJ3D64', 'TNX-6J92/SE'),
  (66, 'EDVALDO DOS REIS SANTOS', 'SJM2D77', 'TGV-3D88/BA'),
  (67, 'MARCOS ANTONIO FERREIRA DE LIMA', 'SJM7J27', 'TGX-8B39/BA'),
  (68, 'MOISES FRANCISCO DOS SANTOS COSTA', 'SJP2H75', 'SJQ-5E19/BA'),
  (69, 'GINALDI SILVA SANTOS', 'SJT7F67', 'QMP-1J07/SE'),
  (70, 'VAGNER RAMOS DOS SANTOS', 'SJT9H45', 'QMP-1H33/SE'),
  (71, 'JOSE APARECIDO ALVES', 'SKA7F34', 'SKA-3C88/BA'),
  (72, 'JOSE DE JESUS RIBEIRO', 'SKD4E05', 'SKA-3F02/BA'),
  (73, 'ANDRE FERREIRA RAMOS', 'SKE0H10', 'OKN-1137/SE'),
  (74, 'ALEXSANDRO MENEZES SANTOS', 'SKI9J45', 'SKL-7E36/BA'),
  (75, 'JHON LAZARO SOUZA SANTOS', 'SKN0F87', 'SKL-1F77/BA'),
  (76, 'HERALDO FERREIRA LEAL', 'SKN1C11', 'SKM-9F53/BA'),
  (77, 'GENISSON BENTO SANTOS', 'SKT0H86', 'SKT-1F79/BA'),
  (78, 'RAFAEL SILVA BISPO', 'SKT7C09', 'SKT-0F95/BA'),
  (79, 'CLEBER DE FREITAS GAMA', 'SNN1A40', 'OEO-9808/SE'),
  (80, 'ANDERSON DOS SANTOS', 'SNQ5G55', 'OZB-3742/SE'),
  (81, 'THIAGO LORRAN RESENDE SANTOS', 'SNR3J63', 'OEP-1954/SE'),
  (82, 'ADEMAR PRADO SANTOS', 'SOV2D25', 'SJT-4G36/BA'),
  (83, 'SIVAL CABRAL SANTOS', 'SOV2D65', 'QKU-1699/SE/QKU-1959/SE'),
  (84, 'LEONARDO VIEIRA SANTOS', 'QMF-5078', 'QKN-1238/SE'),
  (85, 'ANDRE LUIS ARAUJO DE JESUS', 'TNY1I05', 'TGV-1J23/BA'),
  (86, 'JULIO DE OLIVEIRA SANTOS JUNIOR', 'UHK3H66', 'OEM-5156/SE'),
  (87, 'GENISSON SANTOS SOUZA', 'UHM1D66', 'RRD-7A74/SE');

alter table public.freight_history drop constraint if exists freight_history_vehicle_id_fkey;
alter table public.freight_history drop constraint if exists freight_history_driver_id_fkey;
alter table public.freight_history drop constraint if exists freight_history_trailer_id_fkey;
alter table public.fuel_records drop constraint if exists fuel_records_vehicle_id_fkey;
alter table public.fuel_records drop constraint if exists fuel_records_driver_id_fkey;

update public.freight_history
set vehicle_id = null,
    driver_id = null,
    trailer_id = null,
    updated_at = now();

update public.fuel_records
set vehicle_id = null,
    driver_id = null,
    updated_at = now();

truncate table
  public.vehicle_trailers,
  public.freight_documents,
  public.vehicle_positions,
  public.fleet_events,
  public.vehicles,
  public.drivers,
  public.trailers
restart identity cascade;

alter table public.freight_history
  add constraint freight_history_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehicles(id) on delete set null;

alter table public.freight_history
  add constraint freight_history_driver_id_fkey
  foreign key (driver_id) references public.drivers(id) on delete set null;

alter table public.freight_history
  add constraint freight_history_trailer_id_fkey
  foreign key (trailer_id) references public.trailers(id) on delete set null;

alter table public.fuel_records
  add constraint fuel_records_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehicles(id) on delete set null;

alter table public.fuel_records
  add constraint fuel_records_driver_id_fkey
  foreign key (driver_id) references public.drivers(id) on delete set null;

insert into public.drivers (name, phone, cnh, active, partner_role)
select distinct driver_name, null, null, true, 'Motorista'
from official_fleet_assignments
where driver_name <> ''
  and driver_name not ilike 'OBS:%';

with chosen_vehicles as (
  select distinct on (public.normalize_plate(vehicle_plate))
    row_num,
    driver_name,
    vehicle_plate,
    trailer_text,
    driver_name ilike 'OBS:%' as is_observation
  from official_fleet_assignments
  where public.normalize_plate(vehicle_plate) <> ''
  order by public.normalize_plate(vehicle_plate), row_num desc
)
insert into public.vehicles (
  plate,
  type,
  fleet_kind,
  status,
  vehicle_situation,
  freight_stage,
  city,
  state,
  lat,
  lng
)
select
  upper(trim(vehicle_plate)),
  'CAVALO TRATOR',
  'CAVALO TRATOR',
  case when is_observation then 'manutencao' else 'disponivel-patio' end,
  case when is_observation then 'manutencao' else 'disponivel-patio' end,
  'DISPONIVEL',
  'Pedra Branca',
  'SE',
  0,
  0
from chosen_vehicles;

with trailer_tokens as (
  select distinct upper((matches.match)[1]) as identifier
  from official_fleet_assignments a
  cross join lateral regexp_matches(coalesce(a.trailer_text, ''), '([A-Z]{3}-?[0-9A-Z]{4})', 'g') as matches(match)
)
insert into public.trailers (identifier, type, implement_type, implement_model)
select identifier, 'CACAMBA', 'IMPLEMENTO', 'CACAMBA'
from trailer_tokens
where identifier <> '';

with chosen_vehicles as (
  select distinct on (public.normalize_plate(vehicle_plate))
    row_num,
    driver_name,
    vehicle_plate,
    trailer_text,
    driver_name ilike 'OBS:%' as is_observation
  from official_fleet_assignments
  where public.normalize_plate(vehicle_plate) <> ''
  order by public.normalize_plate(vehicle_plate), row_num desc
),
driver_links as (
  select v.id as vehicle_id, d.id as driver_id
  from chosen_vehicles a
  join public.vehicles v on public.normalize_plate(v.plate) = public.normalize_plate(a.vehicle_plate)
  join public.drivers d on d.name = a.driver_name
  where not a.is_observation
)
update public.vehicles v
set driver_id = dl.driver_id,
    updated_at = now()
from driver_links dl
where v.id = dl.vehicle_id;

update public.drivers d
set vehicle_id = v.id,
    updated_at = now()
from public.vehicles v
where v.driver_id = d.id;

with chosen_vehicles as (
  select distinct on (public.normalize_plate(vehicle_plate))
    row_num,
    driver_name,
    vehicle_plate,
    trailer_text,
    driver_name ilike 'OBS:%' as is_observation
  from official_fleet_assignments
  where public.normalize_plate(vehicle_plate) <> ''
  order by public.normalize_plate(vehicle_plate), row_num desc
),
split_trailers as (
  select
    a.row_num,
    a.driver_name,
    a.vehicle_plate,
    a.is_observation,
    upper((matches.match)[1]) as trailer_identifier,
    ord::integer as raw_position
  from chosen_vehicles a
  cross join lateral regexp_matches(coalesce(a.trailer_text, ''), '([A-Z]{3}-?[0-9A-Z]{4})', 'g') with ordinality as matches(match, ord)
),
resolved as (
  select
    v.id as vehicle_id,
    t.id as trailer_id,
    st.raw_position,
    row_number() over (
      partition by t.id
      order by
        case when st.is_observation then 1 else 0 end,
        st.row_num desc
    ) as conflict_rank
  from split_trailers st
  join public.vehicles v on public.normalize_plate(v.plate) = public.normalize_plate(st.vehicle_plate)
  join public.trailers t on public.normalize_plate(t.identifier) = public.normalize_plate(st.trailer_identifier)
),
chosen as (
  select
    vehicle_id,
    trailer_id,
    row_number() over (partition by vehicle_id order by raw_position, trailer_id) as position
  from resolved
  where conflict_rank = 1
)
insert into public.vehicle_trailers (vehicle_id, trailer_id, position, active)
select vehicle_id, trailer_id, position, true
from chosen;

update public.vehicles v
set trailer_id = first_trailer.trailer_id,
    updated_at = now()
from (
  select distinct on (vehicle_id) vehicle_id, trailer_id
  from public.vehicle_trailers
  where active = true
  order by vehicle_id, position
) first_trailer
where v.id = first_trailer.vehicle_id;

update public.trailers t
set vehicle_id = vt.vehicle_id,
    updated_at = now()
from public.vehicle_trailers vt
where t.id = vt.trailer_id
  and vt.active = true;

insert into public.fleet_events (
  vehicle_id,
  status,
  freight_stage,
  city,
  state,
  source,
  description,
  event_type,
  action_origin,
  metadata
)
select
  v.id,
  v.status,
  v.freight_stage,
  v.city,
  v.state,
  'Sistema',
  'Cadastro de frota reiniciado pela planilha oficial',
  'cadastro_frota_reiniciado',
  'migration',
  jsonb_build_object(
    'source', 'vinculacoes_motoristas_veiculos_implementos.xlsx',
    'migration', '202606100002_reset_fleet_from_spreadsheet',
    'spreadsheetRow', a.row_num,
    'driverName', a.driver_name,
    'trailerText', a.trailer_text
  )
from official_fleet_assignments a
join public.vehicles v on public.normalize_plate(v.plate) = public.normalize_plate(a.vehicle_plate);

