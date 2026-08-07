import { getSupabaseAdmin } from "./supabase-admin.ts";
import {
  enrichPacketsWithPlate,
  getAllVehicles,
  getLatestPositionPackets,
  getPositionPacketsByRange,
  getVehiclePositionHistory,
  type SascarPositionPacket,
} from "./sascar.ts";

export interface SascarSyncInput {
  quantity?: number;
  forceFull?: boolean;
  includeCurrentHistory?: boolean;
}

export interface SascarSyncStats {
  quantityRequested: number;
  sascarVehicles: number;
  vehicleBindingsUpdated: number;
  packetsFetched: number;
  packetsApplied: number;
  currentPositionsChecked: number;
  currentPositionsApplied: number;
  currentPositionErrors: number;
  syncedVehicles: number;
  skippedPackets: number;
  lastPacketIdBefore: number | null;
  lastPacketIdAfter: number | null;
}

export interface SascarSyncResponse {
  ok: boolean;
  stats: SascarSyncStats;
}

interface LocalVehicleRow {
  id: string;
  plate: string;
  sascar_id: string | null;
  last_position_at: string | null;
}

const POSITION_BATCH_LIMIT = 3000;
const INITIAL_BACKFILL_PAGES = 8;
const DEFAULT_CURRENT_HISTORY_CONCURRENCY = 10;
const DEFAULT_CURRENT_HISTORY_STALE_MINUTES = 15;
const DEFAULT_CURRENT_HISTORY_LOOKBACK_HOURS = 3;
const DEFAULT_MAX_RECOVERY_PAGES = 2;

let inFlight = false;

function normalizePlate(plate: string) {
  return plate
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 7);
}

function getRecordedAt(packet: SascarPositionPacket) {
  return packet.positionDateUtc ?? packet.packetDateUtc ?? new Date().toISOString();
}

function getSaoPauloDateTime(date = new Date()) {
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

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
}

function getSascarCurrentHistoryRange() {
  const lookbackHours = readPositiveIntegerEnv(
    "SASCAR_CURRENT_HISTORY_LOOKBACK_HOURS",
    DEFAULT_CURRENT_HISTORY_LOOKBACK_HOURS,
  );
  const end = new Date();
  const start = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);

  return {
    start: getSaoPauloDateTime(start),
    end: getSaoPauloDateTime(end),
  };
}

function isNewerPacket(packet: SascarPositionPacket, lastPositionAt?: string | null) {
  if (!lastPositionAt) return true;

  return new Date(getRecordedAt(packet)).getTime() > new Date(lastPositionAt).getTime();
}

function isStalePosition(lastPositionAt?: string | null) {
  if (!lastPositionAt) return true;

  const staleMinutes = readPositiveIntegerEnv(
    "SASCAR_CURRENT_HISTORY_STALE_MINUTES",
    DEFAULT_CURRENT_HISTORY_STALE_MINUTES,
  );
  const lastPositionTime = new Date(lastPositionAt).getTime();
  if (Number.isNaN(lastPositionTime)) return true;

  return Date.now() - lastPositionTime > staleMinutes * 60 * 1000;
}

function sortByPacketIdAsc(a: SascarPositionPacket, b: SascarPositionPacket) {
  return a.packetId - b.packetId;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readBooleanEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "sim"].includes(value);
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function countCoveredVehicles(
  packets: SascarPositionPacket[],
  localBySascarId: Map<string, LocalVehicleRow>,
  localByPlate: Map<string, LocalVehicleRow>,
) {
  const covered = new Set<string>();

  for (const packet of packets) {
    if (packet.gps === 0) continue;
    const localVehicle = getLocalVehicleForPacket(packet, localBySascarId, localByPlate);
    if (localVehicle) covered.add(localVehicle.id);
  }

  return covered;
}

