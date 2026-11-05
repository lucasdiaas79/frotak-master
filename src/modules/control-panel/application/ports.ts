import type { PlatformActor } from "@/core/domain/platform-actor";
import type {
  ClientHealth,
  ContainerMetricPoint,
  DatabaseServer,
  HealEvent,
  HostResult,
  HostRole,
  MetricPoint,
  MetricSeries,
  ScheduledJob,
  TableDetail,
  TableList,
  TableRows,
  TeamAction,
} from "@/modules/control-panel/domain/control-panel";

export type TargetKind = "container" | "service";

/** Sentinelas das VPS: máquina, serviços, containers e auto-heal. */
export interface HostGateway {
  isConfigured(): boolean;
  hosts(): Promise<HostResult[]>;
  hostMetrics(role: HostRole, hours: number): Promise<MetricSeries<MetricPoint>>;
  containerMetrics(
    role: HostRole,
    name: string,
    hours: number,
  ): Promise<MetricSeries<ContainerMetricPoint>>;
  logs(role: HostRole, kind: TargetKind, name: string, lines: number): Promise<string[]>;
  events(role: HostRole, limit: number): Promise<HealEvent[]>;
  restart(role: HostRole, kind: TargetKind, name: string, actorEmail: string): Promise<void>;
  setHeal(role: HostRole, enabled: boolean, actorEmail: string): Promise<void>;
}

/** Agente da VPS de banco: bancos, tabelas e agendamentos, sempre em leitura. */
export interface DatabaseGateway {
  server(): Promise<DatabaseServer>;
  tables(database: string): Promise<TableList>;
  table(database: string, schema: string, table: string): Promise<TableDetail>;
  rows(
    database: string,
    schema: string,
    table: string,
    limit: number,
    offset: number,
  ): Promise<TableRows>;
  jobs(): Promise<ScheduledJob[]>;
  clientProbes(): Promise<Omit<ClientHealth, "name" | "tenantStatus" | "clientUrl">[]>;
}

export type DirectoryEntry = {
  slug: string;
  name: string;
  tenantStatus: string | null;
  clientUrl: string | null;
};

export interface ClientDirectory {
  list(): Promise<DirectoryEntry[]>;
}

export interface ActionAudit {
  record(actor: PlatformActor, action: string, metadata: Record<string, unknown>): Promise<void>;
  recent(limit: number): Promise<TeamAction[]>;
}
