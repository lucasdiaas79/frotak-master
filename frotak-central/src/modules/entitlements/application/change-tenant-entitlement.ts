import { DomainError } from "@/core/domain/domain-error";
import { assertCanOperate, type PlatformActor } from "@/core/domain/platform-actor";
import {
  applyChanges,
  planModuleChange,
  planProductChange,
  type EntitlementChange,
  type TenantEntitlements,
} from "@/modules/entitlements/domain/entitlements";
import type { EntitlementRepository } from "@/modules/entitlements/application/entitlement-repository";
import type { ModuleCode, ProductCode } from "@/modules/catalog/domain/catalog";

export type ChangeTenantEntitlementCommand = {
  tenantId: string;
  enabled: boolean;
} & ({ kind: "product"; code: ProductCode } | { kind: "module"; code: ModuleCode });

/**
 * Liga ou desliga um produto ou modulo para um cliente. As regras ficam no dominio;
 * aqui so se carrega o estado atual, se planeja a mudanca e se grava passo a passo.
 * Vale na hora: o app cliente le o catalogo a cada carregamento, sem deploy.
 */
export async function changeTenantEntitlement(
  repository: EntitlementRepository,
  actor: PlatformActor,
  command: ChangeTenantEntitlementCommand,
): Promise<TenantEntitlements> {
  assertCanOperate(actor);

  const current = await repository.findByTenant(command.tenantId);
  if (!current) {
    throw new DomainError("NOT_FOUND", "Cliente não encontrado.");
  }

  const changes: EntitlementChange[] =
    command.kind === "product"
      ? planProductChange(current, command.code, command.enabled)
      : planModuleChange(current, command.code, command.enabled);

  for (const change of changes) {
    if (change.kind === "product") {
      await repository.setProduct({
        tenantId: command.tenantId,
        product: change.code,
        enabled: change.enabled,
        actorUserId: actor.userId,
      });
    } else {
      await repository.setModule({
        tenantId: command.tenantId,
        module: change.code,
        enabled: change.enabled,
        actorUserId: actor.userId,
      });
    }
  }

  return applyChanges(current, changes);
}
