import { agentRequest } from "@/core/server/agent-client";
import type { ClientEnvironment } from "@/modules/tenants/application/client-admin";
import type {
  AddressSettings,
  ClientAddresses,
  ClientProfileInput,
  ClientResources,
  ClientStatusValue,
  SubdomainCheck,
} from "@/modules/tenants/domain/client-admin";

const segment = encodeURIComponent;

export class AgentClientEnvironment implements ClientEnvironment {
  async settings(): Promise<AddressSettings> {
    // Um nome que nunca é válido devolve só o domínio base e o IP do servidor.
    const check = await this.checkSubdomain("-");
    return { baseDomain: check.baseDomain, serviceIp: check.serviceIp };
  }

  checkSubdomain(subdomain: string) {
    return agentRequest<SubdomainCheck>("GET", `/addresses/check?subdomain=${segment(subdomain)}`);
  }

  resources(slug: string) {
    return agentRequest<ClientResources>("GET", `/clients/${segment(slug)}/resources`);
  }

  addresses(slug: string) {
    return agentRequest<ClientAddresses>("GET", `/clients/${segment(slug)}/addresses`);
  }

  setSubdomain(slug: string, subdomain: string) {
    return agentRequest<ClientAddresses>("POST", `/clients/${segment(slug)}/subdomain`, {
      subdomain,
    });
  }

  addDomain(slug: string, host: string) {
    return agentRequest<ClientAddresses>("POST", `/clients/${segment(slug)}/domains`, { host });
  }

  removeDomain(slug: string, host: string) {
    return agentRequest<ClientAddresses>("DELETE", `/clients/${segment(slug)}/domains`, { host });
  }

  async updateProfile(slug: string, profile: ClientProfileInput) {
    await agentRequest("POST", `/clients/${segment(slug)}/profile`, profile);
  }

  async setStatus(slug: string, status: ClientStatusValue) {
    await agentRequest("POST", `/clients/${segment(slug)}/status`, { status });
  }

  resetLoginPassword(slug: string, userId: string) {
    return agentRequest<{ email: string; temporaryPassword: string }>(
      "POST",
      `/clients/${segment(slug)}/login-password`,
      { userId },
    );
  }
}
