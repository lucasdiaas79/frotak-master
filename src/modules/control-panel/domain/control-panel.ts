// Painel de controle da infraestrutura: tipos do que as sentinelas e o agente respondem e as regras
// de saúde. Sem I/O: tudo aqui é testado em Node puro (npm run test:control-panel).

export type HostRole = "db" | "service";

export const hostRoles: HostRole[] = ["service", "db"];

export const hostLabels: Record<HostRole, string> = {
  db: "VPS de banco",
  service: "VPS de Serviço",
};

export type HealthLevel = "ok" | "warning" | "critical" | "idle";

export type ContainerStats = {
  cpuPercent: number;
  memBytes: number;
  memPercent: number;
  pids: number;
  netRx: number;
  netTx: number;
};

export type Container = {
  name: string;
  image: string;
  state: string;
  health: string | null;
  healthOutput: string;
  startedAt: string;
  exitCode: number;
  oomKilled: boolean;
  restartCount: number;
  restartPolicy: string;
  project: string;
  service: string;
  ports: string[];
  mounts: string[];
  networks: string[];
  group: string;
  clientSlug: string | null;
  managed: boolean;
  protected: boolean;
  restartable: boolean;
  maintenance: boolean;
  stats: ContainerStats | null;
};

export type ServiceUnit = {
  name: string;
  description: string;
  active: string;
  sub: string;
  enabled: string;
  pid: number;
  memoryBytes: number | null;
  since: string;
  restarts: number;
  result: string;
  restartable: boolean;
};

export type HostAlert = {
  key: string;
  since: number;
  level: "warning" | "critical" | "info";
  title: string;
  detail: string;
};

export type HealRule = { target: string; watches: string; action: string; limit: string };

export type HealEvent = {
  id: number;
  ts: number;
  level: "info" | "warning" | "critical";
  kind: string;
  target: string;
  title: string;
  detail: string;
};

export type BackupCopy = {
  name: string;
  bytes: number;
  at: number;
  clients: number;
  verified: boolean;
};

export type BackupRun = { result: string; finishedAt: string };

export type HostSnapshot = {
  role: HostRole;
  capturedAt: number;
  host: {
    hostname: string;
    os: string;
    kernel: string;
    cores: number;
    uptimeSeconds: number;
    load: number[];
    cpuPercent: number;
    memory: { total: number; used: number; swapTotal: number; swapUsed: number };
    disk: { used: number; total: number };
    networkRate: { rx: number; tx: number };
    publicIp: string;
    wireguardIp: string;
    dockerVersion: string | null;
  };
  services: ServiceUnit[];
  containers: Container[];
  wireguard: {
    up: boolean;
    peers: {
      endpoint: string;
      allowedIps: string;
      handshakeAgeSeconds: number | null;
      rxBytes: number;
      txBytes: number;
    }[];
  } | null;
  listening: {
    protocol: string;
    address: string;
    port: number;
    process: string;
    exposure: "local" | "wireguard" | "public";
  }[];
  firewall: string[];
  disks: { device: string; type: string; total: number; used: number; mount: string }[];
  directories: { path: string; bytes: number; complete: boolean }[];
  certificates: { host: string; expiresAt: number | null; valid: boolean; error?: string }[];
  backups: {
    location: string;
    copies: BackupCopy[];
    lastRun?: BackupRun;
    lastRestoreTest?: BackupRun;
    scheduled?: boolean;
  };
  heal: {
    enabled: boolean;
    rules: HealRule[];
    actionsLast24h: number;
    attention: { target: string; attempts: number; gaveUp: boolean; fails: number }[];
    lastCycleAt: number;
    intervalSeconds: number;
  };
  alerts: HostAlert[];
};

export type HostResult =
  | { role: HostRole; reachable: true; snapshot: HostSnapshot }
  | { role: HostRole; reachable: false; error: string };

export type MetricPoint = {
  ts: number;
  cpu: number;
  mem_used: number;
  mem_total: number;
  disk_used: number;
  disk_total: number;
  load1: number;
  net_rx: number;
  net_tx: number;
};

