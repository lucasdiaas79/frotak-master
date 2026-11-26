import type { SupabaseClient } from "@supabase/supabase-js";
import { agentRequest } from "@/core/server/agent-client";
import type {
  ClientAccessGateway,
  ClientAccessRecord,
  ClientOwner,
} from "@/modules/tenants/application/start-client-access";
import { SupabaseClientAccessGateway } from "@/modules/tenants/infrastructure/supabase-client-access-gateway";

/** Banco por cliente: o dono e a credencial vêm do banco do cliente; a auditoria fica no Central. */
export class AgentClientAccessGateway implements ClientAccessGateway {
  private readonly audit: SupabaseClientAccessGateway;

  constructor(private readonly supabase: SupabaseClient) {
    this.audit = new SupabaseClientAccessGateway(supabase);
  }

  async findOwner(tenantId: string): Promise<ClientOwner | null> {
    const { data, error } = await this.supabase
      .from("client_databases")
      .select("slug, client_url, tenants(legal_name, trade_name)")
      .eq("tenant_id", tenantId)
      .maybeSingle<{
        slug: string;
        client_url: string | null;
        tenants: { legal_name: string; trade_name: string | null } | null;
      }>();
    if (error) throw error;
    if (!data) return null;

    const owner = await agentRequest<{ userId?: string; email?: string }>(
      "GET",
      `/clients/${data.slug}/owner`,
    );
    if (!owner.userId || !owner.email) return null;

    return {
      userId: owner.userId,
      email: owner.email,
      clientName: data.tenants?.trade_name || data.tenants?.legal_name || data.slug,
      slug: data.slug,
      clientUrl: data.client_url ?? undefined,
    };
  }

  async issueOneTimeLogin(owner: ClientOwner) {
    const access = await agentRequest<{ tokenHash: string }>(
      "POST",
      `/clients/${owner.slug}/support-login`,
    );
    return access.tokenHash;
  }

  record(access: ClientAccessRecord) {
    return this.audit.record(access);
  }
}
