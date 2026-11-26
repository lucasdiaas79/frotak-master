import type { TrackerSyncGateway } from "@/modules/frotak-tracking/application/ports";
import type { TrackerSyncState } from "@/modules/frotak-tracking/domain/trackerSyncState";

// Casos de uso do navegador sobre a sincronizacao do rastreador.

export function getTrackerSyncState(gateway: TrackerSyncGateway, tenantId: string) {
  return gateway.getState(tenantId);
}

/** Sincronizacao manual pedida pela tela do mapa. */
export function requestTrackerSync(
  gateway: TrackerSyncGateway,
  input: { quantity?: number; forceFull?: boolean } = {},
) {
  return gateway.requestSync({
    quantity: Number(input.quantity ?? 3000),
    forceFull: Boolean(input.forceFull),
  });
}

/** Avisa so quando ha sincronizacao nova (ignora repeticoes do mesmo horario). */
export function watchTrackerSyncState(
  gateway: TrackerSyncGateway,
  tenantId: string,
  onNewSync: (state: TrackerSyncState) => void,
  lastSeenSyncAt: () => string | null,
) {
  return gateway.watchState(tenantId, (state) => {
    if (!state.syncedAt || state.syncedAt === lastSeenSyncAt()) return;
    onNewSync(state);
  });
}