export type ContainerMetricPoint = { ts: number; cpu: number; mem: number };

export type MetricSeries<T> = { bucketSeconds: number; points: T[] };

export type DatabaseKind = "central" | "client" | "jobs" | "template" | "system" | "other";

export type DatabaseInfo = {
  name: string;
  kind: DatabaseKind;
  clientSlug: string | null;
  sizeBytes: number;
  connections: number;
  allowConnections: boolean;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  cacheHitPercent: number | null;
  publicTables?: number;
  migrations?: number;
  lastMigration?: string | null;
};

export type DatabaseServer = {
  version: string;
  startedAt: string;
  maxConnections: number;
  connections: number;
  sharedBuffers: string;
  slots: { name: string; database: string; active: boolean; lagBytes: number | null }[];
  databases: DatabaseInfo[];
};

export type TableSummary = {
  schema: string;
  name: string;
  kind: string;
  estimatedRows: number;
  totalBytes: number;
  rls: boolean;
  policies: number;
  indexes: number;
  columns: number;
  deadRows: number;
  lastVacuum: string | null;
  comment: string | null;
};

export type TableList = { database: string; rowSchemas: string[]; tables: TableSummary[] };

export type TableDetail = {
  schema: string;
  name: string;
  kind: string;
  rls: boolean;
  rlsForced: boolean;
  comment: string | null;
  totalBytes: number;
  rowsReadable: boolean;
  exactRows: number | null;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    default: string | null;
    comment: string | null;
    masked: boolean;
  }[];
  constraints: { name: string; type: string; definition: string }[];
  indexes: {
    name: string;
    definition: string;
    unique: boolean;
    primary: boolean;
    bytes: number;
    scans: number;
  }[];
  policies: {
    name: string;
    command: string;
    roles: string[];
    permissive: string;
    using: string | null;
    check: string | null;
  }[];
  triggers: { name: string; definition: string }[];
};

export type TableRows = {
  columns: { name: string; type: string; masked: boolean }[];
  rows: Record<string, string | null>[];
  limit: number;
  offset: number;
  total: number | null;
};

export type ScheduledJob = {
  name: string;
  schedule: string;
  database: string;
  active: boolean;
  lastStatus: string | null;
  lastRunAt: string | null;
  lastMessage: string | null;
  failures24h: number;
};

export type ClientProbe = { status: number | null; ms: number };

export type ClientHealth = {
  slug: string;
  name: string;
  tenantStatus: string | null;
  clientUrl: string | null;
  auth: ClientProbe;
  rest: ClientProbe;
  storage: ClientProbe;
  realtimeRegistered: boolean;
};

export type TeamAction = {
  id: string;
  at: string;
  action: string;
  actorEmail: string;
  target: string;
};

export type ControlPanelTab =
  "geral" | "servidores" | "containers" | "bancos" | "clientes" | "autoheal" | "backups";

export const controlPanelTabs: ControlPanelTab[] = [
  "geral",
  "servidores",
  "containers",
  "bancos",
  "clientes",
  "autoheal",
  "backups",
];

export type Issue = {
  key: string;
  level: "warning" | "critical";
  title: string;
  detail: string;
  host: HostRole;
  tab: ControlPanelTab;
};

export function usageLevel(percent: number, warning = 80, critical = 90): HealthLevel {
  if (percent >= critical) return "critical";
  if (percent >= warning) return "warning";
  return "ok";
}

export function percentOf(used: number, total: number) {
  return total > 0 ? (100 * used) / total : 0;
}

/** Container que terminou o trabalho (sem política de reinício e saída 0) não é problema. */
export function containerLevel(container: Container): HealthLevel {
  if (container.maintenance) return "warning";
  if (container.state === "running") {
    if (container.health === "unhealthy") return "critical";
    if (container.health === "starting") return "warning";
    return "ok";
  }
  if (container.exitCode === 0 && !["always", "unless-stopped"].includes(container.restartPolicy)) {
    return "idle";
  }
  return "critical";
}

