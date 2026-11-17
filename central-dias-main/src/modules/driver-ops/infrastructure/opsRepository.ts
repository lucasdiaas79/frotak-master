import { supabase } from "@/lib/supabase";
import type { WorkDay } from "@/modules/driver-ops/domain/journey";

// Leitura e escrita da operacao com embarcador. Tudo passa pelo RLS do tenant
// (private.can_access_tenant) e pelas RPCs com conferencia de modulo no banco.

export type StopRow = {
  id: string;
  seq: number;
  kind: "origem" | "entrega" | "destino" | "retorno";
  name: string;
  city: string | null;
  window_from: string | null;
  window_to: string | null;
  status: string;
  arrived_at: string | null;
  finished_at: string | null;
  arrival_source: string | null;
  boxes_delivered: number | null;
  refusal_reason: string | null;
  refusal_note: string | null;
  receiver_name: string | null;
  signature_data: string | null;
  pod_photo_paths: string[];
  invoices: { number: string; boxes: number; amount: number }[];
  returnables_expected: Record<string, number>;
  returnables_collected: Record<string, number>;
  payment_expected: { method: string; amount: number } | null;
  payment_received: { method: string; amount: number; received: boolean } | null;
};

export type RouteRow = {
  id: string;
  code: string;
  kind: string;
  title: string;
  shipper_name: string | null;
  status: string;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  start_odometer: number | null;
  end_odometer: number | null;
  total_boxes: number;
  distance_km: number | null;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; plate: string } | null;
  delivery_route_stops: StopRow[];
};

export type RouteEvent = {
  id: string;
  route_id: string;
  kind: string;
  detail: string | null;
  occurred_at: string;
};

export type OccurrenceRow = {
  id: string;
  kind: string;
  severity: string;
  status: string;
  note: string | null;
  occurred_at: string;
  geo: { lat: number; lng: number } | null;
  photo_paths: string[];
  driver: { name: string } | null;
  vehicle: { plate: string } | null;
  driver_occurrence_messages: {
    id: string;
    author_kind: string;
    body: string;
    created_at: string;
  }[];
};

export type FuelDocRow = {
  id: string;
  recorded_at: string;
  vehicle_plate: string;
  driver_name: string | null;
  station: string;
  odometer: number;
  diesel_liters: number;
  diesel_amount: number;
  arla_liters: number;
  tank_full: boolean | null;
  checks: { code: string; detail: string }[];
  review_status: string;
  driver_justification: string | null;
  vehicle_id: string | null;
};

export type StationRow = {
  id: string;
  name: string;
  brand: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  diesel_price: number | null;
  arla_price: number | null;
  payment_methods: string[];
  active: boolean;
};

export type DriverRow = { id: string; name: string; vehicle_id: string | null; active: boolean };
export type VehicleRow = { id: string; plate: string; model: string | null; brand: string | null };

export type FuelProfileRow = {
  vehicle_id: string;
  tank_capacity_liters: number;
  km_per_liter_target: number | null;
};

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  tag: string;
  author_label: string;
  requires_ack: boolean;
  published_at: string;
  driver_notice_acks: { driver_id: string; acked_at: string }[];
};

export type ComplianceDocRow = {
  id: string;
  driver_id: string;
  kind: string;
  label: string;
  number: string | null;
  expires_at: string;
  blocking: boolean;
  status: string;
  file_path: string | null;
  submitted_at: string | null;
  driver: { name: string } | null;
};

export type ChecklistRow = {
  id: string;
  moment: string;
  approved: boolean;
  failed_items: string[];
  performed_at: string;
  maintenance_status: string;
  maintenance_note: string | null;
  driver: { name: string } | null;
  vehicle: { plate: string } | null;
};

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { from: start.toISOString(), to: end.toISOString() };
}

