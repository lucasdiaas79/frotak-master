import { createServerFn } from "@tanstack/react-start";
import { DomainError } from "@/core/domain/domain-error";
import { platformAuth } from "@/core/auth/platform-auth";
import { isClientDatabaseMode } from "@/core/server/agent-client";
import { runUseCase } from "@/core/server/run-use-case";
import { getSupabaseAdmin } from "@/core/server/supabase-admin";
import { isModuleCode, isProductCode } from "@/modules/catalog/domain/catalog";
import {
  changeTenantEntitlement,
  type ChangeTenantEntitlementCommand,
} from "@/modules/entitlements/application/change-tenant-entitlement";
import { ClientSyncedEntitlementRepository } from "@/modules/entitlements/infrastructure/client-synced-entitlement-repository";
import { SupabaseEntitlementRepository } from "@/modules/entitlements/infrastructure/supabase-entitlement-repository";

type ChangeEntitlementInput = {
  tenantId: string;
  kind: "product" | "module";
  code: string;
  enabled: boolean;
};

function toCommand(input: ChangeEntitlementInput): ChangeTenantEntitlementCommand {
  if (!input?.tenantId || typeof input.enabled !== "boolean") {
    throw new DomainError("INVALID_INPUT", "Pedido de liberação incompleto.");
  }
  if (input.kind === "product" && isProductCode(input.code)) {
    return { tenantId: input.tenantId, enabled: input.enabled, kind: "product", code: input.code };
  }
  if (input.kind === "module" && isModuleCode(input.code)) {
    return { tenantId: input.tenantId, enabled: input.enabled, kind: "module", code: input.code };
  }
  throw new DomainError("INVALID_INPUT", "Produto ou módulo desconhecido.");
}

export const changeTenantEntitlementFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: ChangeEntitlementInput) => toCommand(input))
  .handler(async ({ data, context }) =>
    runUseCase("entitlements.change", () => {
      const supabase = getSupabaseAdmin();
      const central = new SupabaseEntitlementRepository(supabase);
      return changeTenantEntitlement(
        isClientDatabaseMode() ? new ClientSyncedEntitlementRepository(central, supabase) : central,
        context.actor,
        data,
      );
    }),
  );
