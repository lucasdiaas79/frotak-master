import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Archive,
  Boxes,
  Database,
  Globe,
  HeartPulse,
  Lock,
  Network,
  Server,
} from "lucide-react";
import { Panel } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import {
  collectIssues,
  containerLevel,
  hostLabels,
  latestBackup,
  percentOf,
  serviceLevel,
  summarizeContainers,
  type Container,
  type ControlPanelTab,
  type HealthLevel,
  type HostResult,
  type HostRole,
  type HostSnapshot,
} from "@/modules/control-panel/domain/control-panel";
import { getDatabaseServerFn } from "@/modules/control-panel/server";
import {
  formatAgo,
  formatBytes,
  formatDuration,
  serviceLabel,
} from "@/modules/control-panel/ui/format";
import { LevelBadge, LevelIcon, StatTile, UsageMeter } from "@/modules/control-panel/ui/shared";

function worst(levels: HealthLevel[]): HealthLevel {
  if (levels.includes("critical")) return "critical";
  if (levels.includes("warning")) return "warning";
  return "ok";
}

function NodeRow({ level, label, hint }: { level: HealthLevel; label: string; hint?: string }) {
  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <LevelIcon level={level} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{hint}</span>
      ) : null}
    </li>
  );
}

function NodeGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

function ClientGroups({ containers }: { containers: Container[] }) {
  const groups = new Map<string, Container[]>();
  for (const container of containers) {
    if (!container.clientSlug) continue;
    groups.set(container.clientSlug, [...(groups.get(container.clientSlug) ?? []), container]);
  }
  if (!groups.size) {
    return <li className="py-1 text-sm text-muted-foreground">Nenhum cliente criado.</li>;
  }
  return (
    <>
      {[...groups.entries()].map(([slug, items]) => {
        const healthy = items.filter((item) => containerLevel(item) === "ok").length;
        return (
          <NodeRow
            key={slug}
            level={worst(items.map(containerLevel))}
            label={slug}
            hint={`${healthy}/${items.length} serviços`}
          />
        );
      })}
    </>
  );
}

function HostCard({ result }: { result: HostResult }) {
  const Icon = result.role === "db" ? Database : Server;
  if (!result.reachable) {
    return (
      <section className="panel flex-1 p-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <h3 className="font-semibold">{hostLabels[result.role]}</h3>
        </div>
        <div className="mt-4">
          <LevelBadge level="critical">Sem resposta</LevelBadge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          A sentinela não respondeu. A VPS pode estar fora do ar ou a rede privada caída.
        </p>
      </section>
    );
  }
  const { host, services, containers } = result.snapshot;
  const byName = new Map(containers.map((item) => [item.name, item]));
  const memoryPercent = percentOf(host.memory.used, host.memory.total);
  const diskPercent = percentOf(host.disk.used, host.disk.total);

  function containerRow(name: string, label: string) {
    const item = byName.get(name);
    return (
      <NodeRow
        key={name}
        level={item ? containerLevel(item) : "critical"}
        label={label}
        hint={item?.stats ? formatBytes(item.stats.memBytes) : item ? undefined : "não existe"}
      />
    );
  }
  function serviceRow(name: string) {
    const service = services.find((item) => item.name === name);
    return (
      <NodeRow
        key={name}
        level={service ? serviceLevel(service) : "critical"}
        label={serviceLabel(name)}
        hint={service?.memoryBytes ? formatBytes(service.memoryBytes) : undefined}
      />
    );
  }

  return (
    <section className="panel min-w-0 flex-1 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h3 className="font-semibold">{hostLabels[result.role]}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          ligada há {formatDuration(host.uptimeSeconds)}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {host.hostname} · {host.publicIp} · {host.cores} vCPU · {formatBytes(host.memory.total)} RAM
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <UsageMeter label="CPU" percent={host.cpuPercent} warning={80} critical={90} />
        <UsageMeter label="Memória" percent={memoryPercent} warning={85} critical={95} />
        <UsageMeter
          label="Disco"
          percent={diskPercent}
          hint={`${formatBytes(host.disk.used)} de ${formatBytes(host.disk.total)}`}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {result.role === "service" ? (
          <>
            <NodeGroup title="Entrada">{serviceRow("caddy")}</NodeGroup>
            <NodeGroup title="Sistemas">
              {serviceRow("frotak-app@master")}
              {serviceRow("frotak-app@tms")}
            </NodeGroup>
            <NodeGroup title="Apoio">
              {serviceRow("redis-server")}
              {serviceRow("frotak-sentinel")}
            </NodeGroup>
          </>
        ) : (
          <>
            <NodeGroup title="Banco de dados">
              {containerRow("frotak-db", "Postgres")}
              {serviceRow("pgbouncer")}
              {serviceRow("frotak-agent")}
            </NodeGroup>
            <NodeGroup title="Portão">
              {containerRow("frotak-kong", "Kong")}
              {containerRow("realtime-dev.supabase-realtime", "Realtime")}
            </NodeGroup>
            <NodeGroup title="Central">
              {containerRow("frotak-auth", "Login")}
              {containerRow("frotak-rest", "API")}
              {containerRow("frotak-storage", "Arquivos")}
            </NodeGroup>
            <NodeGroup title="Clientes">
              <ClientGroups containers={containers} />
            </NodeGroup>
          </>
        )}
      </div>
    </section>
  );
}

