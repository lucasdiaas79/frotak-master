import assignmentsSql from "../../supabase/migrations/202606100002_reset_fleet_from_spreadsheet.sql?raw";
import trailersCatalogSql from "../../supabase/migrations/202606150001_refresh_trailers_from_final_fleet_sheet.sql?raw";
import vehicleMetadataSql from "../../supabase/migrations/202606150004_refresh_vehicle_metadata_from_final_fleet_sheet.sql?raw";
import driverPhonesSql from "../../supabase/migrations/202606150005_refresh_driver_phones_from_final_fleet_sheet.sql?raw";
import type {
  Driver,
  FleetEvent,
  Product,
  Recipient,
  Sender,
  Trailer,
  Vehicle,
  VehicleSituation,
  VehicleStatus,
} from "./types";

export const CENTRAL_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export interface LocalFleetData {
  dataVersion?: string;
  vehicles: Vehicle[];
  drivers: Driver[];
  trailers: Trailer[];
  senders: Sender[];
  recipients: Recipient[];
  products: Product[];
  events: FleetEvent[];
}

const STORAGE_PREFIX = "central-client-fleet-data";
const SYNC_PREFIX = "central-client-sascar-sync";
const CENTRAL_DATA_VERSION = "central-real-fleet-20260615-v1";

const senderSeed = [
  ["FAFEN", "Laranjeiras", "SE"],
  ["VOTORANTIM", "Laranjeiras", "SE"],
  ["INTERCEMENT", "Aracaju", "SE"],
  ["TIMAC/AL", "Maceio", "AL"],
  ["TIMAC/SE", "Rosario do Catete", "SE"],
  ["PORTO", "Barra dos Coqueiros", "SE"],
  ["PARANAPANEMA", "Dias D'Avila", "BA"],
  ["RTA", "Candeias", "BA"],
  ["STRATOS", "Camacari", "BA"],
  ["CALTREVO", "Nossa Senhora do Socorro", "SE"],
  ["ARMZ VITORIA", "Vitoria da Conquista", "BA"],
  ["CSN", "Arcos", "MG"],
] as const;

const recipientSeed = [
  ["FERTINE", "Nossa Senhora do Socorro", "SE"],
  ["GLOBAL PREMIER", "Aracaju", "SE"],
  ["UNICEMENTO", "Itabaiana", "SE"],
  ["NASSAU", "Aracaju", "SE"],
  ["ATACADAO DOS PISOS", "Aracaju", "SE"],
  ["BQMIL", "Lagarto", "SE"],
  ["CIMEC", "Maceio", "AL"],
  ["CIMENTO APODI", "Maceio", "AL"],
  ["CONCRETA", "Barra dos Coqueiros", "SE"],
  ["CONSTRUMIX", "Aracaju", "SE"],
  ["DIPIL", "Propria", "SE"],
  ["ECOPAV", "Estancia", "SE"],
  ["ENGEFORT", "Salvador", "BA"],
  ["FORTALEZA", "Feira de Santana", "BA"],
  ["HOLCIM", "Camacari", "BA"],
  ["IMPERIAL", "Umbauba", "SE"],
  ["INTERCEMENT", "Salvador", "BA"],
  ["JMIX", "Itabaiana", "SE"],
  ["LIZ", "Mossoro", "RN"],
  ["POLIMIX", "Aracaju", "SE"],
  ["PREMOLDADOS", "Simao Dias", "SE"],
  ["SANTO EXPEDITO", "Lagarto", "SE"],
  ["SUPERCIMENTO", "Recife", "PE"],
  ["TOP MIX", "Joao Pessoa", "PB"],
  ["VOTORANTIM", "Salvador", "BA"],
  ["ZANINI", "Teresina", "PI"],
] as const;

const productSeed = [
  "ADUBO (GRANEL SOLIDO)",
  "CIMENTO (GRANEL PRESSURIZADO)",
  "CLINQUER",
  "ESCORIA",
  "GESSO",
  "MATERIA PRIMA",
  "MINERIO",
  "SAL",
  "UREIA",
] as const;

