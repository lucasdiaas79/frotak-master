import { DomainError } from "@/core/domain/domain-error";
import { assertCanOperate, type PlatformActor } from "@/core/domain/platform-actor";
import { products as productCatalog } from "@/modules/catalog/domain/catalog";
import type { EntitlementRepository } from "@/modules/entitlements/application/entitlement-repository";
import {
  subscriptionEndDate,
  validateProvisioning,
  type ProvisionTenantRequest,
} from "@/modules/provisioning/domain/provisioning-request";
import type {
  IdentityGateway,
  ProvisionedTenant,
  ProvisioningLogger,
  TenantProvisioner,
} from "@/modules/provisioning/application/ports";

export type ProvisionTenantDeps = {
  identity: IdentityGateway;
  provisioner: TenantProvisioner;
  entitlements: EntitlementRepository;
  log: ProvisioningLogger;
};

export type ProvisionTenantResult = ProvisionedTenant & {
  ownerEmail: string;
  /** Produtos que nao puderam ser ajustados depois da criacao; o operador revisa no painel. */
  pendingProducts: string[];
};

/**
 * Cliente novo: valida, cria o login do administrador, cria o cliente no banco e,
 * se a criacao falhar, apaga o login para nao sobrar nada pela metade.
 * O banco libera o TMS por padrao; os demais produtos sao ajustados no fim.
 */
export async function provisionTenant(
  deps: ProvisionTenantDeps,
  actor: PlatformActor,
  request: ProvisionTenantRequest,
): Promise<ProvisionTenantResult> {
  assertCanOperate(actor);
  const input = validateProvisioning(request);
  deps.log("validated", {
    tenantSlug: input.tenantSlug,
    products: input.products,
    modules: input.modules,
  });

  if (await deps.identity.emailExists(input.ownerEmail)) {
    throw new DomainError("CONFLICT", "Este e-mail já está cadastrado.");
  }

  const ownerUserId = await deps.identity.createOwner({
    email: input.ownerEmail,
    password: input.temporaryPassword,
    fullName: input.ownerName,
  });
  deps.log("owner-created");

  let provisioned: ProvisionedTenant;
  try {
    const startsAt = new Date();
    provisioned = await deps.provisioner.provision({
      request: input,
      ownerUserId,
      actorUserId: actor.userId,
      startsAt,
      endsAt: subscriptionEndDate(input.subscriptionPeriod, startsAt),
    });
  } catch (error) {
    deps.log("rollback-owner");
    await deps.identity.deleteUser(ownerUserId).catch((cleanupError) => {
      deps.log("rollback-owner-failed", { error: String(cleanupError) });
    });
    throw error;
  }
  deps.log("tenant-created");

  const pendingProducts: string[] = [];
  for (const product of productCatalog) {
    const wanted = input.products.includes(product.code);
    // O banco ja nasce com o TMS liberado; so mexe no que difere do padrao.
    if (wanted === (product.code === "tms")) continue;
    try {
      await deps.entitlements.setProduct({
        tenantId: provisioned.tenantId,
        product: product.code,
        enabled: wanted,
        actorUserId: actor.userId,
      });
    } catch (error) {
      deps.log("product-adjust-failed", { product: product.code, error: String(error) });
      pendingProducts.push(product.name);
    }
  }

  return { ...provisioned, ownerEmail: input.ownerEmail, pendingProducts };
}