export async function listRoutes(date: string) {
  const { from, to } = dayBounds(date);
  const rows = check(
    await supabase
      .from("delivery_routes")
      .select(
        "id, code, kind, title, shipper_name, status, scheduled_at, started_at, finished_at, start_odometer, end_odometer, total_boxes, distance_km, driver:drivers(id, name), vehicle:vehicles(id, plate), delivery_route_stops(*)",
      )
      .or(`and(scheduled_at.gte.${from},scheduled_at.lt.${to}),status.eq.em_andamento`)
      .order("scheduled_at"),
  ) as unknown as RouteRow[];
  for (const r of rows) r.delivery_route_stops.sort((a, b) => a.seq - b.seq);
  return rows;
}

export async function listRouteEvents(routeIds: string[]) {
  if (!routeIds.length) return [];
  return check(
    await supabase
      .from("delivery_route_events")
      .select("id, route_id, kind, detail, occurred_at")
      .in("route_id", routeIds)
      .order("occurred_at", { ascending: false })
      .limit(60),
  ) as RouteEvent[];
}

export async function upsertRoute(tenantId: string, payload: Record<string, unknown>) {
  return check(await supabase.rpc("route_upsert", { p_tenant_id: tenantId, p_route: payload }));
}

export async function listWorkDays(from: string, to: string) {
  return check(
    await supabase
      .from("driver_work_days")
      .select(
        "id, driver_id, work_date, started_at, ended_at, confirmed_by_driver_at, driver_punches(id, activity, started_at, ended_at, source, reason, adjustment_status, adjustment_reason, original_started_at)",
      )
      .gte("work_date", from)
      .lte("work_date", to)
      .order("started_at"),
  ) as WorkDay[];
}

export async function previousDayEnds(driverIds: string[], before: string) {
  if (!driverIds.length) return {} as Record<string, string>;
  const rows = check(
    await supabase
      .from("driver_work_days")
      .select("driver_id, ended_at")
      .in("driver_id", driverIds)
      .lt("work_date", before)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(200),
  ) as { driver_id: string; ended_at: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) if (!map[r.driver_id]) map[r.driver_id] = r.ended_at;
  return map;
}

export async function reviewAdjustment(punchId: string, approve: boolean) {
  return check(
    await supabase.rpc("journey_review_adjustment", { p_punch_id: punchId, p_approve: approve }),
  );
}

export async function listOccurrences(onlyOpen: boolean) {
  let q = supabase
    .from("driver_occurrences")
    .select(
      "id, kind, severity, status, note, occurred_at, geo, photo_paths, driver:drivers(name), vehicle:vehicles(plate), driver_occurrence_messages(id, author_kind, body, created_at)",
    )
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (onlyOpen) q = q.neq("status", "resolvida");
  const rows = check(await q) as unknown as OccurrenceRow[];
  for (const o of rows)
    o.driver_occurrence_messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows;
}

export async function replyOccurrence(id: string, body: string, status?: string) {
  return check(
    await supabase.rpc("occurrence_reply", {
      p_occurrence_id: id,
      p_body: body,
      p_status: status ?? null,
    }),
  );
}

export async function listFuelDocs(onlyPending: boolean) {
  let q = supabase
    .from("fuel_documents")
    .select(
      "id, recorded_at, vehicle_plate, driver_name, station, odometer, diesel_liters, diesel_amount, arla_liters, tank_full, checks, review_status, driver_justification, vehicle_id",
    )
    .order("recorded_at", { ascending: false })
    .limit(80);
  if (onlyPending) q = q.eq("review_status", "pendente");
  return check(await q) as FuelDocRow[];
}

export async function reviewFuel(id: string, approve: boolean, note?: string) {
  return check(
    await supabase.rpc("fuel_review", {
      p_fuel_document_id: id,
      p_approve: approve,
      p_note: note ?? null,
    }),
  );
}

