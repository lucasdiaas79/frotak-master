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
  oldPositionsDeleted?: number;
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
    .eq("tenant_id", getActiveTenantId())
    .eq("integration", "sascar")
    .eq("scope", "positions")
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

  const response = await fetch("/api/sascar/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quantity: Number(input.quantity ?? 3000),
      forceFull: Boolean(input.forceFull),
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | SascarSyncResponse
    | { message?: string; statusMessage?: string }
    | null;

  if (!response.ok) {
    const message =
      data && "statusMessage" in data
        ? data.statusMessage
        : data && "message" in data
          ? data.message
          : "Falha ao sincronizar Sascar.";
    throw new Error(message || "Falha ao sincronizar Sascar.");
  }

  if (!data) {
    throw new Error("A sincronização Sascar não retornou dados.");
  }

  return data;
}
