import { DomainError } from "@/core/domain/domain-error";
import { assertCanOperate, type PlatformActor } from "@/core/domain/platform-actor";
import {
  isClientStatus,
  normalizeDomain,
  validateClientProfile,
  validateSubdomain,
  type AddressSettings,
  type AddressStatus,
  type ClientAddresses,
  type ClientProfileInput,
  type ClientResources,
  type ClientStatusValue,
  type SubdomainCheck,
} from "@/modules/tenants/domain/client-admin";

export type ClientLocation = { tenantId: string; slug: string; status: string };

/** Cadastro no Central (com banco único, o próprio banco). */
export interface ClientCatalog {
  locate(slug: string): Promise<ClientLocation | null>;
  updateProfile(tenantId: string, profile: ClientProfileInput, actorUserId: string): Promise<void>;
  setStatus(tenantId: string, status: ClientStatusValue, actorUserId: string): Promise<void>;
  setAddresses(tenantId: string, addresses: ClientAddresses, actorUserId: string): Promise<void>;
  recordLoginReset(actor: PlatformActor, tenantId: string, email: string): Promise<void>;
}

/** O ambiente do cliente na VPS de banco, pelo agente. Só existe no modo banco por cliente. */
export interface ClientEnvironment {
  settings(): Promise<AddressSettings>;
  checkSubdomain(subdomain: string): Promise<SubdomainCheck>;
  resources(slug: string): Promise<ClientResources>;
  addresses(slug: string): Promise<ClientAddresses>;
  setSubdomain(slug: string, subdomain: string): Promise<ClientAddresses>;
  addDomain(slug: string, host: string): Promise<ClientAddresses>;
  removeDomain(slug: string, host: string): Promise<ClientAddresses>;
  updateProfile(slug: string, profile: ClientProfileInput): Promise<void>;
  setStatus(slug: string, status: ClientStatusValue): Promise<void>;
  resetLoginPassword(
    slug: string,
    userId: string,
  ): Promise<{ email: string; temporaryPassword: string }>;
}

/** DNS, HTTPS e resposta do TMS, vistos do servidor que atende os endereços. */
export interface AddressProbe {
  check(host: string, kind: AddressStatus["kind"], expectedIp: string): Promise<AddressStatus>;
}

export type ClientAdminDeps = {
  catalog: ClientCatalog;
  /** null com banco único: endereço e ambiente ficam indisponíveis. */
  environment: ClientEnvironment | null;
  probe: AddressProbe | null;
};

async function locate(deps: ClientAdminDeps, slug: string) {
  const location = await deps.catalog.locate(slug);
  if (!location) throw new DomainError("NOT_FOUND", "Cliente não encontrado.");
  return location;
}

function requireEnvironment(deps: ClientAdminDeps) {
  if (!deps.environment) {
    throw new DomainError(
      "UNAVAILABLE",
      "Endereços e ambiente do cliente existem só com banco por cliente, nas VPS.",
    );
  }
  return deps.environment;
}

export async function getClientEnvironment(deps: ClientAdminDeps, slug: string) {
  await locate(deps, slug);
  if (!deps.environment) return null;
  return deps.environment.resources(slug);
}

/** O banco do cliente primeiro, onde o nome aparece para os usuários; depois o Central. */
export async function updateClientProfile(
  actor: PlatformActor,
  deps: ClientAdminDeps,
  slug: string,
  input: ClientProfileInput,
) {
  assertCanOperate(actor);
  const profile = validateClientProfile(input);
  const location = await locate(deps, slug);
  if (deps.environment) await deps.environment.updateProfile(slug, profile);
  await deps.catalog.updateProfile(location.tenantId, profile, actor.userId);
  return profile;
}

export async function setClientStatus(
  actor: PlatformActor,
  deps: ClientAdminDeps,
  slug: string,
  status: unknown,
) {
  assertCanOperate(actor);
  if (!isClientStatus(status)) throw new DomainError("INVALID_INPUT", "Situação inválida.");
  const location = await locate(deps, slug);
  if (deps.environment) await deps.environment.setStatus(slug, status);
  await deps.catalog.setStatus(location.tenantId, status, actor.userId);
  return status;
}

/** O agente decide o roteamento; o Central guarda o cadastro dos endereços. */
async function saveAddresses(
  actor: PlatformActor,
  deps: ClientAdminDeps,
  location: ClientLocation,
  addresses: ClientAddresses,
) {
  await deps.catalog.setAddresses(location.tenantId, addresses, actor.userId);
  return addresses;
}

export async function changeSubdomain(
  actor: PlatformActor,
  deps: ClientAdminDeps,
  slug: string,
  value: string,
) {
  assertCanOperate(actor);
  const environment = requireEnvironment(deps);
  const subdomain = validateSubdomain(value);
  const location = await locate(deps, slug);
  return saveAddresses(actor, deps, location, await environment.setSubdomain(slug, subdomain));
}

export async function addCustomDomain(
  actor: PlatformActor,
  deps: ClientAdminDeps,
  slug: string,
  value: string,
) {
  assertCanOperate(actor);
  const environment = requireEnvironment(deps);
  const host = normalizeDomain(value);
  const location = await locate(deps, slug);
  return saveAddresses(actor, deps, location, await environment.addDomain(slug, host));
}

export async function removeCustomDomain(
  actor: PlatformActor,
  deps: ClientAdminDeps,
  slug: string,
  value: string,
) {
  assertCanOperate(actor);
  const environment = requireEnvironment(deps);
  const host = normalizeDomain(value);
  const location = await locate(deps, slug);
  return saveAddresses(actor, deps, location, await environment.removeDomain(slug, host));
}

/** Confere cada endereço do cliente. A primeira visita também emite o HTTPS. */
export async function checkClientAddresses(deps: ClientAdminDeps, slug: string) {
  const environment = requireEnvironment(deps);
  await locate(deps, slug);
  const addresses = await environment.addresses(slug);
  if (!deps.probe) return [];
  const probe = deps.probe;
  return Promise.all([
    probe.check(addresses.primaryHost, "subdomain", addresses.serviceIp),
    ...addresses.domains.map((domain) => probe.check(domain.host, "custom", addresses.serviceIp)),
  ]);
}

/** A auditoria vem antes: sem registro, a senha não é trocada nem sai do servidor. */
export async function resetClientLoginPassword(
  actor: PlatformActor,
  deps: ClientAdminDeps,
  slug: string,
  userId: string,
  email: string,
) {
  assertCanOperate(actor);
  const environment = requireEnvironment(deps);
  const location = await locate(deps, slug);
  await deps.catalog.recordLoginReset(actor, location.tenantId, email);
  return environment.resetLoginPassword(slug, userId);
}
