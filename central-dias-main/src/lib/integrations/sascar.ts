import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { getActiveTenantId } from "@/lib/auth";
import { getLocalSascarSyncState, saveLocalSascarSyncState } from "@/lib/localFleetData";

export type SascarSyncSource = "cron" | "manual";

export interface SascarSyncStats {
  quantityRequested: number;
  sascarVehicles: number;
  vehicleBindingsUpdated: number;
  packetsFetched: number;
  packetsApplied: number;
  syncedVehicles: number;
  skippedPackets: number;
  lastPacketIdBefore: number | null;
  lastPacketIdAfter: number | null;
  source: SascarSyncSource;
}

export interface SascarSyncResponse {
  ok: boolean;
  stats: SascarSyncStats;
}

export interface SascarSyncInput {
  quantity?: number;
  forceFull?: boolean;
}

export interface SascarSyncState {
  syncedAt: string | null;
  source: SascarSyncSource | null;
  syncedVehicles?: number;
  packetsApplied?: number;
  packetsFetched?: number;
}

interface SascarSyncStateRow {
  synced_at: string | null;
  metadata: Record<string, unknown> | null;
}

export function mapSascarSyncStateRow(row?: SascarSyncStateRow | null): SascarSyncState {
  const metadata = row?.metadata ?? {};
  const source =
    metadata.source === "cron" || metadata.source === "manual" ? metadata.source : null;

  return {
    syncedAt: row?.synced_at ?? null,
    source,
    syncedVehicles: Number(metadata.syncedVehicles ?? metadata.packetsApplied ?? 0),
    packetsApplied: Number(metadata.packetsApplied ?? 0),
    packetsFetched: Number(metadata.packetsFetched ?? 0),
  };
}

export async function getSascarSyncState(): Promise<SascarSyncState> {
  if (!hasSupabaseConfig()) {
    return (
      getLocalSascarSyncState(getActiveTenantId()) ?? {
        syncedAt: null,
        source: null,
        syncedVehicles: 0,
        packetsApplied: 0,
        packetsFetched: 0,
      }
    );
  }

  const { data, error } = await supabase
    .from("integration_sync_state")
    .select("synced_at, metadata")
    .eq("key", "sascar_positions")
    .maybeSingle();

  if (error) throw error;
  return mapSascarSyncStateRow(data as SascarSyncStateRow | null);
}

export async function syncSascarPositions(
  input: SascarSyncInput = {},
): Promise<SascarSyncResponse> {
  if (!hasSupabaseConfig()) {
    const state = saveLocalSascarSyncState(getActiveTenantId(), "manual");
    return {
      ok: true,
      stats: {
        quantityRequested: Number(input.quantity ?? 3000),
        sascarVehicles: state.syncedVehicles ?? 0,
        vehicleBindingsUpdated: 0,
        packetsFetched: state.packetsFetched ?? 0,
        packetsApplied: state.packetsApplied ?? 0,
        syncedVehicles: state.syncedVehicles ?? 0,
        skippedPackets: 0,
        lastPacketIdBefore: null,
        lastPacketIdAfter: Date.now(),
        source: "manual",
      },
    };
  }

  const { data, error } = await supabase.functions.invoke<SascarSyncResponse>("sascar-sync", {
    body: {
      quantity: Number(input.quantity ?? 3000),
      forceFull: Boolean(input.forceFull),
      source: "manual",
    },
  });

  if (error) {
    throw new Error(error.message || "Falha ao sincronizar Sascar.");
  }

  if (!data) {
    throw new Error("A sincronização Sascar não retornou dados.");
  }

  return data;
}
