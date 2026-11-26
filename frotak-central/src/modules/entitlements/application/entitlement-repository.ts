import type { ModuleCode, ProductCode } from "@/modules/catalog/domain/catalog";
import type { TenantEntitlements } from "@/modules/entitlements/domain/entitlements";

/** Porta de persistencia das liberacoes. Cada escrita e auditada pelo adaptador. */
export interface EntitlementRepository {
  findByTenant(tenantId: string): Promise<TenantEntitlements | null>;
  setProduct(input: {
    tenantId: string;
    product: ProductCode;
    enabled: boolean;
    actorUserId: string;
  }): Promise<void>;
  setModule(input: {
    tenantId: string;
    module: ModuleCode;
    enabled: boolean;
    actorUserId: string;
  }): Promise<void>;
}
