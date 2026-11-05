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
  tenantId: string;
  workspaceId: string;
  clientUrl: string;
};

/** O cadastro do cliente no Central: contrato e liberações, sem dados da operação. */
export interface ClientRegistry {
  register(input: {
    request: ValidatedProvisioning;
    databaseName: string;
    actorUserId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<string>;
  activate(tenantId: string, clientUrl: string, actorUserId: string): Promise<void>;
  discard(tenantId: string, actorUserId: string): Promise<void>;
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

export function databaseNameFor(slug: string) {
  return `frotak_${slug.replace(/-/g, "_")}`;
}

/**
 * Cliente novo com banco próprio: registra no Central, cria o banco e só então ativa. Se algo
 * falhar, desfaz o que já foi feito para não sobrar cliente pela metade.
 */
export async function provisionClientDatabase(
  deps: ProvisionClientDatabaseDeps,
  actor: PlatformActor,
  request: ProvisionTenantRequest,
): Promise<ProvisionTenantResult> {
  assertCanOperate(actor);
  const input = validateProvisioning(request);
  deps.log("validated", { tenantSlug: input.tenantSlug, modules: input.modules });

  const startsAt = new Date();
  const endsAt = subscriptionEndDate(input.subscriptionPeriod, startsAt);
  const tenantId = await deps.registry.register({
    request: input,
    databaseName: databaseNameFor(input.tenantSlug),
    actorUserId: actor.userId,
    startsAt,
    endsAt,
  });
  deps.log("registered");

  let database: ClientDatabase;
  try {
    database = await deps.databases.create({ request: input, startsAt, endsAt });
  } catch (error) {
    deps.log("rollback-registry");
    await deps.registry.discard(tenantId, actor.userId).catch((cleanupError) => {
      deps.log("rollback-registry-failed", { error: String(cleanupError) });
    });
    throw error;
  }
  deps.log("database-created");

  try {
    await deps.registry.activate(tenantId, database.clientUrl, actor.userId);
  } catch (error) {
    deps.log("rollback-database");
    await deps.databases.remove(input.tenantSlug).catch((cleanupError) => {
      deps.log("rollback-database-failed", { error: String(cleanupError) });
    });
    await deps.registry.discard(tenantId, actor.userId).catch(() => undefined);
    throw error;
  }

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
  };
}
