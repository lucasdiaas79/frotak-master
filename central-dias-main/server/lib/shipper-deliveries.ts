import { getSupabaseAdmin } from "./supabase-admin.ts";
import { ShipperError, type ShipperSession } from "./shipper-portal.ts";
import type {
  DeliveryRoute,
  DeliveryStop,
  ShipperDeliveriesData,
} from "../../src/lib/shipper/deliveries.ts";

// Rotas de entrega do embarcador (operacao com embarcador). Le com service role,
// depois de conferir a sessao: so rotas com o CNPJ do embarcador, em transportadoras
// que aceitaram a conexao. Nao sai ponto, abastecimento, custo, telefone nem CPF.

type Row = Record<string, unknown>;

const MAX_DAYS = 62;
const POD_BUCKET = "driver-ops";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const numOrUndef = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const hhmm = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : undefined);

function counts(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Row)) {
    const value = numOrUndef(n);
    if (value !== undefined && value > 0) out[k] = value;
  }
  return out;
}

async function activeCarriers(session: ShipperSession) {
  const { data } = await getSupabaseAdmin()
    .from("shipper_carriers")
    .select("tenant_id, carrier_name, status")
    .eq("shipper_id", session.shipper.id)
    .eq("status", "ativa");
  return new Map(
    ((data as Row[] | null) ?? [])
      .filter((row) => typeof row.tenant_id === "string")
      .map((row) => [row.tenant_id as string, String(row.carrier_name)]),
  );
}

function mapStop(row: Row): DeliveryStop {
  const invoices = Array.isArray(row.invoices) ? (row.invoices as Row[]) : [];
  const paymentExpected = (row.payment_expected as Row | null) ?? null;
  const paymentReceived = (row.payment_received as Row | null) ?? null;
  const received =
    paymentReceived && paymentReceived.received !== false
      ? numOrUndef(paymentReceived.amount)
      : undefined;
  return {
    id: String(row.id),
    seq: Number(row.seq),
    kind: row.kind as DeliveryStop["kind"],
    name: String(row.name),
    document: str(row.document),
    city: str(row.city),
    windowFrom: hhmm(row.window_from),
    windowTo: hhmm(row.window_to),
    status: row.status as DeliveryStop["status"],
    arrivedAt: str(row.arrived_at),
    arrivalSource: (str(row.arrival_source) as DeliveryStop["arrivalSource"]) ?? undefined,
    unloadStartedAt: str(row.unload_started_at),
    finishedAt: str(row.finished_at),
    invoices: invoices.map((nf) => ({
      number: String(nf.number ?? ""),
      boxes: numOrUndef(nf.boxes),
    })),
    boxesDelivered: numOrUndef(row.boxes_delivered),
    refusalReason: str(row.refusal_reason),
    refusalNote: str(row.refusal_note),
    receiverName: str(row.receiver_name),
    signed: !!str(row.signature_data),
    podPhotos: Array.isArray(row.pod_photo_paths)
      ? (row.pod_photo_paths as unknown[]).map((_, i) => String(i))
      : [],
    returnablesExpected: counts(row.returnables_expected),
    returnablesCollected: counts(row.returnables_collected),
    paymentMethod: str(paymentExpected?.method),
    paymentExpected: numOrUndef(paymentExpected?.amount),
    paymentReceived: received,
  };
}