const eventSources = ["Sistema", "Telemetria", "Operador", "Motorista"] as const;
const locations = [
  ["Pedra Branca", "SE", -10.6736, -37.645],
  ["Laranjeiras", "SE", -10.8064, -37.1694],
  ["Aracaju", "SE", -10.9472, -37.0731],
  ["Nossa Senhora do Socorro", "SE", -10.855, -37.1261],
  ["Itabaiana", "SE", -10.685, -37.425],
  ["Estancia", "SE", -11.2683, -37.4386],
  ["Salvador", "BA", -12.9777, -38.5016],
  ["Feira de Santana", "BA", -12.2664, -38.9663],
  ["Maceio", "AL", -9.6498, -35.7089],
] as const;

type SqlValue = string | number | null;

interface AssignmentRow {
  rowNum: number;
  driverName: string;
  vehiclePlate: string;
  trailerIds: string[];
}

interface VehicleMetadataRow {
  fleetSeq: number;
  plate: string;
  brand: string;
  model: string;
  manufactureYear?: number;
  renavam: string;
}

interface DriverPhoneRow {
  fleetSeq: number;
  name: string;
  phone: string;
}

interface TrailerCatalogRow {
  fleetSeq: number;
  type: string;
  fleetKind: string;
  brand: string;
  model: string;
  manufactureYear?: number;
  identifier: string;
  renavam: string;
  implementType: string;
  implementModel: string;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function pad(value: number, length: number) {
  return String(value).padStart(length, "0");
}

function id(prefix: string, index: number | string) {
  return `${prefix}-${typeof index === "number" ? pad(index, 3) : index}`;
}

function nowMinusMinutes(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function tenantStorageKey(tenantId: string) {
  return `${STORAGE_PREFIX}:${tenantId || CENTRAL_TENANT_ID}`;
}

function tenantSyncKey(tenantId: string) {
  return `${SYNC_PREFIX}:${tenantId || CENTRAL_TENANT_ID}`;
}

export function loadLocalFleetData(tenantId: string): LocalFleetData {
  const shouldUseCentralSeed =
    tenantId === CENTRAL_TENANT_ID || getActiveTenantName().includes("central");
  if (!shouldUseCentralSeed) return emptyFleetData();

  if (canUseStorage()) {
    const raw = window.localStorage.getItem(tenantStorageKey(tenantId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LocalFleetData;
        if (!shouldReplaceCentralData(parsed)) return parsed;
      } catch {
        window.localStorage.removeItem(tenantStorageKey(tenantId));
      }
    }
  }

  const seeded = createCentralSeedData();
  saveLocalFleetData(tenantId, seeded);
  return seeded;
}

export function saveLocalFleetData(tenantId: string, data: LocalFleetData) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    tenantStorageKey(tenantId),
    JSON.stringify({ ...data, dataVersion: data.dataVersion || CENTRAL_DATA_VERSION }),
  );
}

export function emptyFleetData(): LocalFleetData {
  return {
    vehicles: [],
    drivers: [],
    trailers: [],
    senders: [],
    recipients: [],
    products: [],
    events: [],
  };
}

function isEmptyFleetData(data: LocalFleetData) {
  return (
    data.vehicles.length === 0 &&
    data.drivers.length === 0 &&
    data.trailers.length === 0 &&
    data.senders.length === 0 &&
    data.recipients.length === 0 &&
    data.products.length === 0
  );
}

function shouldReplaceCentralData(data: LocalFleetData) {
  if (isEmptyFleetData(data)) return true;
  if (data.dataVersion !== CENTRAL_DATA_VERSION) return true;
  return (
    data.vehicles.some((vehicle) => vehicle.plate.toUpperCase().startsWith("RTM")) ||
    data.trailers.some((trailer) => /^CR-\d{4}$/i.test(trailer.identifier))
  );
}

export function nextLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

export function getLocalSascarSyncState(tenantId: string) {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(tenantSyncKey(tenantId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      syncedAt: string | null;
      source: "cron" | "manual" | null;
      syncedVehicles?: number;
      packetsApplied?: number;
      packetsFetched?: number;
    };
  } catch {
    return null;
  }
}

export function saveLocalSascarSyncState(tenantId: string, source: "cron" | "manual" = "manual") {
  const data = loadLocalFleetData(tenantId);
  const syncedAt = new Date().toISOString();
  const state = {
    syncedAt,
    source,
    syncedVehicles: data.vehicles.length,
    packetsApplied: data.vehicles.length,
    packetsFetched: data.vehicles.length,
  };
  if (canUseStorage()) {
    window.localStorage.setItem(tenantSyncKey(tenantId), JSON.stringify(state));
  }
  return state;
}

