import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TrackerSyncTarget,
  TrackingRepository,
} from "@/modules/frotak-tracking/application/ports";
import {
  recordedAtOf,
  type TrackedVehicle,
  type TrackerPosition,
} from "@/modules/frotak-tracking/domain/trackerPositions";

type VehicleRow = {
  id: string;
  tenant_id: string;
  plate: string;
  sascar_id: string | null;
  last_position_at: string | null;
};

type IntegrationRow = {
  tenant_id: string;
  provider: string;
  status: string;
  secret_ref: string | null;
  config: Record<string, unknown> | null;
};

/**
 * Persistencia da sincronizacao no Supabase (service role). O id do veiculo no
 * fornecedor fica em vehicles.sascar_id, unica coluna de vinculo que o schema tem hoje.
 */
export class SupabaseTrackingRepository implements TrackingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findSyncTarget(
    workspaceId: string | null,
    providers: string[],
  ): Promise<TrackerSyncTarget> {
    if (!workspaceId) return { workspaceId: null, tenantId: null, integration: null };

    const { data: workspace, error: workspaceError } = await this.supabase
      .from("workspaces")
      .select("id, tenant_id")
      .eq("id", workspaceId)
      .maybeSingle<{ id: string; tenant_id: string | null }>();
    if (workspaceError) throw workspaceError;
    if (!workspace?.tenant_id) throw new Error("Workspace Sascar nao encontrado.");

    const { data, error } = await this.supabase
      .from("workspace_integrations")
      .select("workspace_id, tenant_id, provider, status, secret_ref, config")
      .eq("workspace_id", workspaceId)
      .in("provider", providers)
      .maybeSingle<IntegrationRow>();

    if (error) {
      // Banco anterior a tabela de integracoes: credenciais globais.
      if (error.code === "42P01") {
        return { workspaceId, tenantId: workspace.tenant_id, integration: null };
      }
      throw error;
    }
    if (!data) throw new Error("Integração Sascar não configurada para este workspace.");
    if (data.status !== "active") throw new Error("Integração Sascar inativa para este workspace.");
    if (data.tenant_id !== workspace.tenant_id) {
      throw new Error("Integração Sascar pertence a outro tenant.");
    }

    return {
      workspaceId,
      tenantId: workspace.tenant_id,
      integration: { provider: data.provider, secretRef: data.secret_ref, config: data.config },
    };
  }

  async acquireLock(key: string, ttlSeconds: number) {
    const { data, error } = await this.supabase.rpc("acquire_integration_lock", {
      p_key: key,
      p_ttl_seconds: ttlSeconds,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async releaseLock(key: string) {
    await this.supabase.rpc("release_integration_lock", { p_key: key });
  }

  async listVehicles(tenantId: string | null): Promise<TrackedVehicle[]> {
    let query = this.supabase
      .from("vehicles")
      .select("id, tenant_id, plate, sascar_id, last_position_at");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as VehicleRow[]).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      plate: row.plate,
      externalId: row.sascar_id,
      lastPositionAt: row.last_position_at,
    }));
  }

  async readLastSequence(tenantId: string, provider: string) {
    const { data, error } = await this.supabase
      .from("integration_sync_state")
      .select("synced_at, metadata")
      .eq("tenant_id", tenantId)
      .eq("integration", provider)
      .eq("scope", "positions")
      .maybeSingle<{ metadata: Record<string, unknown> | null }>();
    if (error) throw error;
    const metadata = data?.metadata;
    return Number(metadata?.lastPacketId ?? metadata?.last_packet_id ?? 0) || null;
  }

  async bindVehicle(vehicleId: string, externalId: string) {
    const { error } = await this.supabase
      .from("vehicles")
      .update({ sascar_id: externalId })
      .eq("id", vehicleId);
    if (error) throw error;
  }

  async savePosition(vehicle: TrackedVehicle, position: TrackerPosition, provider: string) {
    const recordedAt = recordedAtOf(position);
    const { error: insertError } = await this.supabase.from("vehicle_positions").insert({
      tenant_id: vehicle.tenantId,
      vehicle_id: vehicle.id,
      lat: position.latitude,
      lng: position.longitude,
      city: position.city ?? null,
      state: position.state ?? null,
      speed: position.speed ?? null,
      direction: position.direction ?? null,
      source: provider,
      raw_payload: position.raw,
      recorded_at: recordedAt,
    });
    if (insertError) throw insertError;

    const { error: updateError } = await this.supabase
      .from("vehicles")
      .update({
        lat: position.latitude,
        lng: position.longitude,
        city: position.city ?? null,
        state: position.state ?? null,
        sascar_id: position.externalVehicleId,
        last_position_at: recordedAt,
      })
      .eq("id", vehicle.id);
    if (updateError) throw updateError;
  }

  async purgeOldPositions(retention: string) {
    const { data, error } = await this.supabase.rpc("purge_old_vehicle_positions", {
      p_retention: retention,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async saveSyncState(input: {
    tenantId: string;
    provider: string;
    syncedAt: string;
    metadata: Record<string, unknown>;
  }) {
    const { error } = await this.supabase.from("integration_sync_state").upsert(
      {
        tenant_id: input.tenantId,
        integration: input.provider,
        scope: "positions",
        synced_at: input.syncedAt,
        metadata: input.metadata,
      },
      { onConflict: "tenant_id,integration,scope" },
    );
    if (error) throw error;
  }
}
