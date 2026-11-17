import { getSupabaseAdmin } from "./supabase-admin.ts";
import {
  PUBLIC_DOCUMENT_LABELS,
  firstName,
  hashShareToken,
  isPublicDocumentKind,
  isWellFormedShareToken,
  placeLabel,
  publicEventLabel,
  publicStatus,
  type PublicFreightDocument,
  type PublicFreightEvent,
  type PublicFreightTracking,
} from "../../src/lib/freightShare.ts";

// Monta o que a pagina publica de acompanhamento pode mostrar. Roda so no servidor,
// com service role, e devolve apenas campos escolhidos a dedo: nunca valor do frete,
// custos, telefone do motorista ou dados de outro frete.

type Row = Record<string, unknown>;

export type FreightShareResult =
  { ok: true; tracking: PublicFreightTracking } | { ok: false; reason: "not_found" | "expired" };

const DOCUMENT_URL_TTL_SECONDS = 60 * 60;
// Posicao antiga demais confunde mais do que ajuda.
const POSITION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function byId(table: string, id: unknown, columns: string): Promise<Row | null> {
  if (typeof id !== "string" || !id) return null;
  const { data } = await getSupabaseAdmin().from(table).select(columns).eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
}

function buildEvents(rows: Row[]): PublicFreightEvent[] {
  const events: PublicFreightEvent[] = [];
  for (const row of rows) {
    const label = publicEventLabel(text(row.status));
    const at = text(row.timestamp);
    if (!label || !at) continue;
    if (events[events.length - 1]?.label === label) continue;
    events.push({ label, at, place: placeLabel(text(row.city), text(row.state)) });
  }
  return events.reverse();
}

async function buildDocuments(rows: Row[]): Promise<PublicFreightDocument[]> {
  const storage = getSupabaseAdmin().storage;
  const documents: PublicFreightDocument[] = [];
  for (const row of rows) {
    const kind = text(row.kind);
    if (!kind || !isPublicDocumentKind(kind)) continue;
    const bucket = text(row.storage_bucket);
    const path = text(row.storage_path);
    let url: string | undefined;
    if (bucket && path) {
      const { data } = await storage.from(bucket).createSignedUrl(path, DOCUMENT_URL_TTL_SECONDS);
      url = data?.signedUrl;
    }
    const mime = text(row.mime_type) ?? "";
    documents.push({
      kind,
      label: PUBLIC_DOCUMENT_LABELS[kind],
      url,
      sentAt: text(row.created_at) ?? new Date().toISOString(),
      isImage: mime.startsWith("image/"),
    });
  }
  return documents;
}

