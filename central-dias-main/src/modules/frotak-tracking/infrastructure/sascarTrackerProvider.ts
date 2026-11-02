import type {
  TrackerIntegration,
  TrackerProvider,
} from "@/modules/frotak-tracking/application/ports";
import type {
  TrackerPosition,
  TrackerVehicle,
} from "@/modules/frotak-tracking/domain/trackerPositions";
import {
  getAllVehicles,
  getLatestPositionPackets,
  getPositionPacketsByRange,
  getVehiclePositionHistory,
  type SascarCredentials,
  type SascarPositionPacket,
} from "./sascarSoap.ts";

const SASCAR_BATCH_LIMIT = 3000;

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSecretRef(value: string) {
  return value
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/** Credenciais por workspace (SASCAR_<SECRET_REF>_USER...) ou globais (SASCAR_USER...). */
export function readSascarCredentials(
  secretRef?: string | null,
  config?: Record<string, unknown> | null,
): SascarCredentials {
  const normalized = secretRef ? normalizeSecretRef(secretRef) : "";
  const prefix = normalized ? `SASCAR_${normalized}_` : "SASCAR_";
  const user = readEnv(`${prefix}USER`) ?? readEnv("SASCAR_USER");
  const password = readEnv(`${prefix}PASSWORD`) ?? readEnv("SASCAR_PASSWORD");
  if (!user || !password) {
    throw new Error(
      secretRef
        ? `Credenciais Sascar ausentes para secret_ref ${secretRef}.`
        : "Credenciais Sascar globais ausentes.",
    );
  }

  const timeoutMs = Number(config?.timeoutMs ?? config?.timeout_ms);
  return {
    user,
    password,
    wsdlUrl:
      (typeof config?.wsdlUrl === "string" && config.wsdlUrl) ||
      (typeof config?.wsdl_url === "string" && config.wsdl_url) ||
      readEnv(`${prefix}WSDL_URL`) ||
      null,
    soapUrl:
      (typeof config?.soapUrl === "string" && config.soapUrl) ||
      (typeof config?.soap_url === "string" && config.soap_url) ||
      readEnv(`${prefix}SOAP_URL`) ||
      null,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null,
  };
}

/** A API de historico da Sascar recebe data e hora local de Sao Paulo. */
function saoPauloDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function toTrackerPosition(packet: SascarPositionPacket): TrackerPosition {
  return {
    externalVehicleId: packet.vehicleId,
    plate: packet.licensePlate,
    sequence: packet.packetId,
    recordedAt: packet.positionDateUtc ?? packet.packetDateUtc,
    latitude: packet.latitude,
    longitude: packet.longitude,
    speed: packet.speed,
    direction: packet.direction,
    city: packet.city,
    state: packet.state,
    hasGps: packet.gps !== 0,
    raw: packet.raw,
  };
}

/** Adaptador da Sascar (SasIntegra SOAP) para a porta TrackerProvider. */
export class SascarTrackerProvider implements TrackerProvider {
  readonly name = "sascar";
  readonly label = "Sascar";
  readonly batchLimit = SASCAR_BATCH_LIMIT;

  constructor(private readonly credentials: SascarCredentials) {}

  static fromIntegration(integration: TrackerIntegration | null) {
    return new SascarTrackerProvider(
      readSascarCredentials(integration?.secretRef, integration?.config),
    );
  }

  async listVehicles(): Promise<TrackerVehicle[]> {
    const vehicles = await getAllVehicles(this.credentials);
    return vehicles.map((vehicle) => ({
      externalId: vehicle.vehicleId,
      plate: vehicle.licensePlate,
    }));
  }

  async latestPositions(quantity: number) {
    return (await getLatestPositionPackets(quantity, this.credentials)).map(toTrackerPosition);
  }

  async positionsBySequence(start: number, end: number, limit: number) {
    return (await getPositionPacketsByRange(start, end, limit, this.credentials)).map(
      toTrackerPosition,
    );
  }

  async vehicleHistory(externalVehicleId: string, start: Date, end: Date) {
    const packets = await getVehiclePositionHistory(
      externalVehicleId,
      saoPauloDateTime(start),
      saoPauloDateTime(end),
      this.credentials,
    );
    return packets.map(toTrackerPosition);
  }
}