async function collectInitialCoveragePackets(
  sortedLatestPackets: SascarPositionPacket[],
  localRows: LocalVehicleRow[],
  localBySascarId: Map<string, LocalVehicleRow>,
  localByPlate: Map<string, LocalVehicleRow>,
  quantity: number,
  enrich: (packets: SascarPositionPacket[]) => SascarPositionPacket[],
) {
  if (!sortedLatestPackets.length) return sortedLatestPackets;

  const matchableVehicleIds = new Set(
    localRows
      .filter((vehicle) => vehicle.sascar_id || localByPlate.has(normalizePlate(vehicle.plate)))
      .map((vehicle) => vehicle.id),
  );

  let packets = [...sortedLatestPackets];
  let coveredVehicleIds = countCoveredVehicles(packets, localBySascarId, localByPlate);
  const oldestPacketId = sortedLatestPackets[0]?.packetId ?? null;

  if (
    !oldestPacketId ||
    coveredVehicleIds.size >= matchableVehicleIds.size ||
    quantity < POSITION_BATCH_LIMIT
  ) {
    return packets;
  }

  let rangeEnd = oldestPacketId - 1;

  for (let page = 0; page < INITIAL_BACKFILL_PAGES && rangeEnd > 0; page += 1) {
    const rangeStart = Math.max(rangeEnd - (POSITION_BATCH_LIMIT - 1), 1);
    const batch = await getPositionPacketsByRange(rangeStart, rangeEnd, POSITION_BATCH_LIMIT);
    const enrichedBatch = enrich(batch).sort(sortByPacketIdAsc);

    if (!enrichedBatch.length) break;

    packets = [...enrichedBatch, ...packets];
    coveredVehicleIds = countCoveredVehicles(packets, localBySascarId, localByPlate);

    if (coveredVehicleIds.size >= matchableVehicleIds.size) {
      break;
    }

    if (enrichedBatch.length < POSITION_BATCH_LIMIT) {
      break;
    }

    rangeEnd = rangeStart - 1;
  }

  return packets.sort(sortByPacketIdAsc);
}

