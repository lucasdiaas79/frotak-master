import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { EmptyState, Panel, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import {
  containerLevel,
  isProbeHealthy,
  type ClientProbe,
  type HealthLevel,
  type HostResult,
} from "@/modules/control-panel/domain/control-panel";
import { getClientHealthFn, getDatabaseServerFn } from "@/modules/control-panel/server";
import { formatBytes } from "@/modules/control-panel/ui/format";
import { ErrorBlock, LevelBadge, LevelIcon, LoadingBlock } from "@/modules/control-panel/ui/shared";

function ProbeCell({ probe }: { probe: ClientProbe }) {
  const healthy = isProbeHealthy(probe);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums">
      <LevelIcon level={healthy ? "ok" : "critical"} className="size-3.5" />
      {healthy ? `${probe.ms} ms` : probe.status ? `Erro ${probe.status}` : "Sem resposta"}
    </span>
  );
}

export function ClientsTab({ hosts }: { hosts: HostResult[] }) {
  const clients = useQuery({
    queryKey: ["panel", "clients"],
    queryFn: () => getClientHealthFn(),
    refetchInterval: 20_000,
  });
  const databases = useQuery({
    queryKey: ["panel", "databases"],
    queryFn: () => getDatabaseServerFn(),
    refetchInterval: 30_000,
  });

  if (clients.isLoading) return <LoadingBlock label="Testando cada cliente..." />;
  if (clients.isError) {
    return <ErrorBlock error={clients.error} onRetry={() => void clients.refetch()} />;
  }

  const host = hosts.find((item) => item.role === "db");
  const containers = host?.reachable ? host.snapshot.containers : [];

  return (
    <Panel
      eyebrow="Saúde por cliente"
      title={`${clients.data?.length ?? 0} cliente(s)`}
      description="Cada linha é um teste de verdade: o agente chama a API do cliente pelo portão, a cada 20 segundos."
      bodyClassName="p-0"
    >
      {clients.data?.length ? (
        <TableWrap>
          <table className="w-full min-w-[900px]">
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Saúde</Th>
                <Th>Login</Th>
                <Th>API</Th>
                <Th>Arquivos</Th>
                <Th>Tempo real</Th>
                <Th className="text-right">Containers</Th>
                <Th className="text-right">Banco</Th>
                <Th className="text-right">Conexões</Th>
              </tr>
            </thead>
            <tbody>
              {clients.data.map((client) => {
                const own = containers.filter((item) => item.clientSlug === client.slug);
                const healthyContainers = own.filter(
                  (item) => containerLevel(item) === "ok",
                ).length;
                const database = databases.data?.databases.find(
                  (item) => item.clientSlug === client.slug,
                );
                const probes = [client.auth, client.rest, client.storage];
                const allUp = probes.every(isProbeHealthy) && client.realtimeRegistered;
                const level: HealthLevel = allUp
                  ? healthyContainers === own.length
                    ? "ok"
                    : "warning"
                  : "critical";
                return (
                  <Tr key={client.slug}>
                    <Td>
                      <p className="font-semibold">{client.name}</p>
                      {client.clientUrl ? (
                        <a
                          href={client.clientUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {client.slug}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">{client.slug}</span>
                      )}
                    </Td>
                    <Td>
                      <LevelBadge level={level}>
                        {level === "ok"
                          ? "Saudável"
                          : level === "warning"
                            ? "Atenção"
                            : "Com falha"}
                      </LevelBadge>
                    </Td>
                    <Td>
                      <ProbeCell probe={client.auth} />
                    </Td>
                    <Td>
                      <ProbeCell probe={client.rest} />
                    </Td>
                    <Td>
                      <ProbeCell probe={client.storage} />
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <LevelIcon
                          level={client.realtimeRegistered ? "ok" : "critical"}
                          className="size-3.5"
                        />
                        {client.realtimeRegistered ? "Registrado" : "Sem registro"}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {healthyContainers}/{own.length}
                    </Td>
                    <Td className="text-right tabular-nums">{formatBytes(database?.sizeBytes)}</Td>
                    <Td className="text-right tabular-nums">{database?.connections ?? "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <div className="p-5">
          <EmptyState
            title="Nenhum cliente criado"
            description="Crie o primeiro em Clientes > Novo cliente."
          />
        </div>
      )}
    </Panel>
  );
}
