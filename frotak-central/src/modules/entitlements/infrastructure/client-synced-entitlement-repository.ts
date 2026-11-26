import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/core/domain/domain-error";
import { agentRequest } from "@/core/server/agent-client";
import type { ModuleCode, ProductCode } from "@/modules/catalog/domain/catalog";
import type { EntitlementRepository } from "@/modules/entitlements/application/entitlement-repository";

/**
 * Banco por cliente: quem cumpre o bloqueio é o banco do cliente, e o Central guarda o catálogo.
 * Aplica primeiro no cliente; se ele estiver fora do ar, nada muda e o operador é avisado.
 */
export class ClientSyncedEntitlementRepository implements EntitlementRepository {
  constructor(
    private readonly central: EntitlementRepository,
    private readonly supabase: SupabaseClient,
  ) {}

  findByTenant(tenantId: string) {
    return this.central.findByTenant(tenantId);
  }

  async setProduct(input: {
    tenantId: string;
    product: ProductCode;
    enabled: boolean;
    actorUserId: string;
  }) {
    await this.applyToClient(input.tenantId, "product", input.product, input.enabled);
    await this.central.setProduct(input);
  }

  async setModule(input: {
    tenantId: string;
    module: ModuleCode;
    enabled: boolean;
    actorUserId: string;
  }) {
    await this.applyToClient(input.tenantId, "module", input.module, input.enabled);
    await this.central.setModule(input);
  }

  private async applyToClient(
    tenantId: string,
    kind: "product" | "module",
    code: string,
    enabled: boolean,
  ) {
    const { data, error } = await this.supabase
      .from("client_databases")
      .select("slug")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ slug: string }>();
    if (error) throw error;
    if (!data) throw new DomainError("NOT_FOUND", "Banco deste cliente não encontrado.");

    await agentRequest("POST", `/clients/${data.slug}/entitlements`, { kind, code, enabled });
  }
}
