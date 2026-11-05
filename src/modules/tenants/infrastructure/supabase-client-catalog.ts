import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/core/domain/domain-error";
import type { PlatformActor } from "@/core/domain/platform-actor";
import type { ClientCatalog, ClientLocation } from "@/modules/tenants/application/client-admin";
import type {
  ClientAddresses,
  ClientProfileInput,
  ClientStatusValue,
} from "@/modules/tenants/domain/client-admin";

function translate(error: { message?: string; code?: string }): never {
  const message = error.message ?? "";
  if (/CNPJ_INVALID/.test(message)) throw new DomainError("INVALID_INPUT", "CNPJ inválido.");
  if (/LEGAL_NAME_REQUIRED/.test(message)) {
    throw new DomainError("INVALID_INPUT", "Informe a razão social.");
  }
  if (/MAX_VEHICLES_INVALID/.test(message)) {
    throw new DomainError("INVALID_INPUT", "Limite de veículos inválido.");
  }
  if (/ACTOR_FORBIDDEN/.test(message)) {
    throw new DomainError("FORBIDDEN", "Seu papel no Master não permite esta alteração.");
  }
  if (/client_databases_subdomain_uidx/.test(message)) {
    throw new DomainError("CONFLICT", "Este endereço já é usado por outro cliente.");
  }
  if (/function .* does not exist|Could not find the function/i.test(message)) {
    throw new DomainError(
      "UNAVAILABLE",
      "O banco ainda não tem a migration 202611050004. Aplique as migrations e tente de novo.",
    );
  }
  throw new Error(message || "Falha no cadastro do cliente.");
}

export class SupabaseClientCatalog implements ClientCatalog {
  constructor(private readonly supabase: SupabaseClient) {}

  async locate(slug: string): Promise<ClientLocation | null> {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id, slug, status")
      .eq("slug", slug)
      .maybeSingle<{ id: string; slug: string; status: string }>();
    if (error) throw error;
    return data ? { tenantId: data.id, slug: data.slug, status: data.status } : null;
  }

  async updateProfile(tenantId: string, profile: ClientProfileInput, actorUserId: string) {
    const { error } = await this.supabase.rpc("master_update_client_profile", {
      p_tenant_id: tenantId,
      p_legal_name: profile.legalName,
      p_trade_name: profile.tradeName || null,
      p_cnpj: profile.cnpj,
      p_max_vehicles: profile.maxVehicles,
      p_actor_user_id: actorUserId,
    });
    if (error) translate(error);
  }

  async setStatus(tenantId: string, status: ClientStatusValue, actorUserId: string) {
    const { error } = await this.supabase.rpc("master_set_client_status", {
      p_tenant_id: tenantId,
      p_status: status,
      p_actor_user_id: actorUserId,
    });
    if (error) translate(error);
  }

  async setAddresses(tenantId: string, addresses: ClientAddresses, actorUserId: string) {
    const { error } = await this.supabase.rpc("master_set_client_addresses", {
      p_tenant_id: tenantId,
      p_subdomain: addresses.subdomain,
      p_client_url: addresses.clientUrl,
      p_custom_domains: addresses.domains.map((domain) => domain.host),
      p_actor_user_id: actorUserId,
    });
    if (error) translate(error);
  }

  async recordLoginReset(actor: PlatformActor, tenantId: string, email: string) {
    const { error } = await this.supabase.from("audit_logs").insert({
      actor_user_id: actor.userId,
      tenant_id: tenantId,
      action: "master.client_login_password_reset",
      entity_type: "tenant",
      entity_id: tenantId,
      metadata: { target_email: email, actor_email: actor.email, actor_role: actor.role },
    });
    if (error) throw new Error(error.message);
  }
}