export async function fuelEfficiency(vehicleId: string, from: string) {
  return check(
    await supabase.rpc("fuel_efficiency", {
      p_vehicle_id: vehicleId,
      p_from: from,
      p_to: new Date().toISOString(),
    }),
  ) as { km: number; liters: number; average: number | null; target: number | null };
}

export async function listStations() {
  return check(await supabase.from("fuel_stations").select("*").order("name")) as StationRow[];
}

export async function saveStation(
  tenantId: string,
  station: Partial<StationRow> & { name: string },
) {
  const row = { ...station, tenant_id: tenantId };
  return check(await supabase.from("fuel_stations").upsert(row).select().single());
}

export async function listDrivers() {
  return check(
    await supabase
      .from("drivers")
      .select("id, name, vehicle_id, active")
      .eq("active", true)
      .order("name"),
  ) as DriverRow[];
}

export async function listVehicles() {
  return check(
    await supabase.from("vehicles").select("id, plate, model, brand").order("plate"),
  ) as VehicleRow[];
}

export async function listFuelProfiles() {
  return check(
    await supabase
      .from("vehicle_fuel_profiles")
      .select("vehicle_id, tank_capacity_liters, km_per_liter_target"),
  ) as FuelProfileRow[];
}

export async function saveFuelProfile(tenantId: string, profile: FuelProfileRow) {
  return check(
    await supabase.from("vehicle_fuel_profiles").upsert({ ...profile, tenant_id: tenantId }),
  );
}

export async function driverScore(driverId: string, from: string) {
  return check(
    await supabase.rpc("driver_score_report", {
      p_driver_id: driverId,
      p_from: from,
      p_to: new Date().toISOString(),
    }),
  ) as {
    total: number;
    tier: { label: string; amount: number } | null;
    kmPerLiter: number | null;
    lines: {
      key: string;
      label: string;
      points: number;
      max: number;
      why: string;
      available: boolean;
    }[];
  };
}

export async function listNotices() {
  return check(
    await supabase
      .from("driver_notices")
      .select(
        "id, title, body, tag, author_label, requires_ack, published_at, driver_notice_acks(driver_id, acked_at)",
      )
      .order("published_at", { ascending: false })
      .limit(50),
  ) as NoticeRow[];
}

export async function createNotice(
  tenantId: string,
  notice: { title: string; body: string; tag: string; requires_ack: boolean; author_label: string },
) {
  return check(await supabase.from("driver_notices").insert({ ...notice, tenant_id: tenantId }));
}

export async function listComplianceDocs() {
  return check(
    await supabase
      .from("driver_compliance_documents")
      .select(
        "id, driver_id, kind, label, number, expires_at, blocking, status, file_path, submitted_at, driver:drivers(name)",
      )
      .order("expires_at"),
  ) as unknown as ComplianceDocRow[];
}

export async function saveComplianceDoc(
  tenantId: string,
  doc: {
    id?: string;
    driver_id: string;
    kind: string;
    label: string;
    expires_at: string;
    blocking: boolean;
    status?: string;
    number?: string | null;
  },
) {
  return check(
    await supabase.from("driver_compliance_documents").upsert({ ...doc, tenant_id: tenantId }),
  );
}

export async function opsFileUrl(path: string) {
  const { data, error } = await supabase.storage.from("driver-ops").createSignedUrl(path, 600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function listChecklists(onlyPending: boolean) {
  let q = supabase
    .from("vehicle_checklists")
    .select(
      "id, moment, approved, failed_items, performed_at, maintenance_status, maintenance_note, driver:drivers(name), vehicle:vehicles(plate)",
    )
    .order("performed_at", { ascending: false })
    .limit(60);
  if (onlyPending) q = q.eq("maintenance_status", "pendente");
  return check(await q) as unknown as ChecklistRow[];
}

export async function resolveChecklist(id: string, note: string) {
  return check(
    await supabase
      .from("vehicle_checklists")
      .update({ maintenance_status: "resolvida", maintenance_note: note || null })
      .eq("id", id),
  );
}
