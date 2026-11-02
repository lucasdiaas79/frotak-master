import { DomainError } from "@/core/domain/domain-error";
import {
  coreModuleOf,
  findModule,
  products as productCatalog,
  type ModuleCode,
  type ProductCode,
} from "@/modules/catalog/domain/catalog";

/** O que o Master deixou ligado para o cliente (configuracao, nao uso efetivo). */
export type TenantEntitlements = {
  products: ProductCode[];
  modules: ModuleCode[];
};

export type EntitlementChange =
  | { kind: "product"; code: ProductCode; enabled: boolean }
  | { kind: "module"; code: ModuleCode; enabled: boolean };

export function hasProduct(entitlements: TenantEntitlements, product: ProductCode) {
  return entitlements.products.includes(product);
}

export function hasModule(entitlements: TenantEntitlements, module: ModuleCode) {
  return entitlements.modules.includes(module);
}

function productName(code: ProductCode) {
  return productCatalog.find((product) => product.code === code)?.name ?? code;
}

/**
 * Ligar um produto garante o modulo base dele. Desligar nao mexe nos modulos:
 * eles ficam guardados e voltam a valer quando o produto for religado.
 */
export function planProductChange(
  current: TenantEntitlements,
  product: ProductCode,
  enabled: boolean,
): EntitlementChange[] {
  if (hasProduct(current, product) === enabled) return [];

  const changes: EntitlementChange[] = [{ kind: "product", code: product, enabled }];
  const core = coreModuleOf(product);
  if (enabled && core && !hasModule(current, core.code)) {
    changes.push({ kind: "module", code: core.code, enabled: true });
  }
  return changes;
}

/** Modulo so liga com o produto dele liberado; o modulo base nao desliga. */
export function planModuleChange(
  current: TenantEntitlements,
  module: ModuleCode,
  enabled: boolean,
): EntitlementChange[] {
  if (hasModule(current, module) === enabled) return [];

  const definition = findModule(module);

  if (!enabled && definition.core) {
    throw new DomainError(
      "RULE_VIOLATION",
      `${definition.name} é a base do ${productName(definition.product)} e não pode ser desligado. Desligue o produto inteiro, se for o caso.`,
    );
  }

  if (enabled && !hasProduct(current, definition.product)) {
    throw new DomainError(
      "RULE_VIOLATION",
      `Libere o ${productName(definition.product)} antes de ligar ${definition.name}.`,
    );
  }

  return [{ kind: "module", code: module, enabled }];
}

export function applyChanges(
  current: TenantEntitlements,
  changes: EntitlementChange[],
): TenantEntitlements {
  const productsOn = new Set<ProductCode>(current.products);
  const modulesOn = new Set<ModuleCode>(current.modules);

  for (const change of changes) {
    if (change.kind === "product") {
      if (change.enabled) productsOn.add(change.code);
      else productsOn.delete(change.code);
    } else if (change.enabled) {
      modulesOn.add(change.code);
    } else {
      modulesOn.delete(change.code);
    }
  }

  return { products: [...productsOn], modules: [...modulesOn] };
}
