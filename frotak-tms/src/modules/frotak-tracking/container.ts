// Composicao do modulo no navegador. A tela do mapa importa daqui.
import { getActiveTenantId } from "@/lib/auth";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { TrackerSyncGateway } from "@/modules/frotak-tracking/application/ports";
import * as trackerSync from "@/modules/frotak-tracking/application/trackerSyncClient";
import type { TrackerSyncState } from "@/modules/frotak-tracking/domain/trackerSyncState";
import { HttpTrackerSyncGateway } from "@/modules/frotak-tracking/infrastructure/httpTrackerSyncGateway";
import { LocalTrackerSyncGateway } from "@/modules/frotak-tracking/infrastructure/localTrackerSyncGateway";

let gateway: TrackerSyncGateway | null = null;

function syncGateway() {
  gateway ??= hasSupabaseConfig()
    ? new HttpTrackerSyncGateway(supabase)
    : new LocalTrackerSyncGateway();
  return gateway;
}

export type { TrackerSyncState };

export function getTrackerSyncState() {
  return trackerSync.getTrackerSyncState(syncGateway(), getActiveTenantId());
}

export function requestTrackerSync(input?: { quantity?: number; forceFull?: boolean }) {
  return trackerSync.requestTrackerSync(syncGateway(), input);
}

export function watchTrackerSyncState(
  onNewSync: (state: TrackerSyncState) => void,
  lastSeenSyncAt: () => string | null,
) {
  return trackerSync.watchTrackerSyncState(
    syncGateway(),
    getActiveTenantId(),
    onNewSync,
    lastSeenSyncAt,
  );
}
