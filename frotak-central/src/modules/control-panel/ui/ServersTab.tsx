import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RotateCw } from "lucide-react";
import { EmptyState, Panel, StatusPill, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import {
  hostLabels,
  percentOf,
  serviceLevel,
  serviceStateLabel,
  type HostResult,
  type HostSnapshot,
} from "@/modules/control-panel/domain/control-panel";
import { getHostMetricsFn } from "@/modules/control-panel/server";
import { LogsSheet, RestartDialog, type PanelTarget } from "@/modules/control-panel/ui/actions";
import {
  formatAgo,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRate,
  serviceLabel,
  toEpoch,
} from "@/modules/control-panel/ui/format";
import { canOperatePanel } from "@/modules/control-panel/ui/access";
import {
  ErrorBlock,
  KeyValue,
  LevelBadge,
  LoadingBlock,
  MetricChart,
  Mono,
  RangeFilter,
  UsageMeter,
} from "@/modules/control-panel/ui/shared";

const exposureTone = { local: "neutral", wireguard: "info", public: "warning" } as const;
const exposureLabel = { local: "Só nesta VPS", wireguard: "Rede privada", public: "Internet" };

function Charts({ role, hours }: { role: HostSnapshot["role"]; hours: number }) {
  const metrics = useQuery({
    queryKey: ["panel", "metrics", role, hours],
    queryFn: () => getHostMetricsFn({ data: { role, hours } }),
    refetchInterval: 60_000,
  });
  if (metrics.isLoading) return <LoadingBlock label="Carregando histórico..." />;
  if (metrics.isError) {
    return <ErrorBlock error={metrics.error} onRetry={() => void metrics.refetch()} />;
  }
  const points = metrics.data?.points ?? [];
  const toSeries = (value: (point: (typeof points)[number]) => number) =>
    points.map((point) => ({ ts: point.ts, value: value(point) }));

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <MetricChart
        title="CPU"
        hours={hours}
        max={100}
        format={formatPercent}
        points={toSeries((point) => point.cpu)}
      />
      <MetricChart
        title="Memória"
        hours={hours}
        max={100}
        format={formatPercent}
        points={toSeries((point) => percentOf(point.mem_used, point.mem_total))}
      />
      <MetricChart
        title="Rede, entrada"
        hours={hours}
        format={formatRate}
        points={toSeries((point) => point.net_rx)}
      />
      <MetricChart
        title="Rede, saída"
        hours={hours}
        format={formatRate}
        points={toSeries((point) => point.net_tx)}
      />
    </div>
  );
}