export async function loadShipperDeliveries(
  session: ShipperSession,
  input: { from?: string; to?: string },
): Promise<ShipperDeliveriesData> {
  const now = new Date();
  const to = input.to && !Number.isNaN(Date.parse(input.to)) ? new Date(input.to) : now;
  let from =
    input.from && !Number.isNaN(Date.parse(input.from))
      ? new Date(input.from)
      : new Date(to.getTime() - 6 * 86_400_000);
  if (to.getTime() - from.getTime() > MAX_DAYS * 86_400_000) {
    from = new Date(to.getTime() - MAX_DAYS * 86_400_000);
  }
  const empty = {
    routes: [],
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: now.toISOString(),
  };
  const carriers = await activeCarriers(session);
  if (!carriers.size) return empty;

  const supabase = getSupabaseAdmin();
  const { data: routeRows, error } = await supabase
    .from("delivery_routes")
    .select(
      "id, tenant_id, code, kind, title, status, scheduled_at, started_at, finished_at, start_odometer, end_odometer, total_boxes, distance_km, vehicle_id, driver_id",
    )
    .eq("shipper_cnpj", session.shipper.cnpj)
    .in("tenant_id", [...carriers.keys()])
    .gte("scheduled_at", from.toISOString())
    .lte("scheduled_at", to.toISOString())
    .order("scheduled_at", { ascending: false })
    .limit(400);
  if (error) {
    // Banco ainda sem a operacao com embarcador: o portal segue sem a aba de entregas.
    if (/does not exist|schema cache|Could not find/i.test(error.message)) return empty;
    throw error;
  }
  const routes = (routeRows as Row[] | null) ?? [];
  if (!routes.length) return empty;

  const ids = routes.map((r) => String(r.id));
  const vehicleIds = [...new Set(routes.map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const driverIds = [...new Set(routes.map((r) => r.driver_id).filter(Boolean))] as string[];
  const [stopsRes, vehiclesRes, driversRes, profilesRes] = await Promise.all([
    supabase
      .from("delivery_route_stops")
      .select(
        "id, route_id, seq, kind, name, document, city, window_from, window_to, status, arrived_at, arrival_source, unload_started_at, finished_at, invoices, boxes_delivered, refusal_reason, refusal_note, receiver_name, signature_data, pod_photo_paths, returnables_expected, returnables_collected, payment_expected, payment_received",
      )
      .in("route_id", ids)
      .order("seq"),
    vehicleIds.length
      ? supabase.from("vehicles").select("id, plate").in("id", vehicleIds)
      : Promise.resolve({ data: [] as Row[] }),
    driverIds.length
      ? supabase.from("drivers").select("id, name").in("id", driverIds)
      : Promise.resolve({ data: [] as Row[] }),
    vehicleIds.length
      ? supabase
          .from("vehicle_fuel_profiles")
          .select("vehicle_id, km_per_liter_target")
          .in("vehicle_id", vehicleIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const plate = new Map(
    ((vehiclesRes.data as Row[] | null) ?? []).map((v) => [v.id, str(v.plate)]),
  );
  const driver = new Map(
    ((driversRes.data as Row[] | null) ?? []).map((d) => [d.id, str(d.name)?.split(/\s+/)[0]]),
  );
  const kml = new Map(
    ((profilesRes.data as Row[] | null) ?? []).map((p) => [
      p.vehicle_id,
      numOrUndef(p.km_per_liter_target),
    ]),
  );
  const stopsByRoute = new Map<string, DeliveryStop[]>();
  for (const row of (stopsRes.data as Row[] | null) ?? []) {
    const list = stopsByRoute.get(String(row.route_id)) ?? [];
    list.push(mapStop(row));
    stopsByRoute.set(String(row.route_id), list);
  }

  return {
    routes: routes.map((r): DeliveryRoute => {
      const start = numOrUndef(r.start_odometer);
      const end = numOrUndef(r.end_odometer);
      return {
        id: String(r.id),
        code: String(r.code),
        kind: r.kind === "transferencia" ? "transferencia" : "distribuicao",
        title: String(r.title),
        carrierName: carriers.get(String(r.tenant_id)) ?? "Transportadora",
        status: r.status as DeliveryRoute["status"],
        scheduledAt: String(r.scheduled_at),
        startedAt: str(r.started_at),
        finishedAt: str(r.finished_at),
        plate: plate.get(r.vehicle_id),
        driverFirstName: driver.get(r.driver_id),
        totalBoxes: Number(r.total_boxes ?? 0),
        distanceKm: numOrUndef(r.distance_km),
        kmDriven: start !== undefined && end !== undefined && end > start ? end - start : undefined,
        kmPerLiter: kml.get(r.vehicle_id),
        stops: stopsByRoute.get(String(r.id)) ?? [],
      };
    }),
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: now.toISOString(),
  };
}

/** Link temporario da foto do canhoto, so se a parada for de uma rota do embarcador. */
export async function shipperPodPhotoUrl(session: ShipperSession, stopId: string, index: number) {
  const supabase = getSupabaseAdmin();
  const { data: stop } = await supabase
    .from("delivery_route_stops")
    .select("id, route_id, tenant_id, pod_photo_paths")
    .eq("id", stopId)
    .maybeSingle();
  if (!stop) throw new ShipperError("not_found", "Canhoto não encontrado.");
  const { data: route } = await supabase
    .from("delivery_routes")
    .select("id, tenant_id, shipper_cnpj")
    .eq("id", String(stop.route_id))
    .maybeSingle();
  const carriers = await activeCarriers(session);
  if (
    !route ||
    route.shipper_cnpj !== session.shipper.cnpj ||
    !carriers.has(String(route.tenant_id))
  ) {
    throw new ShipperError("forbidden", "Canhoto não disponível para sua empresa.");
  }
  const paths = Array.isArray(stop.pod_photo_paths) ? (stop.pod_photo_paths as string[]) : [];
  const path = paths[index];
  if (!path) throw new ShipperError("not_found", "Foto não encontrada.");
  const { data } = await supabase.storage.from(POD_BUCKET).createSignedUrl(path, 60 * 10);
  if (!data?.signedUrl) throw new Error("signed url failed");
  return data.signedUrl;
}