export function containerStateLabel(container: Container) {
  if (container.maintenance) return "Em manutenção";
  if (container.state === "running") {
    if (container.health === "unhealthy") return "Com falha";
    if (container.health === "starting") return "Subindo";
    return container.health === "healthy" ? "Saudável" : "Rodando";
  }
  if (containerLevel(container) === "idle") return "Concluído";
  return container.state === "exited" ? "Parado" : container.state;
}

export function serviceLevel(service: ServiceUnit): HealthLevel {
  if (service.active === "active") return "ok";
  if (service.active === "activating" || service.active === "reloading") return "warning";
  if (service.active === "inactive" && service.enabled !== "enabled") return "idle";
  return "critical";
}

export function serviceStateLabel(service: ServiceUnit) {
  const level = serviceLevel(service);
  if (level === "ok") return "Ativo";
  if (level === "warning") return "Iniciando";
  if (level === "idle") return "Desligado";
  return "Parado";
}

export function isProbeHealthy(probe: ClientProbe) {
  return probe.status !== null && probe.status < 500;
}

/**
 * Tudo que pede atenção agora, com o mais grave primeiro. O que a sentinela ainda não transformou
 * em alerta (falha de poucos segundos) também aparece: o painel mostra o estado real.
 */
export function collectIssues(hosts: HostResult[]): Issue[] {
  const issues = new Map<string, Issue>();
  for (const result of hosts) {
    const host = result.role;
    if (!result.reachable) {
      issues.set(`host:${host}`, {
        key: `host:${host}`,
        level: "critical",
        title: `${hostLabels[host]} sem resposta`,
        detail: "A sentinela desta VPS não respondeu. O que está aqui pode estar desatualizado.",
        host,
        tab: "servidores",
      });
      continue;
    }

    const { snapshot } = result;
    for (const container of snapshot.containers) {
      const level = containerLevel(container);
      if (level !== "critical" && level !== "warning") continue;
      const key = `container:${container.name}`;
      issues.set(key, {
        key,
        level,
        title: `Container ${container.name}: ${containerStateLabel(container).toLowerCase()}`,
        detail: container.healthOutput,
        host,
        tab: "containers",
      });
    }
    for (const service of snapshot.services) {
      const level = serviceLevel(service);
      if (level !== "critical" && level !== "warning") continue;
      const key = `service:${service.name}`;
      issues.set(key, {
        key,
        level,
        title: `Serviço ${service.name}: ${serviceStateLabel(service).toLowerCase()}`,
        detail: "",
        host,
        tab: "servidores",
      });
    }
    // O alerta da sentinela tem o texto melhor; substitui o item do mesmo alvo.
    for (const alert of snapshot.alerts) {
      if (alert.level === "info") continue;
      issues.set(alert.key, {
        key: alert.key,
        level: alert.level,
        title: alert.title,
        detail: alert.detail,
        host,
        tab: alert.key.startsWith("backup")
          ? "backups"
          : alert.key.startsWith("container")
            ? "containers"
            : "servidores",
      });
    }
    if (!snapshot.heal.enabled) {
      const key = `heal:${host}`;
      issues.set(key, {
        key,
        level: "warning",
        title: `Auto-heal pausado na ${hostLabels[host]}`,
        detail: "Falhas continuam sendo avisadas, mas nada é consertado sozinho.",
        host,
        tab: "autoheal",
      });
    }
  }
  return [...issues.values()].sort(
    (a, b) => Number(b.level === "critical") - Number(a.level === "critical"),
  );
}

export function summarizeContainers(hosts: HostResult[]) {
  const summary = { total: 0, healthy: 0 };
  for (const result of hosts) {
    if (!result.reachable) continue;
    for (const container of result.snapshot.containers) {
      const level = containerLevel(container);
      if (level === "idle") continue;
      summary.total += 1;
      if (level === "ok") summary.healthy += 1;
    }
  }
  return summary;
}

export function latestBackup(hosts: HostResult[]) {
  for (const result of hosts) {
    if (result.reachable && result.role === "db") {
      return result.snapshot.backups.copies[0] ?? null;
    }
  }
  return null;
}
