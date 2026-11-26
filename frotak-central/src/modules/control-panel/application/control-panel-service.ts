import { DomainError } from "@/core/domain/domain-error";
import {
  assertCanOperate,
  assertSuperAdmin,
  type PlatformActor,
} from "@/core/domain/platform-actor";
import type {
  ActionAudit,
  ClientDirectory,
  DatabaseGateway,
  HostGateway,
  TargetKind,
} from "@/modules/control-panel/application/ports";
import type {
  ClientHealth,
  HealEvent,
  HostRole,
} from "@/modules/control-panel/domain/control-panel";

const DATABASE_CONTAINER = "frotak-db";

export type ControlPanelDeps = {
  hosts: HostGateway;
  databases: DatabaseGateway;
  directory: ClientDirectory;
  audit: ActionAudit;
};

/** Toda a equipe consulta. Quem só consulta não vê logs, que podem trazer dados de cliente. */
export async function readLogs(
  actor: PlatformActor,
  deps: Pick<ControlPanelDeps, "hosts">,
  input: { role: HostRole; kind: TargetKind; name: string; lines: number },
) {
  assertCanOperate(actor);
  return deps.hosts.logs(input.role, input.kind, input.name, input.lines);
}

/** O registro vem antes da ação: sem auditoria, nada é reiniciado. */
export async function restartTarget(
  actor: PlatformActor,
  deps: Pick<ControlPanelDeps, "hosts" | "audit">,
  input: { role: HostRole; kind: TargetKind; name: string },
) {
  assertCanOperate(actor);
  if (input.kind === "container" && input.name === DATABASE_CONTAINER) {
    // Derruba todos os clientes ao mesmo tempo.
    assertSuperAdmin(actor);
  }
  await deps.audit.record(actor, "master.infra_restart", { ...input });
  await deps.hosts.restart(input.role, input.kind, input.name, actor.email);
}

export async function setAutoHeal(
  actor: PlatformActor,
  deps: Pick<ControlPanelDeps, "hosts" | "audit">,
  input: { role: HostRole; enabled: boolean },
) {
  assertCanOperate(actor);
  await deps.audit.record(actor, "master.infra_autoheal", { ...input });
  await deps.hosts.setHeal(input.role, input.enabled, actor.email);
}

/** Ver linhas é ver dados do cliente: só administrador, e cada leitura fica registrada antes. */
export async function readTableRows(
  actor: PlatformActor,
  deps: Pick<ControlPanelDeps, "databases" | "audit">,
  input: { database: string; schema: string; table: string; limit: number; offset: number },
) {
  assertSuperAdmin(actor);
  await deps.audit.record(actor, "master.database_rows_read", { ...input });
  return deps.databases.rows(input.database, input.schema, input.table, input.limit, input.offset);
}

export async function listClientHealth(
  deps: Pick<ControlPanelDeps, "databases" | "directory">,
): Promise<ClientHealth[]> {
  const [probes, directory] = await Promise.all([
    deps.databases.clientProbes(),
    deps.directory.list(),
  ]);
  const bySlug = new Map(directory.map((entry) => [entry.slug, entry]));
  return probes.map((probe) => {
    const entry = bySlug.get(probe.slug);
    return {
      ...probe,
      name: entry?.name ?? probe.slug,
      tenantStatus: entry?.tenantStatus ?? null,
      clientUrl: entry?.clientUrl ?? null,
    };
  });
}

/** Eventos das duas VPS em ordem de tempo. Uma VPS fora do ar não esconde os da outra. */
export async function listEvents(deps: Pick<ControlPanelDeps, "hosts">, limit: number) {
  const roles: HostRole[] = ["db", "service"];
  const results = await Promise.allSettled(roles.map((role) => deps.hosts.events(role, limit)));
  const merged: (HealEvent & { host: HostRole })[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      for (const event of result.value) merged.push({ ...event, host: roles[index] });
    }
  });
  return merged.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export function assertConfigured(hosts: HostGateway) {
  if (!hosts.isConfigured()) {
    throw new DomainError(
      "UNAVAILABLE",
      "Este ambiente não tem as sentinelas instaladas. O painel funciona nas VPS.",
    );
  }
}