function tunnelState(service: HostSnapshot | null) {
  const age = service?.wireguard?.peers[0]?.handshakeAgeSeconds ?? null;
  if (!service) return { level: "critical" as const, text: "sem dados" };
  if (age === null || age > 300) return { level: "critical" as const, text: "sem tráfego" };
  return { level: "ok" as const, text: `ativa, sinal há ${formatDuration(age)}` };
}

function Topology({ hosts }: { hosts: HostResult[] }) {
  const service = hosts.find((item) => item.role === "service");
  const database = hosts.find((item) => item.role === "db");
  const snapshot = service?.reachable ? service.snapshot : null;
  const tunnel = tunnelState(snapshot);

  return (
    <Panel
      eyebrow="Estrutura"
      title="Como tudo se conecta"
      description="O navegador entra só pela VPS de Serviço. A VPS de banco não recebe nada da internet além de SSH."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Globe className="size-4" />
        <span>Internet</span>
        <ArrowRight className="size-3.5" />
        <Lock className="size-3.5" />
        <span>HTTPS, porta 443</span>
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        {service ? <HostCard result={service} /> : null}
        <div className="flex shrink-0 items-center justify-center gap-2 px-2 py-1 text-center xl:w-28 xl:flex-col">
          <Network className="size-4 text-primary" />
          <div className="flex items-center gap-1.5 xl:flex-col">
            <span className="text-xs font-semibold">Rede privada WireGuard</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LevelIcon level={tunnel.level} className="size-3.5" />
              {tunnel.text}
            </span>
          </div>
        </div>
        {database ? <HostCard result={database} /> : null}
      </div>
    </Panel>
  );
}

export function OverviewTab({
  hosts,
  onNavigate,
}: {
  hosts: HostResult[];
  onNavigate: (tab: ControlPanelTab) => void;
}) {
  const databases = useQuery({
    queryKey: ["panel", "databases"],
    queryFn: () => getDatabaseServerFn(),
    refetchInterval: 30_000,
  });
  const issues = collectIssues(hosts);
  const reachable = hosts.filter((item) => item.reachable).length;
  const containers = summarizeContainers(hosts);
  const backup = latestBackup(hosts);
  const databaseHost = hosts.find((item) => item.role === "db");
  const clientDatabases = databases.data?.databases.filter((item) => item.kind === "client") ?? [];
  const healActions = hosts.reduce(
    (total, item) => total + (item.reachable ? item.snapshot.heal.actionsLast24h : 0),
    0,
  );
  const healPaused = hosts.some((item) => item.reachable && !item.snapshot.heal.enabled);
  const backupAge = backup ? Date.now() / 1000 - backup.at : null;

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Saúde agora"
        title={
          issues.length === 0
            ? "Tudo saudável"
            : issues.length === 1
              ? "1 item pede atenção"
              : `${issues.length} itens pedem atenção`
        }
        bodyClassName={issues.length ? "p-0" : "p-5"}
      >
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LevelIcon level="ok" />
            Servidores, containers, serviços e backups sem nenhum problema aberto.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {issues.map((issue) => (
              <li key={issue.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <LevelIcon level={issue.level} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{issue.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {hostLabels[issue.host as HostRole]}
                    {issue.detail ? ` · ${issue.detail}` : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onNavigate(issue.tab)}>
                  Ver
                  <ArrowRight className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          icon={Server}
          label="Servidores"
          value={`${reachable} de ${hosts.length}`}
          level={reachable === hosts.length ? "ok" : "critical"}
          hint={reachable === hosts.length ? "Respondendo" : "VPS sem resposta"}
        />
        <StatTile
          icon={Boxes}
          label="Containers saudáveis"
          value={`${containers.healthy} de ${containers.total}`}
          level={containers.healthy === containers.total ? "ok" : "critical"}
          hint={databaseHost?.reachable ? "Na VPS de banco" : "Sem dados"}
        />
        <StatTile
          icon={Database}
          label="Bancos de clientes"
          value={databases.data ? String(clientDatabases.length) : "—"}
          hint={
            databases.data
              ? `${formatBytes(clientDatabases.reduce((sum, item) => sum + item.sizeBytes, 0))} no total`
              : "Carregando"
          }
        />
        <StatTile
          icon={Archive}
          label="Último backup"
          value={backup ? formatAgo(backup.at) : "Nenhum"}
          level={backupAge !== null && backupAge < 26 * 3600 ? "ok" : "critical"}
          hint={backup ? `${formatBytes(backup.bytes)}, ${backup.clients} cliente(s)` : "Sem cópia"}
        />
        <StatTile
          icon={HeartPulse}
          label="Auto-heal"
          value={healPaused ? "Pausado" : "Ligado"}
          level={healPaused ? "warning" : "ok"}
          hint={`${healActions} conserto(s) em 24 h`}
        />
      </div>

      <Topology hosts={hosts} />
    </div>
  );
}
