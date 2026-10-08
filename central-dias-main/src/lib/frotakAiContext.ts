import { createClient } from "@supabase/supabase-js";

export type FrotakAiContext = {
  accessToken: string;
  userId: string;
  membershipId: string;
  workspaceId: string;
  tenantId: string;
  workspaceName: string;
  tenantName: string;
  isOwner: boolean;
  permissions: string[];
};

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
  return readEnv("SUPABASE_URL") || requiredEnv("VITE_SUPABASE_URL");
}

function supabaseAnonKey() {
  return readEnv("SUPABASE_ANON_KEY") || requiredEnv("VITE_SUPABASE_ANON_KEY");
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

export function canReadFinancial(context: FrotakAiContext) {
  return context.isOwner;
}

export function createFrotakAiContextSummary(context: FrotakAiContext) {
  return [
    `Tenant atual: ${context.tenantName} (${context.tenantId}).`,
    `Workspace atual: ${context.workspaceName} (${context.workspaceId}).`,
    context.isOwner
      ? "Perfil autenticado: owner; pode consultar dados financeiros."
      : "Perfil autenticado: membro; nao pode receber nenhum dado financeiro.",
    "Toda pergunta operacional ou financeira do usuario se refere a este tenant/workspace, salvo pedido explicitamente geral.",
    "Nunca consulte, revele, compare ou misture dados de outro tenant/workspace.",
    "As ferramentas disponiveis sao somente leitura e aplicam filtros de tenant/workspace e permissoes no servidor.",
  ].join(" ");
}
