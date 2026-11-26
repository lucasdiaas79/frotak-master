import {
  TrackedVehicleIndex,
  attachPlates,
  bySequence,
  coveredVehicleIds,
  isNewerPosition,
  isStalePosition,
  latestPositionPerVehicle,
  planVehicleBindings,
  recordedAtOf,
  type TrackedVehicle,
  type TrackerPosition,
  type TrackerSyncResponse,
  type TrackerSyncSource,
} from "@/modules/frotak-tracking/domain/trackerPositions";
import type {
  TrackerProvider,
  TrackerProviderFactory,
  TrackerSyncSettings,
  TrackingRepository,
} from "@/modules/frotak-tracking/application/ports";

export interface TrackerSyncInput {
  workspaceId?: string;
  quantity?: number;
  forceFull?: boolean;
  includeCurrentHistory?: boolean;
  source?: TrackerSyncSource;
}

export type TrackerSyncDeps = {
  repository: TrackingRepository;
  providers: TrackerProviderFactory;
  settings: TrackerSyncSettings;
};

const LOCK_TTL_SECONDS = 55;
const INITIAL_BACKFILL_PAGES = 8;
const POSITION_RETENTION = "24 hours";

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

/**
 * Primeira sincronizacao (sem cursor): volta em paginas de sequencia ate cobrir todos os
 * veiculos do TMS que podem ser casados, ou ate o limite de paginas.
 */
async function collectInitialCoverage(
  provider: TrackerProvider,
  sortedLatest: TrackerPosition[],
  index: TrackedVehicleIndex,
  quantity: number,
  enrich: (positions: TrackerPosition[]) => TrackerPosition[],
) {
  if (!sortedLatest.length) return sortedLatest;

  const matchableVehicleIds = new Set(
    index.vehicles
      .filter((vehicle) => vehicle.externalId || index.hasPlate(vehicle.plate))
      .map((vehicle) => vehicle.id),
  );

  let positions = [...sortedLatest];
  let covered = coveredVehicleIds(positions, index);
  const oldestSequence = sortedLatest[0]?.sequence ?? null;

  if (
    !oldestSequence ||
    covered.size >= matchableVehicleIds.size ||
    quantity < provider.batchLimit
  ) {
    return positions;
  }

  let rangeEnd = oldestSequence - 1;
  for (let page = 0; page < INITIAL_BACKFILL_PAGES && rangeEnd > 0; page += 1) {
    const rangeStart = Math.max(rangeEnd - (provider.batchLimit - 1), 1);
    const batch = enrich(
      await provider.positionsBySequence(rangeStart, rangeEnd, provider.batchLimit),
    ).sort(bySequence);
    if (!batch.length) break;

    positions = [...batch, ...positions];
    covered = coveredVehicleIds(positions, index);
    if (covered.size >= matchableVehicleIds.size) break;
    if (batch.length < provider.batchLimit) break;

    rangeEnd = rangeStart - 1;
  }

  return positions.sort(bySequence);
}

/** Cursor gravado e mais antigo do que a janela atual: busca as posicoes perdidas. */
async function recoverGap(
  provider: TrackerProvider,
  lastSequence: number,
  newestSequence: number,
  maxPages: number,
  enrich: (positions: TrackerPosition[]) => TrackerPosition[],
) {
  const recovered: TrackerPosition[] = [];
  let cursor = lastSequence + 1;
  let pages = 0;

  while (cursor <= newestSequence && pages < maxPages) {
    const end = Math.min(cursor + (provider.batchLimit - 1), newestSequence);
    recovered.push(...enrich(await provider.positionsBySequence(cursor, end, provider.batchLimit)));
    cursor = end + 1;
    pages += 1;
  }

  return recovered;
}

/**
 * Sincroniza posicoes do rastreador do workspace com o TMS: vincula veiculos pela placa,
 * aplica as posicoes novas a partir do cursor gravado, completa veiculos parados pelo
 * historico recente, apaga posicoes antigas e grava o novo cursor.
 */