export async function loadFreightTracking(
  token: string,
  options: { countView?: boolean } = {},
): Promise<FreightShareResult> {
  if (!isWellFormedShareToken(token)) return { ok: false, reason: "not_found" };

  const supabase = getSupabaseAdmin();
  const tokenHash = await hashShareToken(token);
  const { data: link } = await supabase
    .from("freight_share_links")
    .select("id, tenant_id, vehicle_id, freight_id, expires_at, revoked_at, view_count")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!link) return { ok: false, reason: "not_found" };
  if (link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const tenantId = link.tenant_id as string;
  const freightId = link.freight_id as string;

  const vehicle = await byId(
    "vehicles",
    link.vehicle_id,
    "id, tenant_id, plate, current_freight_id, freight_stage, status, driver_id, sender_id, recipient_id, product_id, lat, lng, city, state, last_position_at, updated_at",
  );
  const active =
    !!vehicle && vehicle.tenant_id === tenantId && vehicle.current_freight_id === freightId;

  let history: Row | null = null;
  if (!active) {
    const { data } = await supabase
      .from("freight_history")
      .select(
        "vehicle_plate, driver_name, sender_name, sender_city, sender_state, recipient_name, recipient_city, recipient_state, product_name, final_status, final_freight_stage, finished_at",
      )
      .eq("tenant_id", tenantId)
      .eq("freight_id", freightId)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    history = (data as Row | null) ?? null;
    if (!history) return { ok: false, reason: "not_found" };
  }

  const [tenant, eventsResult, documentsResult] = await Promise.all([
    byId("tenants", tenantId, "trade_name, legal_name"),
    supabase
      .from("fleet_events")
      .select("status, city, state, timestamp")
      .eq("tenant_id", tenantId)
      .eq("freight_id", freightId)
      .order("timestamp", { ascending: true })
      .limit(300),
    supabase
      .from("freight_documents")
      .select("kind, storage_bucket, storage_path, mime_type, created_at")
      .eq("tenant_id", tenantId)
      .eq("freight_id", freightId)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const carrierName = text(tenant?.trade_name) ?? text(tenant?.legal_name) ?? "Transportadora";
  const events = buildEvents((eventsResult.data as Row[] | null) ?? []);
  const documents = await buildDocuments((documentsResult.data as Row[] | null) ?? []);

  let tracking: PublicFreightTracking;
  if (active && vehicle) {
    const [driver, sender, recipient, product] = await Promise.all([
      byId("drivers", vehicle.driver_id, "name"),
      byId("senders", vehicle.sender_id, "name, city, state"),
      byId("recipients", vehicle.recipient_id, "name, city, state"),
      byId("products", vehicle.product_id, "name"),
    ]);
    const status = publicStatus(text(vehicle.freight_stage), text(vehicle.status));
    const lat = num(vehicle.lat);
    const lng = num(vehicle.lng);
    const positionAt = text(vehicle.last_position_at);
    const fresh = !positionAt || Date.now() - new Date(positionAt).getTime() < POSITION_MAX_AGE_MS;
    tracking = {
      carrierName,
      freightCode: `FRT-${String(vehicle.plate)
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()}-${String(vehicle.id).slice(0, 4).toUpperCase()}`,
      plate: String(vehicle.plate),
      driverFirstName: firstName(text(driver?.name)),
      product: text(product?.name),
      origin: placeLabel(text(sender?.city), text(sender?.state)),
      originName: text(sender?.name),
      destination: placeLabel(text(recipient?.city), text(recipient?.state)),
      destinationName: text(recipient?.name),
      step: status.step,
      statusLabel: status.label,
      statusDetail: status.detail,
      occurrence: status.occurrence,
      finished: status.step === "entregue",
      position:
        status.step !== "entregue" && lat !== undefined && lng !== undefined && fresh
          ? { lat, lng, at: positionAt, place: placeLabel(text(vehicle.city), text(vehicle.state)) }
          : undefined,
      events,
      documents,
      expiresAt: String(link.expires_at),
      updatedAt: new Date().toISOString(),
    };
  } else {
    const h = history as Row;
    const delivered =
      publicStatus(text(h.final_freight_stage), text(h.final_status)).step === "entregue";
    tracking = {
      carrierName,
      freightCode: `FRT-${String(h.vehicle_plate ?? "")
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()}-${String(link.vehicle_id).slice(0, 4).toUpperCase()}`,
      plate: String(h.vehicle_plate ?? ""),
      driverFirstName: firstName(text(h.driver_name)),
      product: text(h.product_name),
      origin: placeLabel(text(h.sender_city), text(h.sender_state)),
      originName: text(h.sender_name),
      destination: placeLabel(text(h.recipient_city), text(h.recipient_state)),
      destinationName: text(h.recipient_name),
      step: delivered ? "entregue" : "programado",
      statusLabel: delivered ? "Entregue" : "Frete encerrado",
      statusDetail: delivered ? undefined : "A transportadora encerrou este frete.",
      finished: true,
      events,
      documents,
      expiresAt: String(link.expires_at),
      updatedAt: new Date().toISOString(),
    };
  }

  // Contagem de visitas: ajuda a transportadora a saber se o cliente abriu.
  // A atualizacao automatica da pagina nao conta como nova visita.
  if (options.countView !== false)
    await supabase
      .from("freight_share_links")
      .update({
        view_count: Number(link.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", link.id);

  return { ok: true, tracking };
}
