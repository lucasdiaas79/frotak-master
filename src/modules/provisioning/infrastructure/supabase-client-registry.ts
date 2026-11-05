import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRegistry } from "@/modules/provisioning/application/provision-client-database";
import type { ValidatedProvisioning } from "@/modules/provisioning/domain/provisioning-request";
import { translateProvisioningError } from "@/modules/provisioning/infrastructure/supabase-tenant-provisioner";

export class SupabaseClientRegistry implements ClientRegistry {
  constructor(private readonly supabase: SupabaseClient) {}

  async register(input: {
    request: ValidatedProvisioning;
    databaseName: string;
    actorUserId: string;
    startsAt: Date;
    endsAt: Date;
  }) {
    const { request } = input;
    const { data, error } = await this.supabase.rpc("master_register_client", {
      p_slug: request.tenantSlug,
      p_database_name: input.databaseName,
      p_legal_name: request.legalName,
      p_trade_name: request.tradeName || null,
      p_cnpj: request.cnpj,
      p_workspace_name: request.workspaceName,
      p_plan_code: request.planCode,
      p_starts_at: input.startsAt.toISOString(),
      p_ends_at: input.endsAt.toISOString(),
      p_subscription_period: request.subscriptionPeriod,
      p_max_vehicles: request.maxVehicles,
      p_enabled_module_codes: request.modules,
      p_owner_email: request.ownerEmail,
      p_actor_user_id: input.actorUserId,
    });
    if (error) translateProvisioningError(error);
    return data as string;
  }

  async activate(tenantId: string, clientUrl: string, actorUserId: string) {
    const { error } = await this.supabase.rpc("master_activate_client", {
      p_tenant_id: tenantId,
      p_client_url: clientUrl,
      p_actor_user_id: actorUserId,
    });
    if (error) throw error;
  }

  async discard(tenantId: string, actorUserId: string) {
    const { error } = await this.supabase.rpc("master_discard_client", {
      p_tenant_id: tenantId,
      p_actor_user_id: actorUserId,
    });
    if (error) throw error;
  }
}