function createCentralSeedData(): LocalFleetData {
  const senders: Sender[] = senderSeed.map(([name, city, state], index) => ({
    id: id("sender", index + 1),
    name,
    cnpj: "",
    city,
    state,
    active: true,
    createdAt: nowMinusMinutes(5000 - index),
  }));
  const recipients: Recipient[] = recipientSeed.map(([name, city, state], index) => ({
    id: id("recipient", index + 1),
    name,
    cnpj: "",
    city,
    state,
    active: true,
    createdAt: nowMinusMinutes(4000 - index),
  }));
  const products: Product[] = productSeed.map((name, index) => ({
    id: id("product", index + 1),
    name,
    active: true,
    createdAt: nowMinusMinutes(3000 - index),
  }));

  const assignments = parseAssignments();
  const vehicleMetadata = parseVehicleMetadata();
  const driverPhones = parseDriverPhones();
  const trailerCatalog = parseTrailerCatalog();
  const assignmentByVehicle = new Map<string, AssignmentRow>();
  assignments.forEach((assignment) => assignmentByVehicle.set(assignment.vehiclePlate, assignment));

  const driverByName = new Map<string, Driver>();
  driverPhones.forEach((driver, index) => {
    driverByName.set(nameKey(driver.name), {
      id: id("driver", driver.fleetSeq || index + 1),
      name: driver.name,
      phone: driver.phone,
      cnh: "",
      fleetSeq: driver.fleetSeq,
      active: true,
      createdAt: nowMinusMinutes(2500 - index),
    });
  });

  assignments.forEach((assignment) => {
    if (isObservationDriver(assignment.driverName)) return;
    const key = nameKey(assignment.driverName);
    if (driverByName.has(key)) return;
    const nextSeq = driverByName.size + 1;
    driverByName.set(key, {
      id: id("driver", nextSeq),
      name: assignment.driverName,
      phone: "",
      cnh: "",
      fleetSeq: nextSeq,
      active: true,
      createdAt: nowMinusMinutes(2400 - nextSeq),
    });
  });

  const trailerByIdentifier = new Map<string, Trailer>();
  trailerCatalog.forEach((trailer, index) => {
    trailerByIdentifier.set(trailer.identifier, {
      id: id("trailer", trailer.identifier),
      identifier: formatPlate(trailer.identifier),
      type: trailer.type,
      fleetSeq: trailer.fleetSeq,
      fleetKind: trailer.fleetKind,
      brand: trailer.brand,
      model: trailer.model,
      manufactureYear: trailer.manufactureYear,
      renavam: trailer.renavam,
      implementType: trailer.implementType,
      implementModel: trailer.implementModel,
      createdAt: nowMinusMinutes(2200 - index),
    });
  });

  assignments.forEach((assignment) => {
    assignment.trailerIds.forEach((trailerIdentifier) => {
      if (trailerByIdentifier.has(trailerIdentifier)) return;
      const nextSeq = trailerByIdentifier.size + 1;
      trailerByIdentifier.set(trailerIdentifier, {
        id: id("trailer", trailerIdentifier),
        identifier: formatPlate(trailerIdentifier),
        type: "IMPLEMENTO",
        fleetSeq: nextSeq,
        fleetKind: "IMPLEMENTO",
        implementType: "BASCULANTE",
        implementModel: "CACAMBA",
        createdAt: nowMinusMinutes(2200 - nextSeq),
      });
    });
  });

  const vehicles: Vehicle[] = vehicleMetadata.map((metadata, index) => {
    const assignment = assignmentByVehicle.get(metadata.plate);
    const location = locations[index % locations.length];
    const isMaintenance = assignment ? isObservationDriver(assignment.driverName) : false;
    const status: VehicleStatus = isMaintenance ? "manutencao" : "disponivel-patio";
    const situation: VehicleSituation = isMaintenance ? "manutencao" : "disponivel-patio";
    const driver = assignment ? driverByName.get(nameKey(assignment.driverName)) : undefined;
    const trailerIds = assignment?.trailerIds.map((identifier) => id("trailer", identifier)) || [];
    const vehicleId = id("vehicle", metadata.plate);

    if (driver && !isMaintenance) driver.vehicleId = vehicleId;
    trailerIds.forEach((trailerId) => {
      const trailer = Array.from(trailerByIdentifier.values()).find(
        (item) => item.id === trailerId,
      );
      if (trailer) trailer.vehicleId = vehicleId;
    });

    return {
      id: vehicleId,
      workflowVersion: 0,
      workflowFlags: { pendingDocuments: [] },
      plate: metadata.plate,
      type: "CAVALO TRATOR",
      fleetSeq: metadata.fleetSeq,
      fleetKind: "CAVALO",
      brand: metadata.brand,
      model: metadata.model,
      manufactureYear: metadata.manufactureYear,
      renavam: metadata.renavam,
      status,
      situation,
      freightStage: "DISPONIVEL",
      driverId: driver && !isMaintenance ? driver.id : undefined,
      trailerId: trailerIds[0],
      trailerIds,
      senderId: senders[index % senders.length].id,
      recipientId: recipients[(index * 3) % recipients.length].id,
      productId: products[(index * 5) % products.length].id,
      city: location[0],
      state: location[1],
      lat: location[2] + (index % 6) * 0.012,
      lng: location[3] - (index % 7) * 0.012,
      sascarId: `SASCAR-${metadata.plate}`,
      lastPositionAt: nowMinusMinutes(index + 1),
      updatedAt: nowMinusMinutes((index + 1) * 5),
      createdAt: nowMinusMinutes(2000 - index),
    };
  });

  const events: FleetEvent[] = vehicles.map((vehicle, index) => ({
    id: id("event", index + 1),
    vehicleId: vehicle.id,
    status: vehicle.status,
    freightStage: vehicle.freightStage,
    city: vehicle.city,
    state: vehicle.state,
    source: eventSources[index % eventSources.length],
    description: "Status inicial importado da base real da Central Transportes",
    eventType: "seed",
    actionOrigin: "migration",
    metadata: { source: "supabase/migrations", tenant: "Central Transportes" },
    timestamp: vehicle.updatedAt,
  }));

  return {
    dataVersion: CENTRAL_DATA_VERSION,
    vehicles,
    drivers: Array.from(driverByName.values()).sort(
      (a, b) => (a.fleetSeq || 0) - (b.fleetSeq || 0),
    ),
    trailers: Array.from(trailerByIdentifier.values()).sort(
      (a, b) => (a.fleetSeq || 0) - (b.fleetSeq || 0),
    ),
    senders,
    recipients,
    products,
    events,
  };
}

