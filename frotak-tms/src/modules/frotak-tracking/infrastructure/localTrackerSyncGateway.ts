import { getActiveTenantId } from "@/lib/auth";
import type { TrackerSyncGateway } from "@/modules/frotak-tracking/application/ports";
import { emptyTrackerSyncState } from "@/modules/frotak-tracking/domain/trackerSyncState";
import {
  getLocalSascarSyncState,
  saveLocalSascarSyncState,
} from "@/modules/fleet-core/infrastructure/localFleetData";

/** Modo local (sem Supabase configurado): simula a sincronizacao com a frota local. */
export class LocalTrackerSyncGateway implements TrackerSyncGateway {
  async getState(tenantId: string) {
    return getLocalSascarSyncState(tenantId) ?? emptyTrackerSyncState();
  }

  async requestSync(input: { quantity: number; forceFull: boolean }) {
    const state = saveLocalSascarSyncState(getActiveTenantId(), "manual");
    return {
      ok: true,
      stats: {
        quantityRequested: input.quantity,
        trackerVehicles: state.syncedVehicles ?? 0,
        vehicleBindingsUpdated: 0,
        packetsFetched: state.packetsFetched ?? 0,
        packetsApplied: state.packetsApplied ?? 0,
        currentPositionsChecked: 0,
        currentPositionsApplied: 0,
        currentPositionErrors: 0,
        syncedVehicles: state.syncedVehicles ?? 0,
        skippedPackets: 0,
        oldPositionsDeleted: 0,
        lastPacketIdBefore: null,
        lastPacketIdAfter: Date.now(),
        source: "manual" as const,
      },
    };
  }

  watchState() {
    return () => {};
  }
}
