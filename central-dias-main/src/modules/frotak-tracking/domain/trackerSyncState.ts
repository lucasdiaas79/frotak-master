import type { TrackerSyncSource } from "@/modules/frotak-tracking/domain/trackerPositions";

/** Ultima sincronizacao do rastreador, como a tela do mapa mostra. */
export interface TrackerSyncState {
  syncedAt: string | null;
  source: TrackerSyncSource | null;
  syncedVehicles?: number;
  packetsApplied?: number;
  packetsFetched?: number;
}

export const emptyTrackerSyncState = (): TrackerSyncState => ({
  syncedAt: null,
  source: null,
  syncedVehicles: 0,
  packetsApplied: 0,
  packetsFetched: 0,
});

/** Converte o registro gravado pela sincronizacao (data + metadados) no estado da tela. */
export function trackerSyncStateFromRecord(
  syncedAt: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): TrackerSyncState {
  const data = metadata ?? {};
  const source = data.source === "cron" || data.source === "manual" ? data.source : null;
  return {
    syncedAt: syncedAt ?? null,
    source,
    syncedVehicles: Number(data.syncedVehicles ?? data.packetsApplied ?? 0),
    packetsApplied: Number(data.packetsApplied ?? 0),
    packetsFetched: Number(data.packetsFetched ?? 0),
  };
}
