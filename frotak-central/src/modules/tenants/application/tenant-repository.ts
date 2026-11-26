import type { Tenant } from "@/modules/tenants/domain/tenant";

export interface TenantRepository {
  list(): Promise<Tenant[]>;
}
