import { agentRequest } from "@/core/server/agent-client";
import type {
  ClientDatabase,
  ClientDatabaseGateway,
} from "@/modules/provisioning/application/provision-client-database";
import type { ValidatedProvisioning } from "@/modules/provisioning/domain/provisioning-request";

export class AgentClientDatabaseGateway implements ClientDatabaseGateway {
  async create(input: {
    request: ValidatedProvisioning;
    startsAt: Date;
    endsAt: Date;
  }): Promise<ClientDatabase> {
    const { request } = input;
    return agentRequest<ClientDatabase>("POST", "/clients", {
      slug: request.tenantSlug,
      legalName: request.legalName,
      tradeName: request.tradeName,
      cnpj: request.cnpj,
      ownerName: request.ownerName,
      ownerEmail: request.ownerEmail,
      ownerPassword: request.temporaryPassword,
      workspaceName: request.workspaceName,
      planCode: request.planCode,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
      subscriptionPeriod: request.subscriptionPeriod,
      maxVehicles: request.maxVehicles,
      modules: request.modules,
      products: request.products,
    });
  }

  async remove(slug: string) {
    await agentRequest("DELETE", `/clients/${slug}`, { confirm: slug });
  }
}
