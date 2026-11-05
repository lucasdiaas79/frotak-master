import { createServerFn } from "@tanstack/react-start";
import { platformAuth } from "@/core/auth/platform-auth";
import { isClientDatabaseMode } from "@/core/server/agent-client";
import { runUseCase } from "@/core/server/run-use-case";
import { getSupabaseAdmin } from "@/core/server/supabase-admin";
import { startClientAccess } from "@/modules/tenants/application/start-client-access";
import { getDashboardSnapshot, listTenants } from "@/modules/tenants/application/tenant-queries";
import { AgentClientAccessGateway } from "@/modules/tenants/infrastructure/agent-client-access-gateway";
import { loadClientData } from "@/modules/tenants/infrastructure/agent-client-data";
import { SupabaseClientAccessGateway } from "@/modules/tenants/infrastructure/supabase-client-access-gateway";
import { SupabaseTenantRepository } from "@/modules/tenants/infrastructure/supabase-tenant-repository";

function tenantRepository() {
  const supabase = getSupabaseAdmin();
  return new SupabaseTenantRepository(
    supabase,
    isClientDatabaseMode() ? () => loadClientData(supabase) : undefined,
  );
}

export const listTenantsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () => runUseCase("tenants.list", () => listTenants(tenantRepository())));

export const getDashboardSnapshotFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () =>
    runUseCase("tenants.dashboard", () => getDashboardSnapshot(tenantRepository())),
  );

export const startClientAccessFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { tenantId: string }) => input)
  .handler(async ({ data, context }) =>
    runUseCase("tenants.clientAccess", () => {
      const supabase = getSupabaseAdmin();
      return startClientAccess(
        context.actor,
        data.tenantId,
        isClientDatabaseMode()
          ? new AgentClientAccessGateway(supabase)
          : new SupabaseClientAccessGateway(supabase),
      );
    }),
  );