function HostPanel({
  snapshot,
  hours,
  onLogs,
  onRestart,
}: {
  snapshot: HostSnapshot;
  hours: number;
  onLogs: (target: PanelTarget) => void;
  onRestart: (target: PanelTarget) => void;
}) {
  const { host, role } = snapshot;
  const canOperate = canOperatePanel();
  const peers = snapshot.wireguard?.peers ?? [];

  return (
    <Panel
      eyebrow={host.os}
      title={hostLabels[role]}
      description={`${host.hostname}, ligada há ${formatDuration(host.uptimeSeconds)}`}
      actions={
        <span className="text-xs text-muted-foreground">
          Medido {formatAgo(snapshot.capturedAt)}
        </span>
      }
      bodyClassName="space-y-5"
    >
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KeyValue label="IP público">{host.publicIp || "—"}</KeyValue>
        <KeyValue label="IP privado">{host.wireguardIp || "—"}</KeyValue>
        <KeyValue label="Recursos">
          {host.cores} vCPU, {formatBytes(host.memory.total)}
        </KeyValue>
        <KeyValue label="Kernel">{host.kernel}</KeyValue>
        <KeyValue label="Docker">{host.dockerVersion ?? "Não usa"}</KeyValue>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UsageMeter
          label="CPU"
          percent={host.cpuPercent}
          hint={`${formatPercent(host.cpuPercent)}, carga ${host.load[0]?.toFixed(2)}`}
        />
        <UsageMeter
          label="Memória"
          percent={percentOf(host.memory.used, host.memory.total)}
          hint={`${formatBytes(host.memory.used)} de ${formatBytes(host.memory.total)}`}
          warning={85}
          critical={95}
        />
        <UsageMeter
          label="Disco"
          percent={percentOf(host.disk.used, host.disk.total)}
          hint={`${formatBytes(host.disk.used)} de ${formatBytes(host.disk.total)}`}
        />
        <UsageMeter
          label="Swap"
          percent={percentOf(host.memory.swapUsed, host.memory.swapTotal)}
          hint={
            host.memory.swapTotal
              ? `${formatBytes(host.memory.swapUsed)} de ${formatBytes(host.memory.swapTotal)}`
              : "Sem swap"
          }
        />
      </div>

      <Charts role={role} hours={hours} />

      <div>
        <h3 className="mb-2 text-sm font-semibold">Serviços</h3>
        <TableWrap className="rounded-2xl border border-border">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <Th>Serviço</Th>
                <Th>Estado</Th>
                <Th>Há quanto tempo</Th>
                <Th className="text-right">Memória</Th>
                <Th className="text-right">Reinícios</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {snapshot.services.map((service) => {
                const since = toEpoch(service.since);
                const target: PanelTarget = { role, kind: "service", name: service.name };
                return (
                  <Tr key={service.name}>
                    <Td>
                      <p className="font-semibold">{serviceLabel(service.name)}</p>
                      <Mono className="text-muted-foreground">{service.name}</Mono>
                    </Td>
                    <Td>
                      <LevelBadge level={serviceLevel(service)}>
                        {serviceStateLabel(service)}
                      </LevelBadge>
                    </Td>
                    <Td className="text-xs text-muted-foreground">
                      {since ? formatDuration(Date.now() / 1000 - since) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{formatBytes(service.memoryBytes)}</Td>
                    <Td className="text-right tabular-nums">{service.restarts}</Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {canOperate ? (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Logs de ${service.name}`}
                            onClick={() => onLogs(target)}
                          >
                            <FileText className="size-4" />
                            Logs
                          </Button>
                        ) : null}
                        {canOperate && service.restartable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Reiniciar ${service.name}`}
                            onClick={() => onRestart(target)}
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
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Portas abertas</h3>
          <TableWrap className="max-h-80 overflow-y-auto rounded-2xl border border-border">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr>
                  <Th>Porta</Th>
                  <Th>Processo</Th>
                  <Th>Quem alcança</Th>
                </tr>
              </thead>
              <tbody>
                {snapshot.listening.map((port) => (
                  <Tr key={`${port.protocol}-${port.address}-${port.port}-${port.process}`}>
                    <Td className="py-2">
                      <Mono>
                        {port.protocol}/{port.port}
                      </Mono>
                      <span className="block text-xs text-muted-foreground">{port.address}</span>
                    </Td>
                    <Td className="py-2 text-xs">{port.process || "—"}</Td>
                    <Td className="py-2">
                      <StatusPill tone={exposureTone[port.exposure]} dot={false}>
                        {exposureLabel[port.exposure]}
                      </StatusPill>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-2 text-xs text-muted-foreground">
            "Internet" indica o que o processo escuta. Quem realmente passa é decidido pelo firewall
            abaixo.
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Disco por pasta</h3>
            <div className="space-y-3 rounded-2xl border border-border p-4">
              {snapshot.directories.map((directory) => (
                <UsageMeter
                  key={directory.path}
                  label={directory.path}
                  percent={percentOf(directory.bytes, host.disk.total)}
                  hint={formatBytes(directory.bytes)}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Rede privada</h3>
            {peers.length ? (
              <div className="space-y-2 rounded-2xl border border-border p-4 text-sm">
                {peers.map((peer) => (
                  <dl key={peer.endpoint} className="grid grid-cols-2 gap-3">
                    <KeyValue label="Outra VPS">{peer.endpoint}</KeyValue>
                    <KeyValue label="Último sinal">
                      {peer.handshakeAgeSeconds === null
                        ? "Nunca"
                        : `há ${formatDuration(peer.handshakeAgeSeconds)}`}
                    </KeyValue>
                    <KeyValue label="Recebido">{formatBytes(peer.rxBytes)}</KeyValue>
                    <KeyValue label="Enviado">{formatBytes(peer.txBytes)}</KeyValue>
                  </dl>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem ligação com a outra VPS" />
            )}
          </div>

          {snapshot.certificates.length ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Certificados HTTPS</h3>
              <ul className="space-y-2 rounded-2xl border border-border p-4 text-sm">
                {snapshot.certificates.map((certificate) => (
                  <li key={certificate.host} className="flex flex-wrap items-center gap-2">
                    <LevelBadge level={certificate.valid ? "ok" : "critical"}>
                      {certificate.valid ? "Válido" : "Inválido"}
                    </LevelBadge>
                    <span className="min-w-0 flex-1 truncate">{certificate.host}</span>
                    <span className="text-xs text-muted-foreground">
                      até {formatDateTime(certificate.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Firewall</h3>
        <pre className="overflow-x-auto rounded-2xl border border-border bg-elevated/40 p-4 font-mono text-[11px] leading-relaxed">
          {snapshot.firewall.join("\n") || "Sem regras."}
        </pre>
      </div>
    </Panel>
  );
}

export function ServersTab({ hosts }: { hosts: HostResult[] }) {
  const [hours, setHours] = useState(6);
  const [logs, setLogs] = useState<PanelTarget | null>(null);
  const [restart, setRestart] = useState<PanelTarget | null>(null);

  return (
    <div className="space-y-4">
      <RangeFilter hours={hours} onChange={setHours} />
      {hosts.map((result) =>
        result.reachable ? (
          <HostPanel
            key={result.role}
            snapshot={result.snapshot}
            hours={hours}
            onLogs={setLogs}
            onRestart={setRestart}
          />
        ) : (
          <Panel key={result.role} title={hostLabels[result.role]}>
            <EmptyState
              title="Sentinela sem resposta"
              description="A VPS pode estar fora do ar ou a rede privada caída. Confira pelo SSH."
            />
          </Panel>
        ),
      )}
      <LogsSheet target={logs} onClose={() => setLogs(null)} />
      <RestartDialog target={restart} onClose={() => setRestart(null)} />
    </div>
  );
}
