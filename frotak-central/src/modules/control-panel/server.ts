import { createServerFn } from "@tanstack/react-start";
import { platformAuth } from "@/core/auth/platform-auth";
import { DomainError } from "@/core/domain/domain-error";
import { runUseCase } from "@/core/server/run-use-case";
import { getSupabaseAdmin } from "@/core/server/supabase-admin";
import type { TargetKind } from "@/modules/control-panel/application/ports";
import {
  assertConfigured,
  listClientHealth,
  listEvents,
  readLogs,
  readTableRows,
  restartTarget,
  setAutoHeal,
} from "@/modules/control-panel/application/control-panel-service";
import type { HostRole } from "@/modules/control-panel/domain/control-panel";
import { AgentDatabaseGateway } from "@/modules/control-panel/infrastructure/agent-database-gateway";
import { SentinelHostGateway } from "@/modules/control-panel/infrastructure/sentinel-host-gateway";
import {
  SupabaseActionAudit,
  SupabaseClientDirectory,
} from "@/modules/control-panel/infrastructure/supabase-control-panel-records";

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,120}$/;
const DATABASE_RE = /^[a-z][a-z0-9_]{0,62}$/;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_$]{0,62}$/;

function deps() {
  const supabase = getSupabaseAdmin();
  const hosts = new SentinelHostGateway();
  assertConfigured(hosts);
  return {
    hosts,
    databases: new AgentDatabaseGateway(),
    directory: new SupabaseClientDirectory(supabase),
    audit: new SupabaseActionAudit(supabase),
  };
}

function invalid(): never {
  throw new DomainError("INVALID_INPUT", "Pedido inválido.");
}

function role(value: unknown): HostRole {
  return value === "db" || value === "service" ? value : invalid();
}

function kind(value: unknown): TargetKind {
  return value === "container" || value === "service" ? value : invalid();
}

function name(value: unknown) {
  return typeof value === "string" && NAME_RE.test(value) ? value : invalid();
}

function database(value: unknown) {
  return typeof value === "string" && DATABASE_RE.test(value) ? value : invalid();
}

function identifier(value: unknown) {
  return typeof value === "string" && IDENTIFIER_RE.test(value) ? value : invalid();
}

function bounded(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : invalid();
}

export const getHostsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () => runUseCase("panel.hosts", () => deps().hosts.hosts()));

export const getHostMetricsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator((input: { role: HostRole; hours: number }) => ({
    role: role(input.role),
    hours: bounded(input.hours, 1, 168),
  }))
  .handler(async ({ data }) =>
    runUseCase("panel.hostMetrics", () => deps().hosts.hostMetrics(data.role, data.hours)),
  );

export const getContainerMetricsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator((input: { role: HostRole; name: string; hours: number }) => ({
    role: role(input.role),
    name: name(input.name),
    hours: bounded(input.hours, 1, 48),
  }))
  .handler(async ({ data }) =>
    runUseCase("panel.containerMetrics", () =>
      deps().hosts.containerMetrics(data.role, data.name, data.hours),
    ),
  );

export const getLogsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator((input: { role: HostRole; kind: TargetKind; name: string; lines: number }) => ({
    role: role(input.role),
    kind: kind(input.kind),
    name: name(input.name),
    lines: bounded(input.lines, 10, 500),
  }))
  .handler(async ({ data, context }) =>
    runUseCase("panel.logs", () => readLogs(context.actor, deps(), data)),
  );

export const restartTargetFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { role: HostRole; kind: TargetKind; name: string }) => ({
    role: role(input.role),
    kind: kind(input.kind),
    name: name(input.name),
  }))
  .handler(async ({ data, context }) =>
    runUseCase("panel.restart", () => restartTarget(context.actor, deps(), data)),
  );

export const setAutoHealFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { role: HostRole; enabled: boolean }) => ({
    role: role(input.role),
    enabled: typeof input.enabled === "boolean" ? input.enabled : invalid(),
  }))
  .handler(async ({ data, context }) =>
    runUseCase("panel.autoHeal", () => setAutoHeal(context.actor, deps(), data)),
  );

export const getEventsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () => runUseCase("panel.events", () => listEvents(deps(), 200)));

export const getTeamActionsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () => runUseCase("panel.teamActions", () => deps().audit.recent(50)));

export const getDatabaseServerFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () => runUseCase("panel.databases", () => deps().databases.server()));

export const getJobsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () => runUseCase("panel.jobs", () => deps().databases.jobs()));

export const getTablesFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator((input: { database: string }) => ({ database: database(input.database) }))
  .handler(async ({ data }) =>
    runUseCase("panel.tables", () => deps().databases.tables(data.database)),
  );

export const getTableDetailFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator((input: { database: string; schema: string; table: string }) => ({
    database: database(input.database),
    schema: identifier(input.schema),
    table: identifier(input.table),
  }))
  .handler(async ({ data }) =>
    runUseCase("panel.table", () => deps().databases.table(data.database, data.schema, data.table)),
  );

export const getTableRowsFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .validator(
    (input: {
      database: string;
      schema: string;
      table: string;
      limit: number;
      offset: number;
    }) => ({
      database: database(input.database),
      schema: identifier(input.schema),
      table: identifier(input.table),
      limit: bounded(input.limit, 1, 100),
      offset: bounded(input.offset, 0, 100_000_000),
    }),
  )
  .handler(async ({ data, context }) =>
    runUseCase("panel.rows", () => readTableRows(context.actor, deps(), data)),
  );

export const getClientHealthFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async () => runUseCase("panel.clients", () => listClientHealth(deps())));
