import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/core/domain/domain-error";
import type {
  ProvisionedTenant,
  TenantProvisioner,
} from "@/modules/provisioning/application/ports";
import type { ValidatedProvisioning } from "@/modules/provisioning/domain/provisioning-request";

type ProvisionRpcRow = {
  tenant_id: string;
  workspace_id: string;
  membership_id: string;
  owner_role_id: string;
};

export function translateProvisioningError(error: PostgrestError): never {
  const message = error.message;
  if (/duplicate key|already exists/i.test(message)) {
    throw new DomainError("CONFLICT", "Já existe um cliente com esse nome ou endereço.");
  }
  if (/actor is not authorized/i.test(message)) {
    throw new DomainError("FORBIDDEN", "Você não possui permissão para criar clientes.");
  }
  if (/cnpj/i.test(message)) throw new DomainError("INVALID_INPUT", "CNPJ inválido.");
  if (/plan/i.test(message)) {
    throw new DomainError("INVALID_INPUT", "Plano informado não existe ou está inativo.");
  }
  if (/module/i.test(message)) {
    throw new DomainError("INVALID_INPUT", "Módulo informado não existe ou está inativo.");
  }
  if (/max_vehicles/i.test(message)) {
    throw new DomainError("INVALID_INPUT", "Limite de veículos inválido.");
  }
  throw error;
}

export class SupabaseTenantProvisioner implements TenantProvisioner {
  constructor(private readonly supabase: SupabaseClient) {}

  async provision(input: {
    request: ValidatedProvisioning;
    ownerUserId: string;
    actorUserId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<ProvisionedTenant> {
    const { request } = input;
    const { data, error } = await this.supabase.rpc("provision_tenant", {
      p_owner_user_id: input.ownerUserId,
      p_owner_full_name: request.ownerName,
      p_legal_name: request.legalName,
      p_trade_name: request.tradeName || null,
      p_cnpj: request.cnpj,
      p_tenant_slug: request.tenantSlug,
      p_workspace_name: request.workspaceName,
      p_workspace_slug: request.workspaceSlug,
      p_plan_code: request.planCode,
      p_starts_at: input.startsAt.toISOString(),
      p_ends_at: input.endsAt.toISOString(),
      p_subscription_period: request.subscriptionPeriod,
      p_max_vehicles: request.maxVehicles,
      p_enabled_module_codes: request.modules,
      p_actor_user_id: input.actorUserId,
    });

    if (error) translateProvisioningError(error);

    const row = (Array.isArray(data) ? data[0] : data) as ProvisionRpcRow | undefined;
    if (!row?.tenant_id || !row.workspace_id || !row.membership_id || !row.owner_role_id) {
      throw new Error("provision_tenant did not return required identifiers");
    }

    return {
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      membershipId: row.membership_id,
      ownerRoleId: row.owner_role_id,
    };
  }
}
