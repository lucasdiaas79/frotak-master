import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RotateCw, Search } from "lucide-react";
import { EmptyState, Panel, StatusPill, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  containerLevel,
  containerStateLabel,
  type Container,
  type HostResult,
  type HostRole,
} from "@/modules/control-panel/domain/control-panel";
import { getContainerMetricsFn } from "@/modules/control-panel/server";
import { LogsSheet, RestartDialog, type PanelTarget } from "@/modules/control-panel/ui/actions";
import {
  formatBytes,
  formatDuration,
  formatPercent,
  toEpoch,
} from "@/modules/control-panel/ui/format";
import { canOperatePanel, isPanelAdmin } from "@/modules/control-panel/ui/access";
import {
  KeyValue,
  LevelBadge,
  MetricChart,
  Mono,
  RangeFilter,
} from "@/modules/control-panel/ui/shared";

const RANGES = [
  { hours: 1, label: "1 h" },
  { hours: 6, label: "6 h" },
  { hours: 24, label: "24 h" },
  { hours: 48, label: "2 dias" },
];

function ContainerSheet({
  container,
  role,
  onClose,
}: {
  container: Container | null;
  role: HostRole;
  onClose: () => void;
}) {
  const [hours, setHours] = useState(6);
  const metrics = useQuery({
    queryKey: ["panel", "container-metrics", container?.name, hours],
    queryFn: () => getContainerMetricsFn({ data: { role, name: container!.name, hours } }),
    enabled: Boolean(container),
    refetchInterval: 60_000,
  });
  const points = metrics.data?.points ?? [];

  return (
    <Sheet open={Boolean(container)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {container ? (
          <>
            <SheetHeader>
              <SheetTitle className="break-all">{container.name}</SheetTitle>
              <SheetDescription className="break-all">{container.image}</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-5">
              <LevelBadge level={containerLevel(container)}>
                {containerStateLabel(container)}
              </LevelBadge>
              {container.healthOutput ? (
                <p className="rounded-2xl border border-border bg-elevated/40 p-3 font-mono text-xs break-all">
                  {container.healthOutput}
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-4">
                <KeyValue label="Grupo">{container.group}</KeyValue>
                <KeyValue label="Reinícios">{container.restartCount}</KeyValue>
                <KeyValue label="Política de reinício">{container.restartPolicy || "—"}</KeyValue>
                <KeyValue label="Processos">{container.stats?.pids ?? "—"}</KeyValue>
                <KeyValue label="Tráfego recebido">{formatBytes(container.stats?.netRx)}</KeyValue>
                <KeyValue label="Tráfego enviado">{formatBytes(container.stats?.netTx)}</KeyValue>
              </dl>

              <div className="space-y-3">
                <RangeFilter hours={hours} onChange={setHours} ranges={RANGES} />
                <MetricChart
                  title="CPU"
                  hours={hours}
                  format={formatPercent}
                  points={points.map((point) => ({ ts: point.ts, value: point.cpu }))}
                />
                <MetricChart
                  title="Memória"
                  hours={hours}
                  format={formatBytes}
                  points={points.map((point) => ({ ts: point.ts, value: point.mem }))}
                />
              </div>

              <div>
                <h3 className="mb-1 text-sm font-semibold">Portas publicadas</h3>
                {container.ports.length ? (
                  <ul className="space-y-1">
                    {container.ports.map((port) => (
                      <li key={port}>
                        <Mono>{port}</Mono>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma: só outros containers alcançam.
                  </p>
                )}
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Pastas ligadas</h3>
                {container.mounts.length ? (
                  <ul className="space-y-1">
                    {container.mounts.map((mount) => (
                      <li key={mount}>
                        <Mono>{mount}</Mono>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma.</p>
                )}
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Redes</h3>
                <Mono>{container.networks.join(", ") || "—"}</Mono>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function ContainersTab({ hosts }: { hosts: HostResult[] }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("todos");
  const [details, setDetails] = useState<string | null>(null);
  const [logs, setLogs] = useState<PanelTarget | null>(null);
  const [restart, setRestart] = useState<PanelTarget | null>(null);
  const canOperate = canOperatePanel();
  const isAdmin = isPanelAdmin();

  const host = hosts.find((item) => item.role === "db");
  const containers = useMemo(() => (host?.reachable ? host.snapshot.containers : []), [host]);
  const groups = useMemo(
    () => [...new Set(containers.map((item) => item.group))].sort(),
    [containers],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return containers
      .filter((item) => group === "todos" || item.group === group)
      .filter((item) =>
        query ? `${item.name} ${item.image} ${item.group}`.toLowerCase().includes(query) : true,
      )
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }, [containers, group, search]);

  if (!host?.reachable) {
    return (
      <Panel title="Containers">
        <EmptyState
          title="VPS de banco sem resposta"
          description="Sem a sentinela de lá, não há como listar os containers."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar container ou imagem"
            aria-label="Buscar container ou imagem"
            className="pl-9"
          />
        </div>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-56" aria-label="Filtrar por grupo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os grupos</SelectItem>
            {groups.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Panel
        eyebrow="VPS de banco"
        title={`${filtered.length} de ${containers.length} containers`}
        description="A VPS de Serviço não usa Docker: Master e TMS estão na aba Servidores."
        bodyClassName="p-0"
      >
        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhum container com esse filtro" />
          </div>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[920px]">
              <thead>
                <tr>
                  <Th>Container</Th>
                  <Th>Grupo</Th>
                  <Th>Estado</Th>
                  <Th>Rodando há</Th>
                  <Th className="text-right">CPU</Th>
                  <Th className="text-right">Memória</Th>
                  <Th className="text-right">Reinícios</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((container) => {
                  const started = toEpoch(container.startedAt);
                  const target: PanelTarget = {
                    role: "db",
                    kind: "container",
                    name: container.name,
                    clientSlug: container.clientSlug,
                  };
                  return (
                    <Tr key={container.name}>
                      <Td>
                        <button
                          type="button"
                          className="text-left font-semibold underline-offset-2 hover:underline"
                          onClick={() => setDetails(container.name)}
                        >
                          {container.name}
                        </button>
                        <Mono className="block max-w-72 truncate text-muted-foreground">
                          {container.image}
                        </Mono>
                      </Td>
                      <Td>
                        <StatusPill tone="neutral" dot={false}>
                          {container.group}
                        </StatusPill>
                      </Td>
                      <Td>
                        <LevelBadge level={containerLevel(container)}>
                          {containerStateLabel(container)}
                        </LevelBadge>
                      </Td>
                      <Td className="text-xs text-muted-foreground">
                        {container.state === "running" && started
                          ? formatDuration(Date.now() / 1000 - started)
                          : "—"}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatPercent(container.stats?.cpuPercent)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatBytes(container.stats?.memBytes)}
                      </Td>
                      <Td className="text-right tabular-nums">{container.restartCount}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {canOperate ? (
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Logs de ${container.name}`}
                              onClick={() => setLogs(target)}
                            >
                              <FileText className="size-4" />
                              Logs
                            </Button>
                          ) : null}
                          {canOperate &&
                          container.restartable &&
                          (!container.protected || isAdmin) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Reiniciar ${container.name}`}
                              onClick={() => setRestart(target)}
                            >
                              <RotateCw className="size-4" />
                              Reiniciar
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      <ContainerSheet
        role="db"
        container={containers.find((item) => item.name === details) ?? null}
        onClose={() => setDetails(null)}
      />
      <LogsSheet target={logs} onClose={() => setLogs(null)} />
      <RestartDialog target={restart} onClose={() => setRestart(null)} />
    </div>
  );
}
