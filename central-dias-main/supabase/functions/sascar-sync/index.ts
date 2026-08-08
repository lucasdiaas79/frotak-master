import { createClient } from "npm:@supabase/supabase-js@2.104.1";

const DEFAULT_WSDL_URL = "https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService?wsdl";
const SOAP_NS = "http://webservice.web.integracao.sascar.com.br/";
const POSITION_BATCH_LIMIT = 3000;
const VEHICLE_BATCH_LIMIT = 1000;
const SASCAR_LOCAL_TIME_OFFSET = "-03:00";
const DEFAULT_SOAP_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RECOVERY_PAGES = 2;

interface SascarVehicle {
  vehicleId: string;
  licensePlate: string;
}

interface SascarPositionPacket {
  vehicleId: string;
  licensePlate?: string;
  packetId: number;
  positionDateUtc?: string;
  packetDateUtc?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  direction?: number;
  ignition?: number;
  gps?: number;
  state?: string;
  city?: string;
  country?: string;
  street?: string;
  referencePoint?: string;
  memory?: number;
  satellite?: number;
  raw: Record<string, unknown>;
}

interface LocalVehicleRow {
  id: string;
  tenant_id: string;
  plate: string;
  sascar_id: string | null;
  last_position_at: string | null;
}

interface SyncInput {
  quantity?: number;
  forceFull?: boolean;
  source?: "cron" | "manual";
}

