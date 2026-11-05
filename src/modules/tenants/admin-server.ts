import { createServerFn } from "@tanstack/react-start";
import { platformAuth } from "@/core/auth/platform-auth";
import { DomainError } from "@/core/domain/domain-error";
import { isClientDatabaseMode } from "@/core/server/agent-client";
import { runUseCase } from "@/core/server/run-use-case";
import { getSupabaseAdmin } from "@/core/server/supabase-admin";
import {
  addCustomDomain,
  changeSubdomain,
  checkClientAddresses,
  getClientEnvironment,
  removeCustomDomain,
  resetClientLoginPassword,
  setClientStatus,
  updateClientProfile,
  type ClientAdminDeps,
} from "@/modules/tenants/application/client-admin";
import { SUBDOMAIN_PATTERN, type ClientProfileInput } from "@/modules/tenants/domain/client-admin";
import { AgentClientEnvironment } from "@/modules/tenants/infrastructure/agent-client-environment";
import { NodeAddressProbe } from "@/modules/tenants/infrastructure/node-address-probe";
import { SupabaseClientCatalog } from "@/modules/tenants/infrastructure/supabase-client-catalog";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function deps(): ClientAdminDeps {
  const multi = isClientDatabaseMode();
  return {
    catalog: new SupabaseClientCatalog(getSupabaseAdmin()),
    environment: multi ? new AgentClientEnvironment() : null,
    probe: multi ? new NodeAddressProbe() : null,
  };
}

function slug(value: unknown) {
  if (typeof value === "string" && SUBDOMAIN_PATTERN.test(value)) return value;
  throw new DomainError("INVALID_INPUT", "Cliente inválido.");
}

function text(value: unknown, max = 300) {
  if (typeof value === "string" && value.length <= max) return value;
  throw new DomainError("INVALID_INPUT", "Pedido inválido.");
}

/** null com banco único: o formulário de cliente novo não pede o endereço. */
export const getAddressSettingsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () =>
    runUseCase("clients.addressSettings", async () =>
      isClientDatabaseMode() ? new AgentClientEnvironment().settings() : null,
    ),
  );

export const checkSubdomainFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator((input: { subdomain: string }) => ({ subdomain: text(input.subdomain, 80) }))
  .handler(async ({ data }) =>
    runUseCase("clients.checkSubdomain", async () =>
      isClientDatabaseMode() ? new AgentClientEnvironment().checkSubdomain(data.subdomain) : null,
    ),
  );

export const getClientEnvironmentFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator((input: { slug: string }) => ({ slug: slug(input.slug) }))
  .handler(async ({ data }) =>
    runUseCase("clients.environment", () => getClientEnvironment(deps(), data.slug)),
  );

export const checkClientAddressesFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { slug: string }) => ({ slug: slug(input.slug) }))
  .handler(async ({ data }) =>
    runUseCase("clients.checkAddresses", () => checkClientAddresses(deps(), data.slug)),
  );

export const updateClientProfileFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { slug: string; profile: ClientProfileInput }) => ({
    slug: slug(input.slug),
    profile: input.profile,
  }))
  .handler(async ({ data, context }) =>
    runUseCase("clients.updateProfile", () =>
      updateClientProfile(context.actor, deps(), data.slug, data.profile),
    ),
  );

export const setClientStatusFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { slug: string; status: string }) => ({
    slug: slug(input.slug),
    status: text(input.status, 20),
  }))
  .handler(async ({ data, context }) =>
    runUseCase("clients.setStatus", () =>
      setClientStatus(context.actor, deps(), data.slug, data.status),
    ),
  );

export const changeSubdomainFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { slug: string; subdomain: string }) => ({
    slug: slug(input.slug),
    subdomain: text(input.subdomain, 80),
  }))
  .handler(async ({ data, context }) =>
    runUseCase("clients.changeSubdomain", () =>
      changeSubdomain(context.actor, deps(), data.slug, data.subdomain),
    ),
  );

export const addCustomDomainFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { slug: string; host: string }) => ({
    slug: slug(input.slug),
    host: text(input.host, 260),
  }))
  .handler(async ({ data, context }) =>
    runUseCase("clients.addDomain", () =>
      addCustomDomain(context.actor, deps(), data.slug, data.host),
    ),
  );

export const removeCustomDomainFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { slug: string; host: string }) => ({
    slug: slug(input.slug),
    host: text(input.host, 260),
  }))
  .handler(async ({ data, context }) =>
    runUseCase("clients.removeDomain", () =>
      removeCustomDomain(context.actor, deps(), data.slug, data.host),
    ),
  );

export const resetClientLoginPasswordFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { slug: string; userId: string; email: string }) => {
    if (!UUID_RE.test(String(input.userId))) {
      throw new DomainError("INVALID_INPUT", "Login inválido.");
    }
    return { slug: slug(input.slug), userId: input.userId, email: text(input.email, 320) };
  })
  .handler(async ({ data, context }) =>
    runUseCase("clients.resetLogin", () =>
      resetClientLoginPassword(context.actor, deps(), data.slug, data.userId, data.email),
    ),
  );
