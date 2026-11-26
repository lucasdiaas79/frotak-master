import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/core/domain/domain-error";
import {
  isModuleCode,
  isProductCode,
  type ModuleCode,
  type ProductCode,
} from "@/modules/catalog/domain/catalog";
import type { TenantEntitlements } from "@/modules/entitlements/domain/entitlements";
import type { EntitlementRepository } from "@/modules/entitlements/application/entitlement-repository";

type CodeRelation = { code: string } | Array<{ code: string }> | null;

type WorkspaceRow = { id: string; tenant_id: string; is_default: boolean };
type WorkspaceModuleRow = {
  workspace_id: string;
  enabled: boolean;
  expires_at: string | null;
  modules: CodeRelation;
};
type TenantProductRow = {
  tenant_id: string;
  enabled: boolean;
  ends_at: string | null;
  platform_products: CodeRelation;
};

const MIGRATION_HINT =
  "Catálogo de produtos indisponível. Aplique a migration 202610310001_master_product_module_entitlements no banco.";

function relationCode(value: CodeRelation) {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.code ?? null;
}

function stillValid(until: string | null) {
  return !until || new Date(until).getTime() > Date.now();
}

/** Tabela/funcao da migration 202610310001 ainda nao existe no banco conectado. */
export function isMissingCatalogSchema(error: Pick<PostgrestError, "code" | "message"> | null) {
  if (!error) return false;
  return (
    ["42P01", "42883", "PGRST200", "PGRST202", "PGRST205"].includes(error.code) ||
    /does not exist|could not find/i.test(error.message)
  );
}

/**
 * Le as liberacoes de varios clientes de uma vez. O estado dos modulos vem do workspace
 * padrao do cliente; o Master grava o mesmo valor em todos os workspaces dele.
 */
export async function loadTenantEntitlements(
  supabase: SupabaseClient,
  tenantIds: string[],
): Promise<Map<string, TenantEntitlements>> {
  const result = new Map<string, TenantEntitlements>(
    tenantIds.map((tenantId) => [tenantId, { products: [], modules: [] }]),
  );
  if (!tenantIds.length) return result;

  const { data: workspaces, error: workspacesError } = await supabase
    .from("workspaces")
    .select("id, tenant_id, is_default")
    .in("tenant_id", tenantIds)
    .neq("status", "archived");
  if (workspacesError) throw workspacesError;

  const workspaceByTenant = new Map<string, WorkspaceRow>();
  for (const workspace of (workspaces ?? []) as WorkspaceRow[]) {
    const current = workspaceByTenant.get(workspace.tenant_id);
    if (!current || workspace.is_default) workspaceByTenant.set(workspace.tenant_id, workspace);
  }
  const tenantByWorkspace = new Map(
    [...workspaceByTenant.values()].map((workspace) => [workspace.id, workspace.tenant_id]),
  );

  const [modulesResult, productsResult] = await Promise.all([
    tenantByWorkspace.size
      ? supabase
          .from("workspace_modules")
          .select("workspace_id, enabled, expires_at, modules(code)")
          .in("workspace_id", [...tenantByWorkspace.keys()])
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("tenant_platform_products")
      .select("tenant_id, enabled, ends_at, platform_products(code)")
      .in("tenant_id", tenantIds),
  ]);

  if (modulesResult.error) throw modulesResult.error;

  for (const row of (modulesResult.data ?? []) as WorkspaceModuleRow[]) {
    const code = relationCode(row.modules);
    const tenantId = tenantByWorkspace.get(row.workspace_id);
    if (!tenantId || !code || !isModuleCode(code) || !row.enabled || !stillValid(row.expires_at)) {
      continue;
    }
    result.get(tenantId)?.modules.push(code);
  }

  if (productsResult.error) {
    if (!isMissingCatalogSchema(productsResult.error)) throw productsResult.error;
    // Banco sem a migration: todo cliente existente e cliente do TMS.
    result.forEach((entitlements) => entitlements.products.push("tms"));
    return result;
  }

  for (const row of (productsResult.data ?? []) as TenantProductRow[]) {
    const code = relationCode(row.platform_products);
    if (!code || !isProductCode(code) || !row.enabled || !stillValid(row.ends_at)) continue;
    result.get(row.tenant_id)?.products.push(code);
  }

  return result;
}

function translateRpcError(error: PostgrestError): never {
  if (isMissingCatalogSchema(error)) throw new DomainError("UNAVAILABLE", MIGRATION_HINT);
  if (error.message.includes("ACTOR_FORBIDDEN")) {
    throw new DomainError("FORBIDDEN", "Seu papel no Master não permite alterar liberações.");
  }
  if (error.message.includes("CORE_MODULE_REQUIRED")) {
    throw new DomainError("RULE_VIOLATION", "O módulo base do produto não pode ser desligado.");
  }
  if (error.message.includes("TENANT_HAS_NO_WORKSPACE")) {
    throw new DomainError("RULE_VIOLATION", "Este cliente ainda não tem workspace provisionado.");
  }
  if (error.message.includes("TENANT_NOT_FOUND")) {
    throw new DomainError("NOT_FOUND", "Cliente não encontrado.");
  }
  throw error;
}

export class SupabaseEntitlementRepository implements EntitlementRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByTenant(tenantId: string) {
    const { data: tenant, error } = await this.supabase
      .from("tenants")
      .select("id")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) return null;

    const entitlements = await loadTenantEntitlements(this.supabase, [tenantId]);
    return entitlements.get(tenantId) ?? null;
  }

  async setProduct(input: {
    tenantId: string;
    product: ProductCode;
    enabled: boolean;
    actorUserId: string;
  }) {
    const { error } = await this.supabase.rpc("master_set_tenant_product", {
      p_tenant_id: input.tenantId,
      p_product_code: input.product,
      p_enabled: input.enabled,
      p_actor_user_id: input.actorUserId,
    });
    if (error) translateRpcError(error);
  }

  async setModule(input: {
    tenantId: string;
    module: ModuleCode;
    enabled: boolean;
    actorUserId: string;
  }) {
    const { error } = await this.supabase.rpc("master_set_tenant_module", {
      p_tenant_id: input.tenantId,
      p_module_code: input.module,
      p_enabled: input.enabled,
      p_actor_user_id: input.actorUserId,
    });
    if (error) translateRpcError(error);
  }
}
