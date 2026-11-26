import { summarizeTenants } from "@/modules/tenants/domain/tenant";
import type { TenantRepository } from "@/modules/tenants/application/tenant-repository";

// Consultas liberadas para qualquer papel da equipe FrotaK; o ator ja foi validado pelo middleware.

export async function listTenants(repository: TenantRepository) {
  return repository.list();
}

export async function getDashboardSnapshot(repository: TenantRepository) {
  return summarizeTenants(await repository.list());
}
