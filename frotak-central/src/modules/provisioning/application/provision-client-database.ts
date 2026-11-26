import { DomainError } from "@/core/domain/domain-error";
import { assertCanOperate, type PlatformActor } from "@/core/domain/platform-actor";
import { products as productCatalog } from "@/modules/catalog/domain/catalog";
import type { EntitlementRepository } from "@/modules/entitlements/application/entitlement-repository";
import type { ProvisioningLogger } from "@/modules/provisioning/application/ports";
import type { ProvisionTenantResult } from "@/modules/provisioning/application/provision-tenant";
import {
  subscriptionEndDate,
  validateProvisioning,
  type ProvisionTenantRequest,
  type ValidatedProvisioning,
} from "@/modules/provisioning/domain/provisioning-request";

export type ClientDatabase = {
  workspaceId: string;
  databaseName: string;
  clientUrl: string;
};

/** O cadastro do cliente no Central: contrato e liberações, sem dados da operação. */
export interface ClientRegistry {
  slugExists(slug: string): Promise<boolean>;
  register(input: {
    request: ValidatedProvisioning;
    databaseName: string;
    clientUrl: string;
    actorUserId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<string>;
}

/** O banco do cliente, criado remotamente na VPS de banco, junto com o login do dono. */
export interface ClientDatabaseGateway {
  create(input: {
    request: ValidatedProvisioning;
    startsAt: Date;
    endsAt: Date;
  }): Promise<ClientDatabase>;
  remove(slug: string): Promise<void>;
}

export type ProvisionClientDatabaseDeps = {
  registry: ClientRegistry;
  databases: ClientDatabaseGateway;
  entitlements: EntitlementRepository;
  log: ProvisioningLogger;
};

/**
 * Cliente novo com banco próprio. O banco nasce primeiro e o cadastro no Central vem por último:
 * assim, criar o banco que falhe não deixa nada no Central, e o agente já desfaz o que fez. Só falta
 * desfazer o banco se o cadastro falhar.
 */
export async function provisionClientDatabase(
  deps: ProvisionClientDatabaseDeps,
  actor: PlatformActor,
  request: ProvisionTenantRequest,
): Promise<ProvisionTenantResult> {
  assertCanOperate(actor);
  const input = validateProvisioning(request);
  deps.log("validated", { tenantSlug: input.tenantSlug, modules: input.modules });

  if (await deps.registry.slugExists(input.tenantSlug)) {
    throw new DomainError("CONFLICT", "Já existe um cliente com esse nome ou endereço.");
  }

  const startsAt = new Date();
  const endsAt = subscriptionEndDate(input.subscriptionPeriod, startsAt);
  const database = await deps.databases.create({ request: input, startsAt, endsAt });
  deps.log("database-created");

  let tenantId: string;
  try {
    tenantId = await deps.registry.register({
      request: input,
      databaseName: database.databaseName,
      clientUrl: database.clientUrl,
      actorUserId: actor.userId,
      startsAt,
      endsAt,
    });
  } catch (error) {
    deps.log("rollback-database");
    await deps.databases.remove(input.tenantSlug).catch((cleanupError) => {
      deps.log("rollback-database-failed", { error: String(cleanupError) });
    });
    throw error;
  }
  deps.log("registered");

  // O banco do cliente já recebeu os produtos pedidos; aqui alinha o catálogo do Central.
  const pendingProducts: string[] = [];
  for (const product of productCatalog) {
    const wanted = input.products.includes(product.code);
    if (wanted === (product.code === "tms")) continue;
    try {
      await deps.entitlements.setProduct({
        tenantId,
        product: product.code,
        enabled: wanted,
        actorUserId: actor.userId,
      });
    } catch (error) {
      deps.log("product-adjust-failed", { product: product.code, error: String(error) });
      pendingProducts.push(product.name);
    }
  }

  return {
    tenantId,
    workspaceId: database.workspaceId,
    membershipId: "",
    ownerRoleId: "",
    ownerEmail: input.ownerEmail,
    pendingProducts,
    slug: input.tenantSlug,
    clientUrl: database.clientUrl,
  };
}