interface SyncStats {
  quantityRequested: number;
  sascarVehicles: number;
  vehicleBindingsUpdated: number;
  packetsFetched: number;
  packetsApplied: number;
  syncedVehicles: number;
  skippedPackets: number;
  lastPacketIdBefore: number | null;
  lastPacketIdAfter: number | null;
  source: "cron" | "manual";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sascar-sync-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readEnv(name: string) {
  const value = Deno.env.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(readEnv(name));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function buildEnvelope(method: string, params: Record<string, string | number>) {
  const fields = Object.entries(params)
    .map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${SOAP_NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <web:${method}>${fields}</web:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function getSoapUrl() {
  const explicitSoapUrl = readEnv("SASCAR_SOAP_URL");
  if (explicitSoapUrl) return explicitSoapUrl;

  const wsdlUrl = readEnv("SASCAR_WSDL_URL") ?? DEFAULT_WSDL_URL;
  return wsdlUrl.replace(/\?wsdl$/i, "");
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function parseReturnBlocks(xml: string) {
  const faultMatch = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) throw new Error(decodeXml(faultMatch[1]).trim());

  return [...xml.matchAll(/<return>([\s\S]*?)<\/return>/gi)].map((match) =>
    decodeXml(stripCdata(match[1]).trim()),
  );
}

function parseJsonReturns<T>(xml: string): T[] {
  return parseReturnBlocks(xml)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => JSON.parse(block) as T);
}

async function callSoap(method: string, params: Record<string, string | number>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    readPositiveIntegerEnv("SASCAR_SOAP_TIMEOUT_MS", DEFAULT_SOAP_TIMEOUT_MS),
  );

  let response: Response;
  try {
    response = await fetch(getSoapUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      body: buildEnvelope(method, params),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Sascar timeout ao chamar ${method}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  if (!response.ok) throw new Error(`Sascar HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toStringValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "null") return undefined;
  return normalized;
}

function normalizePlate(plate: string) {
  return plate
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 7);
}

function parseSascarDate(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const explicitOffset = trimmed.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i,
  );
  if (explicitOffset) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  const match = trimmed.match(
    /^(\d{4})[-\s](\d{2})[-\s](\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/,
  );
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, ms = "0"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms.padEnd(3, "0").slice(0, 3)}${SASCAR_LOCAL_TIME_OFFSET}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseSascarUtcDate(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const explicitOffset = trimmed.match(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i,
  );
  if (explicitOffset) return parseSascarDate(trimmed);

  const match = trimmed.match(
    /^(\d{4})[-\s](\d{2})[-\s](\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/,
  );
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, ms = "0"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms.padEnd(3, "0").slice(0, 3)}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeVehicle(raw: Record<string, unknown>): SascarVehicle | null {
  const vehicleId = toNumber(raw.vehicleId);
  const licensePlate = toStringValue(raw.licensePlate);
  if (!vehicleId || !licensePlate) return null;

  return {
    vehicleId: String(vehicleId),
    licensePlate: normalizePlate(licensePlate),
  };
}

function normalizePosition(raw: Record<string, unknown>): SascarPositionPacket | null {
  const vehicleId = toNumber(raw.vehicleId ?? raw.idVeiculo);
  const packetId = toNumber(raw.packetId ?? raw.idPacote);
  const latitude = toNumber(raw.latitude);
  const longitude = toNumber(raw.longitude);
  if (!vehicleId || packetId == null || latitude == null || longitude == null) return null;

  return {
    vehicleId: String(vehicleId),
    licensePlate: toStringValue(raw.licensePlate ?? raw.placa)
      ? normalizePlate(String(raw.licensePlate ?? raw.placa))
      : undefined,
    packetId,
    positionDateUtc:
      parseSascarUtcDate(toStringValue(raw.positionDateUtc)) ??
      parseSascarDate(toStringValue(raw.dataPosicao)),
    packetDateUtc:
      parseSascarUtcDate(toStringValue(raw.packetDateUtc)) ??
      parseSascarDate(toStringValue(raw.dataPacote)),
    latitude,
    longitude,
    speed: toNumber(raw.speed ?? raw.velocidade),
    direction: toNumber(raw.direction ?? raw.direcao),
    ignition: toNumber(raw.ignition ?? raw.ignicao),
    gps: toNumber(raw.gps),
    state: toStringValue(raw.state ?? raw.uf),
    city: toStringValue(raw.city ?? raw.cidade),
    country: toStringValue(raw.country ?? raw.pais),
    street: toStringValue(raw.street ?? raw.rua),
    referencePoint: toStringValue(raw.referencePoint ?? raw.pontoReferencia),
    memory: toNumber(raw.memory ?? raw.memoria),
    satellite: toNumber(raw.satellite ?? raw.satelite),
    raw,
  };
}

async function getVehiclesPage(cursor = 0, quantity = VEHICLE_BATCH_LIMIT) {
  const xml = await callSoap("getVehiclesJSON", {
    user: requiredEnv("SASCAR_USER"),
    password: requiredEnv("SASCAR_PASSWORD"),
    quantity,
    vehicleId: cursor,
  });

  return parseJsonReturns<Record<string, unknown>>(xml)
    .map(normalizeVehicle)
    .filter((item): item is SascarVehicle => Boolean(item));
}

async function getAllVehicles() {
  const vehicles: SascarVehicle[] = [];
  let cursor = 0;

  while (true) {
    const page = await getVehiclesPage(cursor, VEHICLE_BATCH_LIMIT);
    if (!page.length) break;

    vehicles.push(...page);
    const lastId = Number(page[page.length - 1].vehicleId);
    if (!Number.isFinite(lastId) || page.length < VEHICLE_BATCH_LIMIT) break;
    cursor = lastId;
  }

  return vehicles;
}

async function getLatestPositionPackets(quantity = POSITION_BATCH_LIMIT) {
  const xml = await callSoap("getPositionPacketWithLicensePlateJSON", {
    user: requiredEnv("SASCAR_USER"),
    password: requiredEnv("SASCAR_PASSWORD"),
    quantity: Math.min(Math.max(quantity, 1), POSITION_BATCH_LIMIT),
  });

  return parseJsonReturns<Record<string, unknown>>(xml)
    .map(normalizePosition)
    .filter((item): item is SascarPositionPacket => Boolean(item));
}

async function getPositionPacketsByRange(startId: number, endId: number, quantity = 3000) {
  const xml = await callSoap("getPositionPacketByRangeJSON", {
    user: requiredEnv("SASCAR_USER"),
    password: requiredEnv("SASCAR_PASSWORD"),
    startId,
    endId,
    quantity: Math.min(Math.max(quantity, 1), POSITION_BATCH_LIMIT),
  });

  return parseJsonReturns<Record<string, unknown>>(xml)
    .map(normalizePosition)
    .filter((item): item is SascarPositionPacket => Boolean(item));
}

function getRecordedAt(packet: SascarPositionPacket) {
  return packet.positionDateUtc ?? packet.packetDateUtc ?? new Date().toISOString();
}

function isNewerPacket(packet: SascarPositionPacket, lastPositionAt?: string | null) {
  if (!lastPositionAt) return true;
  return new Date(getRecordedAt(packet)).getTime() > new Date(lastPositionAt).getTime();
}

function sortByPacketIdAsc(a: SascarPositionPacket, b: SascarPositionPacket) {
  return a.packetId - b.packetId;
}

function dedupeLatestPacketByVehicle(packets: SascarPositionPacket[]) {
  const latest = new Map<string, SascarPositionPacket>();
  for (const packet of packets.sort(sortByPacketIdAsc)) {
    const key = packet.licensePlate ?? packet.vehicleId;
    latest.set(key, packet);
  }
  return [...latest.values()].sort(sortByPacketIdAsc);
}

function getLocalVehicleForPacket(
  packet: SascarPositionPacket,
  localBySascarId: Map<string, LocalVehicleRow>,
  localByPlate: Map<string, LocalVehicleRow>,
) {
  return (
    localBySascarId.get(packet.vehicleId) ??
    (packet.licensePlate ? localByPlate.get(normalizePlate(packet.licensePlate)) : undefined)
  );
}

function enrichPacketsWithPlate(
  packets: SascarPositionPacket[],
  vehiclesById: Map<string, SascarVehicle>,
) {
  return packets.map((packet) => ({
    ...packet,
    licensePlate: packet.licensePlate ?? vehiclesById.get(packet.vehicleId)?.licensePlate,
  }));
}

async function authorizeRequest(request: Request, source: string) {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const syncToken = readEnv("SASCAR_SYNC_TOKEN");
  const providedToken = request.headers.get("x-sascar-sync-token")?.trim();

  if (source === "cron" && syncToken && providedToken === syncToken) return true;

  const authHeader = request.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return false;

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: membership } = await serviceClient
    .from("workspace_memberships")
    .select("id, status, profiles!inner(active)")
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const profile = Array.isArray(membership?.profiles)
    ? membership?.profiles[0]
    : membership?.profiles;

  return Boolean(membership?.id && profile?.active);
}

async function runSascarSync(input: SyncInput): Promise<{ ok: true; stats: SyncStats }> {
  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const quantity = Math.min(Math.max(Number(input.quantity ?? 3000), 1), POSITION_BATCH_LIMIT);
  const forceFull = Boolean(input.forceFull);
  const source = input.source ?? "manual";

  const { data: localVehicles, error: localVehiclesError } = await supabase
    .from("vehicles")
    .select("id, tenant_id, plate, sascar_id, last_position_at");

  if (localVehiclesError) throw localVehiclesError;

  const localRows = (localVehicles ?? []) as LocalVehicleRow[];
  const tenantIds = Array.from(new Set(localRows.map((vehicle) => vehicle.tenant_id).filter(Boolean)));
  const primaryTenantId = tenantIds[0] ?? null;
  let syncState: { synced_at: string | null; metadata: Record<string, unknown> | null } | null = null;

  if (primaryTenantId) {
    const { data, error } = await supabase
      .from("integration_sync_state")
      .select("synced_at, metadata")
      .eq("tenant_id", primaryTenantId)
      .eq("integration", "sascar")
      .eq("scope", "positions")
      .maybeSingle();
    if (error) throw error;
    syncState = data as typeof syncState;
  }

  try {
    const localByPlate = new Map(
      localRows.map((vehicle) => [normalizePlate(vehicle.plate), vehicle]),
    );
    const localBySascarId = new Map(
      localRows
        .filter((vehicle) => vehicle.sascar_id)
        .map((vehicle) => [String(vehicle.sascar_id), vehicle]),
    );

    const sascarVehicles = await getAllVehicles();
    const sascarVehiclesById = new Map(
      sascarVehicles.map((vehicle) => [vehicle.vehicleId, vehicle]),
    );
    const enrich = (packets: SascarPositionPacket[]) =>
      enrichPacketsWithPlate(packets, sascarVehiclesById);

    const vehicleBindingUpdates = sascarVehicles
      .map((vehicle) => {
        const localVehicle = localByPlate.get(vehicle.licensePlate);
        if (!localVehicle || localVehicle.sascar_id === vehicle.vehicleId) return null;
        return { id: localVehicle.id, sascar_id: vehicle.vehicleId };
      })
      .filter((item): item is { id: string; sascar_id: string } => Boolean(item));

    for (const update of vehicleBindingUpdates) {
      const { error } = await supabase
        .from("vehicles")
        .update({ sascar_id: update.sascar_id })
        .eq("id", update.id);
      if (error) throw error;

      const row = localRows.find((vehicle) => vehicle.id === update.id);
      if (row) {
        row.sascar_id = update.sascar_id;
        localBySascarId.set(update.sascar_id, row);
      }
    }

    const latestPackets = await getLatestPositionPackets(quantity);
    const sortedLatestPackets = enrich(latestPackets).sort(sortByPacketIdAsc);
    const lastPacketId = forceFull
      ? null
      : Number(syncState?.metadata?.lastPacketId ?? syncState?.metadata?.last_packet_id ?? 0) || null;
    const oldestPacketId = sortedLatestPackets[0]?.packetId ?? null;
    const newestPacketId = sortedLatestPackets.at(-1)?.packetId ?? null;

    let packetsToProcess: SascarPositionPacket[] = [];
    if (!sortedLatestPackets.length) {
      packetsToProcess = [];
    } else if (!lastPacketId) {
      packetsToProcess = sortedLatestPackets;
    } else if (
      oldestPacketId != null &&
      newestPacketId != null &&
      lastPacketId + 1 < oldestPacketId
    ) {
      const recoveredPackets: SascarPositionPacket[] = [];
      let cursor = lastPacketId + 1;
      const maxRecoveryPages = readPositiveIntegerEnv(
        "SASCAR_MAX_RECOVERY_PAGES",
        DEFAULT_MAX_RECOVERY_PAGES,
      );
      let pagesRecovered = 0;

      while (cursor <= newestPacketId && pagesRecovered < maxRecoveryPages) {
        const end = Math.min(cursor + (POSITION_BATCH_LIMIT - 1), newestPacketId);
        const batch = await getPositionPacketsByRange(cursor, end, POSITION_BATCH_LIMIT);
        recoveredPackets.push(...enrich(batch));
        cursor = end + 1;
        pagesRecovered += 1;
      }

      packetsToProcess = recoveredPackets.length
        ? recoveredPackets.sort(sortByPacketIdAsc)
        : sortedLatestPackets.filter((packet) => packet.packetId > lastPacketId);
    } else {
      packetsToProcess = sortedLatestPackets.filter((packet) => packet.packetId > lastPacketId);
    }

    const latestPacketsByVehicle = dedupeLatestPacketByVehicle(
      packetsToProcess.filter((packet) => packet.gps !== 0),
    );

    let skippedPackets = 0;
    let packetsApplied = 0;
    const syncedVehicleIds = new Set<string>();

    for (const packet of latestPacketsByVehicle) {
      const localVehicle = getLocalVehicleForPacket(packet, localBySascarId, localByPlate);
      if (!localVehicle) {
        skippedPackets += 1;
        continue;
      }
      if (!isNewerPacket(packet, localVehicle.last_position_at)) {
        skippedPackets += 1;
        continue;
      }

      const recordedAt = getRecordedAt(packet);
      const positionPayload = {
        tenant_id: localVehicle.tenant_id,
        vehicle_id: localVehicle.id,
        lat: packet.latitude,
        lng: packet.longitude,
        city: packet.city ?? null,
        state: packet.state ?? null,
        speed: packet.speed ?? null,
        direction: packet.direction ?? null,
        source: "sascar",
        raw_payload: packet.raw,
        recorded_at: recordedAt,
      };

      const { error: insertPositionError } = await supabase
        .from("vehicle_positions")
        .insert(positionPayload);
      if (insertPositionError) throw insertPositionError;

      const { error: updateVehicleError } = await supabase
        .from("vehicles")
        .update({
          lat: packet.latitude,
          lng: packet.longitude,
          city: packet.city ?? null,
          state: packet.state ?? null,
          sascar_id: packet.vehicleId,
          last_position_at: recordedAt,
        })
        .eq("id", localVehicle.id);
      if (updateVehicleError) throw updateVehicleError;

      localVehicle.last_position_at = recordedAt;
      syncedVehicleIds.add(localVehicle.id);
      packetsApplied += 1;
    }

    const newestProcessedPacketId =
      packetsToProcess.at(-1)?.packetId ?? newestPacketId ?? lastPacketId ?? null;

    const syncedAt = new Date().toISOString();
    for (const tenantId of tenantIds) {
      const { error: stateUpsertError } = await supabase.from("integration_sync_state").upsert(
        {
          tenant_id: tenantId,
          integration: "sascar",
          scope: "positions",
          synced_at: syncedAt,
          metadata: {
            source,
            runtime: "supabase-edge-function",
            quantityRequested: quantity,
            packetsFetched: packetsToProcess.length,
            packetsApplied,
            syncedVehicles: syncedVehicleIds.size,
            skippedPackets,
            newestPacketId,
            lastPacketId: newestProcessedPacketId,
          },
        },
        { onConflict: "tenant_id,integration,scope" },
      );
      if (stateUpsertError) throw stateUpsertError;
    }

    return {
      ok: true,
      stats: {
        quantityRequested: quantity,
        sascarVehicles: sascarVehicles.length,
        vehicleBindingsUpdated: vehicleBindingUpdates.length,
        packetsFetched: packetsToProcess.length,
        packetsApplied,
        syncedVehicles: syncedVehicleIds.size,
        skippedPackets,
        lastPacketIdBefore: lastPacketId,
        lastPacketIdAfter: newestProcessedPacketId,
        source,
      },
    };
  } finally {
    // The new multi-tenant schema stores sync state per tenant in integration_sync_state.
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = ((await request.json().catch(() => ({}))) ?? {}) as SyncInput;
  const source = body.source ?? "manual";

  if (!(await authorizeRequest(request, source))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    return jsonResponse(await runSascarSync({ ...body, source }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar Sascar.";
    return jsonResponse({ error: message }, message.includes("ja esta em andamento") ? 409 : 500);
  }
});
