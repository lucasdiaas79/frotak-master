import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClientAccessGateway,
  ClientAccessRecord,
  ClientOwner,
} from "@/modules/tenants/application/start-client-access";

export class SupabaseClientAccessGateway implements ClientAccessGateway {
  constructor(private readonly supabase: SupabaseClient) {}

  async findOwner(tenantId: string): Promise<ClientOwner | null> {
    const { data: tenant, error: tenantError } = await this.supabase
      .from("tenants")
      .select("legal_name, trade_name")
      .eq("id", tenantId)
      .maybeSingle<{ legal_name: string; trade_name: string | null }>();
    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) return null;

    const { data: workspaces, error: workspacesError } = await this.supabase
      .from("workspaces")
      .select("id")
      .eq("tenant_id", tenantId);
    if (workspacesError) throw new Error(workspacesError.message);

    const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id as string);
    if (workspaceIds.length === 0) return null;

    const { data: owners, error: ownersError } = await this.supabase
      .from("workspace_memberships")
      .select("user_id")
      .in("workspace_id", workspaceIds)
      .eq("is_owner", true)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (ownersError) throw new Error(ownersError.message);

    const userId = owners?.[0]?.user_id as string | undefined;
    if (!userId) return null;

    const { data: userData, error: userError } = await this.supabase.auth.admin.getUserById(userId);
    if (userError) throw new Error(userError.message);
    if (!userData.user?.email) return null;

    return {
      userId,
      email: userData.user.email,
      clientName: tenant.trade_name || tenant.legal_name,
    };
  }

  async issueOneTimeLogin(email: string) {
    // Só gera o link; nenhum e-mail é enviado.
    const { data, error } = await this.supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) throw new Error(error.message);

    const tokenHash = data.properties?.hashed_token;
    if (!tokenHash) throw new Error("Auth nao devolveu a credencial de uso unico.");
    return tokenHash;
  }

  async record({ actor, tenantId, targetUserId }: ClientAccessRecord) {
    const { error } = await this.supabase.from("audit_logs").insert({
      actor_user_id: actor.userId,
      tenant_id: tenantId,
      action: "master.client_access",
      entity_type: "tenant",
      entity_id: tenantId,
      metadata: {
        target_user_id: targetUserId,
        actor_email: actor.email,
        actor_role: actor.role,
      },
    });
    if (error) throw new Error(error.message);
  }
}