function parseAssignments(): AssignmentRow[] {
  return parseInsertRows(assignmentsSql, "official_fleet_assignments")
    .map((row) => ({
      rowNum: Number(row[0]),
      driverName: cleanText(String(row[1] || "")),
      vehiclePlate: normalizePlate(String(row[2] || "")),
      trailerIds: parseTrailerIdentifiers(String(row[3] || "")),
    }))
    .filter((row) => row.vehiclePlate);
}

function parseVehicleMetadata(): VehicleMetadataRow[] {
  return parseInsertRows(vehicleMetadataSql, "official_vehicle_metadata")
    .map((row) => ({
      fleetSeq: Number(row[0]),
      plate: normalizePlate(String(row[1] || "")),
      brand: cleanText(String(row[2] || "")),
      model: cleanText(String(row[3] || "")),
      manufactureYear: row[4] === null ? undefined : Number(row[4]),
      renavam: cleanText(String(row[5] || "")),
    }))
    .filter((row) => row.plate)
    .sort((a, b) => a.fleetSeq - b.fleetSeq);
}

function parseDriverPhones(): DriverPhoneRow[] {
  return parseInsertRows(driverPhonesSql, "official_driver_phones")
    .map((row) => ({
      fleetSeq: Number(row[0]),
      name: cleanText(String(row[1] || "")),
      phone: cleanText(String(row[2] || "")),
    }))
    .filter((row) => row.name)
    .sort((a, b) => a.fleetSeq - b.fleetSeq);
}

