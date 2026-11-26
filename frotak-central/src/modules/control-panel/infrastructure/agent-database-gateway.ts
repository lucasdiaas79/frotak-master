import { agentRequest } from "@/core/server/agent-client";
import type { DatabaseGateway } from "@/modules/control-panel/application/ports";
import type {
  ClientHealth,
  DatabaseServer,
  ScheduledJob,
  TableDetail,
  TableList,
  TableRows,
} from "@/modules/control-panel/domain/control-panel";

const segment = encodeURIComponent;

/** O agente é o único com acesso de administrador ao Postgres; o painel só lê por ele. */
export class AgentDatabaseGateway implements DatabaseGateway {
  server() {
    return agentRequest<DatabaseServer>("GET", "/panel/databases");
  }

  tables(database: string) {
    return agentRequest<TableList>("GET", `/panel/databases/${segment(database)}/tables`);
  }

  table(database: string, schema: string, table: string) {
    return agentRequest<TableDetail>(
      "GET",
      `/panel/databases/${segment(database)}/tables/${segment(schema)}/${segment(table)}`,
    );
  }

  rows(database: string, schema: string, table: string, limit: number, offset: number) {
    return agentRequest<TableRows>(
      "GET",
      `/panel/databases/${segment(database)}/tables/${segment(schema)}/${segment(table)}/rows?limit=${limit}&offset=${offset}`,
    );
  }

  async jobs() {
    const { jobs } = await agentRequest<{ jobs: ScheduledJob[] }>("GET", "/panel/jobs");
    return jobs;
  }

  async clientProbes() {
    const { clients } = await agentRequest<{
      clients: Omit<ClientHealth, "name" | "tenantStatus" | "clientUrl">[];
    }>("GET", "/panel/clients");
    return clients;
  }
}
