import { createServerFn } from "@tanstack/react-start";
import { platformAuth } from "@/core/auth/platform-auth";
import { runUseCase } from "@/core/server/run-use-case";
import { getSupabaseAdmin } from "@/core/server/supabase-admin";
import { getDashboardSnapshot, listTenants } from "@/modules/tenants/application/tenant-queries";
import { SupabaseTenantRepository } from "@/modules/tenants/infrastructure/supabase-tenant-repository";

export const listTenantsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () =>
    runUseCase("tenants.list", () => listTenants(new SupabaseTenantRepository(getSupabaseAdmin()))),
  );

export const getDashboardSnapshotFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () =>
    runUseCase("tenants.dashboard", () =>
      getDashboardSnapshot(new SupabaseTenantRepository(getSupabaseAdmin())),
    ),
  );
