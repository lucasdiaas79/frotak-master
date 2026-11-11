import { getSupabaseAdmin } from "./supabase-admin.ts";

// Quem e o usuario da transportadora (Frotak normal) numa chamada de servidor:
// confere o token, a participacao ativa no workspace e devolve o tenant.

export class CarrierContextError extends Error {}

export async function resolveCarrierContext(accessToken: string, workspaceId: string) {
  if (!accessToken || !workspaceId)
    throw new CarrierContextError("Sessão expirada. Entre novamente.");
  const supabase = getSupabaseAdmin();
  const { data: auth, error } = await supabase.auth.getUser(accessToken);
  if (error || !auth.user) throw new CarrierContextError("Sessão expirada. Entre novamente.");
  const { data: membership } = await supabase
    .from("workspace_memberships")
    .select("workspace_id, is_owner, status")
    .eq("user_id", auth.user.id)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) throw new CarrierContextError("Sem acesso a esta empresa.");
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("tenant_id, status")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!workspace || workspace.status !== "active")
    throw new CarrierContextError("Empresa indisponível.");
  return {
    userId: auth.user.id,
    tenantId: workspace.tenant_id as string,
    isOwner: membership.is_owner === true,
  };
}
