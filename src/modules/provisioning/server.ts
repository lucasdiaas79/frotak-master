import { createServerFn } from "@tanstack/react-start";
import { platformAuth } from "@/core/auth/platform-auth";
import { runUseCase } from "@/core/server/run-use-case";
import { getSupabaseAdmin } from "@/core/server/supabase-admin";
import { SupabaseEntitlementRepository } from "@/modules/entitlements/infrastructure/supabase-entitlement-repository";
import { provisionTenant } from "@/modules/provisioning/application/provision-tenant";
import type { ProvisionTenantRequest } from "@/modules/provisioning/domain/provisioning-request";
import { SupabaseIdentityGateway } from "@/modules/provisioning/infrastructure/supabase-identity-gateway";
import { SupabaseTenantProvisioner } from "@/modules/provisioning/infrastructure/supabase-tenant-provisioner";

export const provisionTenantFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: ProvisionTenantRequest) => input)
  .handler(async ({ data, context }) =>
    runUseCase("provisioning.create", () => {
      const supabase = getSupabaseAdmin();
      return provisionTenant(
        {
          identity: new SupabaseIdentityGateway(supabase),
          provisioner: new SupabaseTenantProvisioner(supabase),
          entitlements: new SupabaseEntitlementRepository(supabase),
          // Sem e-mail, senha ou CNPJ no log: so etapa e codigos.
          log: (stage, details) =>
            console.info("[provisionTenant]", JSON.stringify({ stage, ...details })),
        },
        context.actor,
        data,
      );
    }),
  );
