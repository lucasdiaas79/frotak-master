/** Workspace ativo gravado pelo AppLayout no login. */
export function getActiveWorkspaceId() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem("frotak-active-workspace-id")?.trim() || undefined;
}
