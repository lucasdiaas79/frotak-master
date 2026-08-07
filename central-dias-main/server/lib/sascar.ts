const DEFAULT_WSDL_URL = "https://sasintegra.sascar.com.br/SasIntegra/SasIntegraWSService?wsdl";

const SOAP_NS = "http://webservice.web.integracao.sascar.com.br/";
const POSITION_BATCH_LIMIT = 3000;
const VEHICLE_BATCH_LIMIT = 1000;
const SASCAR_LOCAL_TIME_OFFSET = "-03:00";
const DEFAULT_SOAP_TIMEOUT_MS = 20000;

export interface SascarVehicle {
  vehicleId: string;
  licensePlate: string;
  clientId?: number;
  description?: string;
  deviceId?: string;
  deviceDescId?: string;
  satellite?: boolean;
  isTelemetry?: boolean;
}

export interface SascarPositionPacket {
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

interface SascarHistoricalPositionRaw {
  idVeiculo?: string;
  idPacote?: string;
  dataPosicao?: string;
  dataPacote?: string;
  latitude?: string;
  longitude?: string;
  velocidade?: string;
  direcao?: string;
  ignicao?: string;
  gps?: string;
  uf?: string;
  cidade?: string;
  pais?: string;
  rua?: string;
  pontoReferencia?: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
    <web:${method}>
      ${fields}
    </web:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function getSoapUrl() {
  const explicitSoapUrl = readEnv("SASCAR_SOAP_URL");
  if (explicitSoapUrl) return explicitSoapUrl;

  const wsdlUrl = readEnv("SASCAR_WSDL_URL") ?? DEFAULT_WSDL_URL;
  return wsdlUrl.replace(/\?wsdl$/i, "");
}

function getSoapTimeoutMs() {
  const configured = Number(readEnv("SASCAR_SOAP_TIMEOUT_MS"));
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SOAP_TIMEOUT_MS;
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function parseReturnBlocks(xml: string) {
  const faultMatch = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(decodeXml(faultMatch[1]).trim());
  }

  return [...xml.matchAll(/<return>([\s\S]*?)<\/return>/gi)].map((match) =>
    decodeXml(stripCdata(match[1]).trim()),
  );
}

function parseJsonReturns<T>(xml: string): T[] {
  const blocks = parseReturnBlocks(xml);
  return blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => JSON.parse(block) as T);
}

function parseReturnXmlBlocks(xml: string) {
  const faultMatch = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(decodeXml(faultMatch[1]).trim());
  }

  return [...xml.matchAll(/<return>([\s\S]*?)<\/return>/gi)].map((match) => match[1]);
}

function getXmlField(block: string, field: string) {
  const match = block.match(new RegExp(`<${field}>([\\s\\S]*?)</${field}>`, "i"));
  return match ? decodeXml(match[1]).trim() : undefined;
}

function parsePositionXmlReturns(xml: string) {
  return parseReturnXmlBlocks(xml).map((block) => ({
    idVeiculo: getXmlField(block, "idVeiculo"),
    idPacote: getXmlField(block, "idPacote"),
    dataPosicao: getXmlField(block, "dataPosicao"),
    dataPacote: getXmlField(block, "dataPacote"),
    latitude: getXmlField(block, "latitude"),
    longitude: getXmlField(block, "longitude"),
    velocidade: getXmlField(block, "velocidade"),
    direcao: getXmlField(block, "direcao"),
    ignicao: getXmlField(block, "ignicao"),
    gps: getXmlField(block, "gps"),
    uf: getXmlField(block, "uf"),
    cidade: getXmlField(block, "cidade"),
    pais: getXmlField(block, "pais"),
    rua: getXmlField(block, "rua"),
    pontoReferencia: getXmlField(block, "pontoReferencia"),
  }));
}

async function callSoap(method: string, params: Record<string, string | number>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getSoapTimeoutMs());

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

  if (!response.ok) {
    throw new Error(`Sascar HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

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

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

function normalizePlate(plate: string) {
  return plate
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 7);
}

export function parseSascarDate(value?: string) {
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
    clientId: toNumber(raw.clientId),
    description: toStringValue(raw.description),
    deviceId: toStringValue(raw.deviceId),
    deviceDescId: toStringValue(raw.deviceDescId),
    satellite: toBoolean(raw.satellite),
    isTelemetry: toBoolean(raw.isTelemetry),
  };
}

function normalizePosition(raw: Record<string, unknown>): SascarPositionPacket | null {
  const vehicleId = toNumber(raw.vehicleId ?? raw.idVeiculo);
  const packetId = toNumber(raw.packetId ?? raw.idPacote);
  const latitude = toNumber(raw.latitude);
  const longitude = toNumber(raw.longitude);

  if (!vehicleId || packetId == null || latitude == null || longitude == null) {
    return null;
  }

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

function normalizeHistoricalPosition(
  raw: SascarHistoricalPositionRaw,
): SascarPositionPacket | null {
  const vehicleId = toNumber(raw.idVeiculo);
  const packetId = toNumber(raw.idPacote);
  const latitude = toNumber(raw.latitude);
  const longitude = toNumber(raw.longitude);

  if (!vehicleId || packetId == null || latitude == null || longitude == null) {
    return null;
  }

  return {
    vehicleId: String(vehicleId),
    packetId,
    positionDateUtc: parseSascarDate(raw.dataPosicao),
    packetDateUtc: parseSascarDate(raw.dataPacote),
    latitude,
    longitude,
    speed: toNumber(raw.velocidade),
    direction: toNumber(raw.direcao),
    ignition: toNumber(raw.ignicao),
    gps: toNumber(raw.gps),
    state: toStringValue(raw.uf),
    city: toStringValue(raw.cidade),
    country: toStringValue(raw.pais),
    street: toStringValue(raw.rua),
    referencePoint: toStringValue(raw.pontoReferencia),
    raw: raw as Record<string, unknown>,
  };
}

export async function getVehiclesPage(cursor = 0, quantity = VEHICLE_BATCH_LIMIT) {
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

export async function getAllVehicles() {
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

export async function getLatestPositionPackets(quantity = POSITION_BATCH_LIMIT) {
  const xml = await callSoap("getPositionPacketWithLicensePlateJSON", {
    user: requiredEnv("SASCAR_USER"),
    password: requiredEnv("SASCAR_PASSWORD"),
    quantity: Math.min(Math.max(quantity, 1), POSITION_BATCH_LIMIT),
  });

  return parseJsonReturns<Record<string, unknown>>(xml)
    .map(normalizePosition)
    .filter((item): item is SascarPositionPacket => Boolean(item));
}

export async function getPositionPacketsByRange(startId: number, endId: number, quantity = 3000) {
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

export async function getVehiclePositionHistory(
  vehicleId: string | number,
  start: string,
  end: string,
) {
  const xml = await callSoap("obterPacotePosicaoHistorico", {
    usuario: requiredEnv("SASCAR_USER"),
    senha: requiredEnv("SASCAR_PASSWORD"),
    dataInicio: start,
    dataFinal: end,
    idVeiculo: vehicleId,
  });

  return parsePositionXmlReturns(xml)
    .map(normalizeHistoricalPosition)
    .filter((item): item is SascarPositionPacket => Boolean(item));
}

export function enrichPacketsWithPlate(
  packets: SascarPositionPacket[],
  vehiclesById: Map<string, SascarVehicle>,
) {
  return packets.map((packet) => ({
    ...packet,
    licensePlate: packet.licensePlate ?? vehiclesById.get(packet.vehicleId)?.licensePlate,
  }));
}