function parseTrailerCatalog(): TrailerCatalogRow[] {
  return parseInsertRows(trailersCatalogSql, "official_trailers_catalog")
    .map((row) => ({
      fleetSeq: Number(row[0]),
      type: cleanText(String(row[1] || "IMPLEMENTO")),
      fleetKind: cleanText(String(row[2] || "IMPLEMENTO")),
      brand: cleanText(String(row[3] || "")),
      model: cleanText(String(row[4] || "")),
      manufactureYear: row[5] === null ? undefined : Number(row[5]),
      identifier: normalizePlate(String(row[6] || "")),
      renavam: cleanText(String(row[7] || "")),
      implementType: cleanText(String(row[8] || "")),
      implementModel: cleanText(String(row[9] || "")),
    }))
    .filter((row) => row.identifier)
    .sort((a, b) => a.fleetSeq - b.fleetSeq);
}

function parseInsertRows(sql: string, tableName: string) {
  const valuesBlock = extractValuesBlock(sql, tableName);
  return valuesBlock ? parseSqlTuples(valuesBlock) : [];
}

function extractValuesBlock(sql: string, tableName: string) {
  const lower = sql.toLowerCase();
  const insertIndex = lower.indexOf(`insert into ${tableName.toLowerCase()}`);
  if (insertIndex < 0) return "";
  const valuesIndex = lower.indexOf("values", insertIndex);
  if (valuesIndex < 0) return "";

  let inString = false;
  for (let index = valuesIndex + "values".length; index < sql.length; index += 1) {
    const char = sql[index];
    if (char === "'") {
      if (inString && sql[index + 1] === "'") {
        index += 1;
      } else {
        inString = !inString;
      }
      continue;
    }
    if (!inString && char === ";") {
      return sql.slice(valuesIndex + "values".length, index);
    }
  }

  return sql.slice(valuesIndex + "values".length);
}

function parseSqlTuples(input: string) {
  const rows: SqlValue[][] = [];
  let index = 0;

  while (index < input.length) {
    if (input[index] !== "(") {
      index += 1;
      continue;
    }

    index += 1;
    const values: SqlValue[] = [];
    let token = "";
    let quoted = false;
    let inString = false;

    while (index < input.length) {
      const char = input[index];

      if (inString) {
        if (char === "'") {
          if (input[index + 1] === "'") {
            token += "'";
            index += 2;
            continue;
          }
          inString = false;
          index += 1;
          continue;
        }
        token += char;
        index += 1;
        continue;
      }

      if (char === "'") {
        quoted = true;
        inString = true;
        index += 1;
        continue;
      }

      if (char === "," || char === ")") {
        values.push(parseSqlValue(token, quoted));
        token = "";
        quoted = false;
        index += 1;
        if (char === ")") break;
        continue;
      }

      token += char;
      index += 1;
    }

    rows.push(values);
  }

  return rows;
}

function parseSqlValue(value: string, quoted: boolean): SqlValue {
  const trimmed = value.trim();
  if (quoted) return cleanText(trimmed);
  if (!trimmed || /^null$/i.test(trimmed)) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return cleanText(trimmed);
}

function cleanText(value: string) {
  return decodePossiblyMojibake(value).replace(/\s+/g, " ").trim();
}

function decodePossiblyMojibake(value: string) {
  if (!/[ÃÂ]/.test(value) || typeof TextDecoder === "undefined") return value;
  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return value;
  }
}

function nameKey(value: string) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizePlate(value: string) {
  const normalized = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (normalized === "QMIOOO8") return "QMI0008";
  return normalized;
}

function formatPlate(value: string) {
  const normalized = normalizePlate(value);
  return normalized.length === 7 ? `${normalized.slice(0, 3)}-${normalized.slice(3)}` : normalized;
}

function parseTrailerIdentifiers(value: string) {
  const found = cleanText(value)
    .toUpperCase()
    .match(/[A-Z]{3}-?[0-9A-Z]{4}/g);
  return Array.from(new Set((found || []).map(normalizePlate)));
}

function isObservationDriver(driverName: string) {
  return nameKey(driverName).startsWith("OBS");
}

function getActiveTenantName() {
  if (!canUseStorage()) return "";
  return (window.localStorage.getItem("frotak-active-tenant-name") || "").toLowerCase();
}