export async function syncTrackerPositions(
  deps: TrackerSyncDeps,
  input: TrackerSyncInput = {},
): Promise<TrackerSyncResponse> {
  const { repository, settings } = deps;
  let lockKey: string | null = null;

  try {
    const target = await repository.findSyncTarget(
      input.workspaceId ?? null,
      deps.providers.supportedProviders,
    );
    const provider = deps.providers.create(target.integration);
    const quantity = Math.min(Math.max(Number(input.quantity ?? 3000), 1), provider.batchLimit);
    const forceFull = Boolean(input.forceFull);
    const source = input.source ?? "manual";
    const includeCurrentHistory =
      input.includeCurrentHistory ?? settings.includeCurrentHistoryByDefault;

    const key = target.workspaceId
      ? `${provider.name}-sync:${target.workspaceId}`
      : `${provider.name}-sync`;
    if (!(await repository.acquireLock(key, LOCK_TTL_SECONDS))) {
      throw new Error(`A sincronizacao ${provider.label} ja esta em andamento.`);
    }
    lockKey = key;

    const vehicles = await repository.listVehicles(target.tenantId);
    const tenantIds = target.tenantId
      ? [target.tenantId]
      : Array.from(new Set(vehicles.map((vehicle) => vehicle.tenantId).filter(Boolean)));
    const primaryTenantId = target.tenantId ?? tenantIds[0] ?? null;
    const storedSequence = primaryTenantId
      ? await repository.readLastSequence(primaryTenantId, provider.name)
      : null;

    const index = new TrackedVehicleIndex(vehicles);
    const providerVehicles = await provider.listVehicles();
    const providerVehiclesById = new Map(
      providerVehicles.map((vehicle) => [vehicle.externalId, vehicle]),
    );
    const enrich = (positions: TrackerPosition[]) => attachPlates(positions, providerVehiclesById);

    const bindings = planVehicleBindings(index, providerVehicles);
    for (const binding of bindings) {
      await repository.bindVehicle(binding.vehicle.id, binding.externalId);
    }
    for (const binding of bindings) index.bind(binding.vehicle, binding.externalId);

    const sortedLatest = enrich(await provider.latestPositions(quantity)).sort(bySequence);
    const lastSequence = forceFull ? null : storedSequence;
    const oldestSequence = sortedLatest[0]?.sequence ?? null;
    const newestSequence = sortedLatest.at(-1)?.sequence ?? null;

    let toProcess: TrackerPosition[] = [];
    if (!sortedLatest.length) {
      toProcess = [];
    } else if (!lastSequence) {
      toProcess = await collectInitialCoverage(provider, sortedLatest, index, quantity, enrich);
    } else if (
      oldestSequence != null &&
      newestSequence != null &&
      lastSequence + 1 < oldestSequence
    ) {
      const recovered = await recoverGap(
        provider,
        lastSequence,
        newestSequence,
        settings.maxRecoveryPages,
        enrich,
      );
      toProcess = recovered.length
        ? recovered.sort(bySequence)
        : sortedLatest.filter((position) => position.sequence > lastSequence);
    } else {
      toProcess = sortedLatest.filter((position) => position.sequence > lastSequence);
    }

    let skippedPackets = 0;
    let packetsApplied = 0;
    const syncedVehicleIds = new Set<string>();

    async function apply(vehicle: TrackedVehicle, position: TrackerPosition) {
      await repository.savePosition(vehicle, position, provider.name);
      vehicle.lastPositionAt = recordedAtOf(position);
      syncedVehicleIds.add(vehicle.id);
    }

    for (const position of latestPositionPerVehicle(toProcess.filter((item) => item.hasGps))) {
      const vehicle = index.match(position);
      if (!vehicle || !isNewerPosition(position, vehicle.lastPositionAt)) {
        skippedPackets += 1;
        continue;
      }
      await apply(vehicle, position);
      packetsApplied += 1;
    }

    // Veiculos sem posicao nova e parados ha tempo: busca o historico recente de cada um.
    const historyEnd = new Date();
    const historyStart = new Date(
      historyEnd.getTime() - settings.currentHistoryLookbackHours * 60 * 60 * 1000,
    );
    const historyCandidates = includeCurrentHistory
      ? vehicles.filter(
          (vehicle) =>
            vehicle.externalId &&
            !syncedVehicleIds.has(vehicle.id) &&
            isStalePosition(vehicle.lastPositionAt, settings.currentHistoryStaleMinutes),
        )
      : [];

    let currentPositionErrors = 0;
    const historyLatest = await mapWithConcurrency(
      historyCandidates,
      settings.currentHistoryConcurrency,
      async (vehicle) => {
        try {
          const history = await provider.vehicleHistory(
            vehicle.externalId as string,
            historyStart,
            historyEnd,
          );
          const latest = latestPositionPerVehicle(history.filter((item) => item.hasGps)).at(-1);
          return latest ? { vehicle, position: latest } : null;
        } catch {
          currentPositionErrors += 1;
          return null;
        }
      },
    );

    let currentPositionsApplied = 0;
    for (const item of historyLatest) {
      if (!item || !isNewerPosition(item.position, item.vehicle.lastPositionAt)) continue;
      await apply(item.vehicle, item.position);
      currentPositionsApplied += 1;
    }

    const lastPacketIdAfter = toProcess.at(-1)?.sequence ?? newestSequence ?? lastSequence ?? null;
    const oldPositionsDeleted = await repository.purgeOldPositions(POSITION_RETENTION);

    const syncedAt = new Date().toISOString();
    for (const tenantId of tenantIds) {
      await repository.saveSyncState({
        tenantId,
        provider: provider.name,
        syncedAt,
        metadata: {
          source,
          runtime: "nitro-api",
          workspaceId: target.workspaceId,
          quantityRequested: quantity,
          includeCurrentHistory,
          packetsFetched: toProcess.length,
          packetsApplied,
          currentPositionsChecked: historyLatest.length,
          currentPositionsApplied,
          currentPositionErrors,
          syncedVehicles: syncedVehicleIds.size,
          skippedPackets,
          oldPositionsDeleted,
          newestPacketId: newestSequence,
          lastPacketId: lastPacketIdAfter,
        },
      });
    }

    return {
      ok: true,
      stats: {
        quantityRequested: quantity,
        trackerVehicles: providerVehicles.length,
        vehicleBindingsUpdated: bindings.length,
        packetsFetched: toProcess.length,
        packetsApplied,
        currentPositionsChecked: historyLatest.length,
        currentPositionsApplied,
        currentPositionErrors,
        syncedVehicles: syncedVehicleIds.size,
        skippedPackets,
        oldPositionsDeleted,
        lastPacketIdBefore: lastSequence,
        lastPacketIdAfter,
        source,
      },
    };
  } finally {
    if (lockKey) {
      try {
        await repository.releaseLock(lockKey);
      } catch (error) {
        console.error("[tracker-sync] failed to release lock", error);
      }
    }
  }
}
