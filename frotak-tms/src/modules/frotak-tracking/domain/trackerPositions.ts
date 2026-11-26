// Posicoes de rastreador em formato neutro. Cada fornecedor (Sascar hoje) e convertido
// para estes tipos no seu adaptador; as regras abaixo valem para qualquer um.

export interface TrackerVehicle {
  externalId: string;
  plate: string;
}

export interface TrackerPosition {
  externalVehicleId: string;
  plate?: string;
  /** Identificador crescente do pacote no fornecedor; serve de cursor da sincronizacao. */
  sequence: number;
  /** Momento da posicao (UTC), quando o fornecedor informa. */
  recordedAt?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  direction?: number;
  city?: string;
  state?: string;
  hasGps: boolean;
  raw: Record<string, unknown>;
}

/** Veiculo do TMS visto pela sincronizacao. */
export interface TrackedVehicle {
  id: string;
  tenantId: string;
  plate: string;
  externalId: string | null;
  lastPositionAt: string | null;
}

export function normalizePlate(plate: string) {
  return plate
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 7);
}

export function recordedAtOf(position: TrackerPosition) {
  return position.recordedAt ?? new Date().toISOString();
}

export function bySequence(a: TrackerPosition, b: TrackerPosition) {
  return a.sequence - b.sequence;
}

export function isNewerPosition(position: TrackerPosition, lastPositionAt?: string | null) {
  if (!lastPositionAt) return true;
  return new Date(recordedAtOf(position)).getTime() > new Date(lastPositionAt).getTime();
}

export function isStalePosition(
  lastPositionAt: string | null | undefined,
  staleMinutes: number,
  now = Date.now(),
) {
  if (!lastPositionAt) return true;
  const lastPositionTime = new Date(lastPositionAt).getTime();
  if (Number.isNaN(lastPositionTime)) return true;
  return now - lastPositionTime > staleMinutes * 60 * 1000;
}

/** Completa a placa das posicoes que vieram so com o id do veiculo no fornecedor. */
export function attachPlates(
  positions: TrackerPosition[],
  vehiclesById: Map<string, TrackerVehicle>,
): TrackerPosition[] {
  return positions.map((position) => ({
    ...position,
    plate: position.plate ?? vehiclesById.get(position.externalVehicleId)?.plate,
  }));
}

/** Ultima posicao de cada veiculo, em ordem de sequencia. */
export function latestPositionPerVehicle(positions: TrackerPosition[]) {
  const latest = new Map<string, TrackerPosition>();
  for (const position of positions.sort(bySequence)) {
    latest.set(position.plate ?? position.externalVehicleId, position);
  }
  return [...latest.values()].sort(bySequence);
}

export class TrackedVehicleIndex {
  private readonly byExternalId: Map<string, TrackedVehicle>;
  private readonly byPlate: Map<string, TrackedVehicle>;
  readonly vehicles: TrackedVehicle[];

  constructor(vehicles: TrackedVehicle[]) {
    this.vehicles = vehicles;
    this.byPlate = new Map(vehicles.map((vehicle) => [normalizePlate(vehicle.plate), vehicle]));
    this.byExternalId = new Map(
      vehicles
        .filter((vehicle) => vehicle.externalId)
        .map((vehicle) => [String(vehicle.externalId), vehicle]),
    );
  }

  findByPlate(plate: string) {
    return this.byPlate.get(plate);
  }

  hasPlate(plate: string) {
    return this.byPlate.has(normalizePlate(plate));
  }

  /** Veiculo do TMS para a posicao: pelo id no fornecedor, senao pela placa. */
  match(position: TrackerPosition) {
    return (
      this.byExternalId.get(position.externalVehicleId) ??
      (position.plate ? this.byPlate.get(normalizePlate(position.plate)) : undefined)
    );
  }

  bind(vehicle: TrackedVehicle, externalId: string) {
    vehicle.externalId = externalId;
    this.byExternalId.set(externalId, vehicle);
  }
}

/** Veiculos do TMS que passam a ter o id do fornecedor (casados pela placa). */
export function planVehicleBindings(
  index: TrackedVehicleIndex,
  providerVehicles: TrackerVehicle[],
) {
  return providerVehicles
    .map((providerVehicle) => {
      const vehicle = index.findByPlate(providerVehicle.plate);
      if (!vehicle || vehicle.externalId === providerVehicle.externalId) return null;
      return { vehicle, externalId: providerVehicle.externalId };
    })
    .filter((binding): binding is { vehicle: TrackedVehicle; externalId: string } =>
      Boolean(binding),
    );
}

/** Veiculos do TMS cobertos por pelo menos uma posicao com GPS. */
export function coveredVehicleIds(positions: TrackerPosition[], index: TrackedVehicleIndex) {
  const covered = new Set<string>();
  for (const position of positions) {
    if (!position.hasGps) continue;
    const vehicle = index.match(position);
    if (vehicle) covered.add(vehicle.id);
  }
  return covered;
}

export interface TrackerSyncStats {
  quantityRequested: number;
  trackerVehicles: number;
  vehicleBindingsUpdated: number;
  packetsFetched: number;
  packetsApplied: number;
  currentPositionsChecked: number;
  currentPositionsApplied: number;
  currentPositionErrors: number;
  syncedVehicles: number;
  skippedPackets: number;
  oldPositionsDeleted: number;
  lastPacketIdBefore: number | null;
  lastPacketIdAfter: number | null;
  source: TrackerSyncSource;
}

export type TrackerSyncSource = "manual" | "cron";

export interface TrackerSyncResponse {
  ok: boolean;
  stats: TrackerSyncStats;
}
