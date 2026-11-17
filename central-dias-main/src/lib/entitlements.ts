import type { SupabaseClient } from "@supabase/supabase-js";

// Produtos e modulos liberados pelo FrotaK Master. Os codigos sao contrato com o
// catalogo do Master (platform_products, modules) e com o banco, que recusa
// modulos desligados com MODULE_DISABLED. Esconder no menu e so conforto: quem
// garante o bloqueio sao o banco e as server functions.

export type ModuleCode =
  | "fleet_core"
  | "financial"
  | "cte_issuance"
  | "frotak_ai"
  | "driver_app"
  | "frotak_tracking"
  | "driver_journey"
  | "driver_safety"
  | "fuel_control"
  | "delivery_routes"
  | "driver_performance";

export type WorkspaceEntitlements = {
  workspaceId: string;
  tenantStatus: string | null;
  products: string[];
  modules: string[];
  /** Banco ainda sem o catalogo do Master (migration 202610310001): tudo liberado, como antes. */
  legacy: boolean;
};

// Rotas, menu e rotulos de cada modulo ficam nos manifestos (src/modules/registry.ts).

/** Modulos da operacao com embarcador: so aparecem onde foram ligados, mesmo no banco legado. */
export const OPT_IN_MODULES: readonly ModuleCode[] = [
  "driver_journey",
  "driver_safety",
  "fuel_control",
  "delivery_routes",
  "driver_performance",
];

/** Sem informacao (falha de rede, modo local) o app nao bloqueia; o servidor decide. */
export function isModuleEnabled(entitlements: WorkspaceEntitlements | null, module: ModuleCode) {
  if (OPT_IN_MODULES.includes(module)) return !!entitlements?.modules.includes(module);
  if (!entitlements || entitlements.legacy) return true;
  return entitlements.modules.includes(module);
}

export function hasTmsAccess(entitlements: WorkspaceEntitlements | null) {
  if (!entitlements || entitlements.legacy) return true;
  return entitlements.products.includes("tms");
}

export function isTenantActive(entitlements: WorkspaceEntitlements | null) {
  if (!entitlements || entitlements.legacy || !entitlements.tenantStatus) return true;
  return entitlements.tenantStatus === "active" || entitlements.tenantStatus === "trial";
}

function isMissingCatalog(error: { code?: string; message?: string }) {
  return (
    ["42883", "PGRST202"].includes(error.code ?? "") ||
    /could not find the function|does not exist/i.test(error.message ?? "")
  );
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Funciona com o cliente do navegador, com o JWT do usuario no servidor ou com a service role. */
export async function fetchWorkspaceEntitlements(
  client: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceEntitlements> {
  const { data, error } = await client.rpc("get_workspace_entitlements", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    if (isMissingCatalog(error)) {
      // Banco legado: pergunta so pelos modulos opt-in da operacao com embarcador.
      const ops = await client.rpc("get_driver_ops_modules", { p_workspace_id: workspaceId });
      return {
        workspaceId,
        tenantStatus: null,
        products: [],
        modules: ops.error ? [] : stringList(ops.data),
        legacy: true,
      };
    }
    throw new Error(`entitlements: ${error.message}`);
  }

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    workspaceId,
    tenantStatus: typeof row.tenantStatus === "string" ? row.tenantStatus : null,
    products: stringList(row.products),
    modules: stringList(row.modules),
    legacy: false,
  };
}

export class ModuleDisabledError extends Error {
  readonly module: ModuleCode;

  constructor(module: ModuleCode) {
    super(`MODULE_DISABLED:${module}`);
    this.name = "ModuleDisabledError";
    this.module = module;
  }
}

export function isModuleDisabledError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("MODULE_DISABLED");
}

export async function assertWorkspaceModule(
  client: SupabaseClient,
  workspaceId: string,
  module: ModuleCode,
) {
  const entitlements = await fetchWorkspaceEntitlements(client, workspaceId);
  if (!isModuleEnabled(entitlements, module)) throw new ModuleDisabledError(module);
}
