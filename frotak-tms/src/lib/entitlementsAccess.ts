import { fetchWorkspaceEntitlements, type WorkspaceEntitlements } from "@/lib/entitlements";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

// Cache curto no navegador, no mesmo molde do acesso financeiro: o menu reflete a
// mudanca feita no Master em ate um minuto, ou na volta do foco para a aba.
const ENTITLEMENTS_TTL_MS = 60_000;

let entitlementsCache: {
  workspaceId: string;
  value: WorkspaceEntitlements;
  loadedAt: number;
} | null = null;
const entitlementsInFlight = new Map<string, Promise<WorkspaceEntitlements>>();

export function clearWorkspaceEntitlementsCache() {
  entitlementsCache = null;
  entitlementsInFlight.clear();
}

/** null quando nao ha workspace ou backend (modo local): nada e bloqueado na interface. */
export async function getWorkspaceEntitlements(
  workspaceId: string | undefined,
  force = false,
): Promise<WorkspaceEntitlements | null> {
  if (!workspaceId || !hasSupabaseConfig()) return null;

  if (
    !force &&
    entitlementsCache?.workspaceId === workspaceId &&
    Date.now() - entitlementsCache.loadedAt < ENTITLEMENTS_TTL_MS
  ) {
    return entitlementsCache.value;
  }

  const inFlight = entitlementsInFlight.get(workspaceId);
  if (inFlight) return inFlight;

  const request = fetchWorkspaceEntitlements(supabase, workspaceId)
    .then((value) => {
      entitlementsCache = { workspaceId, value, loadedAt: Date.now() };
      return value;
    })
    .finally(() => entitlementsInFlight.delete(workspaceId));

  entitlementsInFlight.set(workspaceId, request);
  return request;
}
