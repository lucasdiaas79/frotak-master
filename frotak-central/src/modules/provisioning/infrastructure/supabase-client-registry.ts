import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRegistry } from "@/modules/provisioning/application/provision-client-database";
import type { ValidatedProvisioning } from "@/modules/provisioning/domain/provisioning-request";
import { translateProvisioningError } from "@/modules/provisioning/infrastructure/supabase-tenant-provisioner";

export class SupabaseClientRegistry implements ClientRegistry {
  constructor(private readonly supabase: SupabaseClient) {}

  async slugExists(slug: string) {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async register(input: {
    request: ValidatedProvisioning;
    databaseName: string;
    clientUrl: string;
    actorUserId: string;
    startsAt: Date;
    endsAt: Date;
  }) {
    const { request } = input;
    const { data, error } = await this.supabase.rpc("master_register_client", {
      p_slug: request.tenantSlug,
      p_database_name: input.databaseName,
      p_client_url: input.clientUrl,
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
}