export async function runSascarSync(input: SascarSyncInput = {}): Promise<SascarSyncResponse> {
  if (inFlight) {
    throw new Error("A sincronizacao Sascar ja esta em andamento.");
  }

  inFlight = true;

  try {
    const quantity = Math.min(Math.max(Number(input.quantity ?? 3000), 1), POSITION_BATCH_LIMIT);
    const forceFull = Boolean(input.forceFull);
    const includeCurrentHistory =
      input.includeCurrentHistory ?? readBooleanEnv("SASCAR_INCLUDE_CURRENT_HISTORY_DEFAULT");
    const supabase = getSupabaseAdmin();

    const [
      { data: localVehicles, error: localVehiclesError },
      { data: syncState, error: syncStateError },
    ] = await Promise.all([
      supabase.from("vehicles").select("id, plate, sascar_id, last_position_at"),
      supabase
        .from("integration_sync_state")
        .select("last_packet_id")
        .eq("key", "sascar_positions")
        .maybeSingle(),
    ]);

    if (localVehiclesError) throw localVehiclesError;
    if (syncStateError) throw syncStateError;

    const localRows = (localVehicles ?? []) as LocalVehicleRow[];
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
        if (!localVehicle) return null;
        if (localVehicle.sascar_id === vehicle.vehicleId) return null;
        return {
          id: localVehicle.id,
          sascar_id: vehicle.vehicleId,
        };
      })
      .filter((item): item is { id: string; sascar_id: string } => Boolean(item));

    if (vehicleBindingUpdates.length) {
      for (const update of vehicleBindingUpdates) {
        const { error } = await supabase
          .from("vehicles")
          .update({ sascar_id: update.sascar_id })
          .eq("id", update.id);
        if (error) throw error;
      }

      for (const update of vehicleBindingUpdates) {
        const row = localRows.find((vehicle) => vehicle.id === update.id);
        if (row) {
          row.sascar_id = update.sascar_id;
          localBySascarId.set(update.sascar_id, row);
        }
      }
    }

    const latestPackets = await getLatestPositionPackets(quantity);
    const sortedLatestPackets = enrich(latestPackets).sort(sortByPacketIdAsc);

    const lastPacketId = forceFull ? null : Number(syncState?.last_packet_id ?? 0) || null;
    const oldestPacketId = sortedLatestPackets[0]?.packetId ?? null;
    const newestPacketId = sortedLatestPackets.at(-1)?.packetId ?? null;

    let packetsToProcess: SascarPositionPacket[] = [];

    if (!sortedLatestPackets.length) {
      packetsToProcess = [];
    } else if (!lastPacketId) {
      packetsToProcess = await collectInitialCoveragePackets(
        sortedLatestPackets,
        localRows,
        localBySascarId,
        localByPlate,
        quantity,
        enrich,
      );
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
    const vehiclesUpdatedByCurrentHistory = new Set<string>();
    const { start: currentHistoryStart, end: currentHistoryEnd } = getSascarCurrentHistoryRange();
    const currentHistoryConcurrency = readPositiveIntegerEnv(
      "SASCAR_CURRENT_HISTORY_CONCURRENCY",
      DEFAULT_CURRENT_HISTORY_CONCURRENCY,
    );

    let currentPositionErrors = 0;

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

      const positionPayload = {
        vehicle_id: localVehicle.id,
        lat: packet.latitude,
        lng: packet.longitude,
        city: packet.city ?? null,
        state: packet.state ?? null,
        speed: packet.speed ?? null,
        direction: packet.direction ?? null,
        source: "sascar",
        raw_payload: packet.raw,
        recorded_at: getRecordedAt(packet),
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
          last_position_at: getRecordedAt(packet),
        })
        .eq("id", localVehicle.id);
      if (updateVehicleError) throw updateVehicleError;

      localVehicle.last_position_at = getRecordedAt(packet);
      syncedVehicleIds.add(localVehicle.id);
      packetsApplied += 1;
    }

    const currentHistoryCandidates = includeCurrentHistory
      ? localRows.filter(
          (vehicle) =>
            vehicle.sascar_id &&
            !syncedVehicleIds.has(vehicle.id) &&
            isStalePosition(vehicle.last_position_at),
        )
      : [];

    const currentHistoryPackets = await mapWithConcurrency(
      currentHistoryCandidates,
      currentHistoryConcurrency,
      async (vehicle) => {
        try {
          const history = await getVehiclePositionHistory(
            vehicle.sascar_id as string,
            currentHistoryStart,
            currentHistoryEnd,
          );
          const latest = dedupeLatestPacketByVehicle(
            history.filter((packet) => packet.gps !== 0),
          ).at(-1);
          return latest ? { vehicle, packet: latest } : null;
        } catch {
          currentPositionErrors += 1;
          return null;
        }
      },
    );

    let currentPositionsApplied = 0;

    for (const item of currentHistoryPackets) {
      if (!item) continue;
      const { vehicle, packet } = item;

      if (!isNewerPacket(packet, vehicle.last_position_at)) continue;

      const positionPayload = {
        vehicle_id: vehicle.id,
        lat: packet.latitude,
        lng: packet.longitude,
        city: packet.city ?? null,
        state: packet.state ?? null,
        speed: packet.speed ?? null,
        direction: packet.direction ?? null,
        source: "sascar",
        raw_payload: packet.raw,
        recorded_at: getRecordedAt(packet),
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
          last_position_at: getRecordedAt(packet),
        })
        .eq("id", vehicle.id);
      if (updateVehicleError) throw updateVehicleError;

      vehicle.last_position_at = getRecordedAt(packet);
      vehiclesUpdatedByCurrentHistory.add(vehicle.id);
      syncedVehicleIds.add(vehicle.id);
      currentPositionsApplied += 1;
    }

    const newestProcessedPacketId =
      packetsToProcess.at(-1)?.packetId ?? newestPacketId ?? lastPacketId ?? null;

    const { error: stateUpsertError } = await supabase.from("integration_sync_state").upsert(
      {
        key: "sascar_positions",
        last_packet_id: newestProcessedPacketId,
        synced_at: new Date().toISOString(),
        metadata: {
          source: "sascar",
          quantityRequested: quantity,
          includeCurrentHistory,
          packetsFetched: packetsToProcess.length,
          packetsApplied,
          currentPositionsChecked: currentHistoryPackets.length,
          currentPositionsApplied,
          currentPositionErrors,
          skippedPackets,
          newestPacketId,
        },
      },
      { onConflict: "key" },
    );
    if (stateUpsertError) throw stateUpsertError;

    return {
      ok: true,
      stats: {
        quantityRequested: quantity,
        sascarVehicles: sascarVehicles.length,
        vehicleBindingsUpdated: vehicleBindingUpdates.length,
        packetsFetched: packetsToProcess.length,
        packetsApplied,
        currentPositionsChecked: currentHistoryPackets.length,
        currentPositionsApplied,
        currentPositionErrors,
        syncedVehicles: syncedVehicleIds.size,
        skippedPackets,
        lastPacketIdBefore: lastPacketId,
        lastPacketIdAfter: newestProcessedPacketId,
      },
    };
  } finally {
    inFlight = false;
  }
}
