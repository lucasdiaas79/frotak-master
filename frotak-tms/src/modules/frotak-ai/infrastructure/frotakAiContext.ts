import { serverAnonKey, serverSupabaseUrl } from "../../../../server/lib/tenant-connection.ts";
import { createClient } from "@supabase/supabase-js";
// Caminho relativo: os testes de IA importam este arquivo direto pelo Node, sem o alias "@/".
import { assertWorkspaceModule } from "../../../lib/entitlements.ts";
import type { FrotakAiContext } from "../domain/frotakAiContext.ts";

type WorkspaceMembershipRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
  created_at: string;
};

type WorkspaceRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
};

type TenantRow = {
  id: string;
  legal_name?: string | null;
  trade_name?: string | null;
  status: string;
};

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function supabaseUrl() {
  return serverSupabaseUrl() || requiredEnv("VITE_SUPABASE_URL");
}

function supabaseAnonKey() {
  return serverAnonKey() || requiredEnv("VITE_SUPABASE_ANON_KEY");
}

export function getSupabaseServerClient(accessToken?: string) {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function resolveFrotakAiContext(
  accessToken: string,
  workspaceId: string,
): Promise<FrotakAiContext> {
  if (!normalizeText(accessToken)) throw new Error("unauthorized");
  if (!normalizeText(workspaceId)) throw new Error("workspace_id ausente");

  const supabase = getSupabaseServerClient(accessToken);
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) throw new Error("unauthorized");

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("id, workspace_id, user_id, status, is_owner, created_at")
    .eq("user_id", authData.user.id)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw new Error(`membership query failed: ${membershipError.message}`);

  const membershipRow = (membership ?? null) as WorkspaceMembershipRow | null;
  if (!membershipRow) throw new Error("workspace_memberships: membership ativa ausente");

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, tenant_id, name, status")
    .eq("id", membershipRow.workspace_id)
    .maybeSingle();

  if (workspaceError) throw new Error(`workspace query failed: ${workspaceError.message}`);
  if (!workspace) throw new Error("workspace ausente");

  const workspaceRow = workspace as WorkspaceRow;
  if (workspaceRow.status !== "active") throw new Error("workspace inativo");

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, legal_name, trade_name, status")
    .eq("id", workspaceRow.tenant_id)
    .maybeSingle();

  if (tenantError) throw new Error(`tenant query failed: ${tenantError.message}`);
  if (!tenant) throw new Error("tenant ausente");

  const tenantRow = tenant as TenantRow;
  if (!["active", "trial"].includes(tenantRow.status)) throw new Error("tenant inativo");

  // Toda chamada da IA (chat, voz, ferramentas, acoes) passa por aqui.
  await assertWorkspaceModule(supabase, membershipRow.workspace_id, "frotak_ai");

  return {
    accessToken,
    userId: authData.user.id,
    membershipId: membershipRow.id,
    workspaceId: membershipRow.workspace_id,
    tenantId: workspaceRow.tenant_id,
    workspaceName: workspaceRow.name,
    tenantName: tenantRow.trade_name || tenantRow.legal_name || workspaceRow.name,
    isOwner: membershipRow.is_owner === true,
    permissions: [],
  };
}
