import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentAccessToken, getCurrentUser, getProfile } from "@/lib/auth";
import type { TrackerSyncGateway } from "@/modules/frotak-tracking/application/ports";
import type { TrackerSyncResponse } from "@/modules/frotak-tracking/domain/trackerPositions";
import {
  trackerSyncStateFromRecord,
  type TrackerSyncState,
} from "@/modules/frotak-tracking/domain/trackerSyncState";

type SyncStateRow = {
  integration?: string;
  synced_at: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Navegador com backend: estado lido do Supabase (e acompanhado em tempo real) e
 * sincronizacao pedida a API /api/sascar/sync do proprio app.
 */
export class HttpTrackerSyncGateway implements TrackerSyncGateway {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly provider = "sascar",
  ) {}

  async getState(tenantId: string) {
    const { data, error } = await this.supabase
      .from("integration_sync_state")
      .select("synced_at, metadata")
      .eq("tenant_id", tenantId)
      .eq("integration", this.provider)
      .eq("scope", "positions")
      .maybeSingle<SyncStateRow>();
    if (error) throw error;
    return trackerSyncStateFromRecord(data?.synced_at, data?.metadata);
  }

  async requestSync(input: { quantity: number; forceFull: boolean }) {
    const user = await getCurrentUser();
    const profile = user ? await getProfile(user.id) : null;
    const accessToken = await getCurrentAccessToken();

    const response = await fetch("/api/sascar/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        workspaceId: profile?.workspaceId,
        quantity: input.quantity,
        forceFull: input.forceFull,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      TrackerSyncResponse | { message?: string; statusMessage?: string } | null;

    if (!response.ok) {
      const message =
        data && "statusMessage" in data
          ? data.statusMessage
          : data && "message" in data
            ? data.message
            : "Falha ao sincronizar Sascar.";
      throw new Error(message || "Falha ao sincronizar Sascar.");
    }
    if (!data) throw new Error("A sincronização Sascar não retornou dados.");
    return data as TrackerSyncResponse;
  }

  watchState(tenantId: string, onChange: (state: TrackerSyncState) => void) {
    const channel = this.supabase
      .channel("sascar-sync-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "integration_sync_state",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const row = payload.new as SyncStateRow;
          if (row.integration !== this.provider) return;
          onChange(trackerSyncStateFromRecord(row.synced_at, row.metadata));
        },
      )
      .subscribe();

    return () => {
      void this.supabase.removeChannel(channel);
    };
  }
}
