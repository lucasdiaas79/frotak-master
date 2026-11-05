import { Archive, ShieldCheck } from "lucide-react";
import { EmptyState, Panel, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import {
  hostLabels,
  type BackupRun,
  type HostResult,
} from "@/modules/control-panel/domain/control-panel";
import { formatAgo, formatBytes, formatDateTime, toEpoch } from "@/modules/control-panel/ui/format";
import { LevelBadge, Mono, StatTile } from "@/modules/control-panel/ui/shared";

function runLevel(run: BackupRun | undefined) {
  if (!run?.result) return "idle" as const;
  return run.result === "success" ? ("ok" as const) : ("critical" as const);
}

function runHint(run: BackupRun | undefined) {
  const finished = toEpoch(run?.finishedAt);
  if (!run?.result || !finished) return "Ainda não rodou";
  return `${run.result === "success" ? "Passou" : `Falhou: ${run.result}`}, ${formatAgo(finished)}`;
}

export function BackupsTab({ hosts }: { hosts: HostResult[] }) {
  const database = hosts.find((item) => item.role === "db");
  const snapshot = database?.reachable ? database.snapshot : null;

  return (
    <div className="space-y-4">
      {snapshot ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            icon={Archive}
            label="Último backup"
            value={runLevel(snapshot.backups.lastRun) === "ok" ? "Concluído" : "Verificar"}
            level={runLevel(snapshot.backups.lastRun)}
            hint={runHint(snapshot.backups.lastRun)}
          />
          <StatTile
            icon={ShieldCheck}
            label="Último teste de restauração"
            value={runLevel(snapshot.backups.lastRestoreTest) === "ok" ? "Concluído" : "Verificar"}
            level={runLevel(snapshot.backups.lastRestoreTest)}
            hint={runHint(snapshot.backups.lastRestoreTest)}
          />
        </div>
      ) : null}

      <p className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
        O backup roda todo dia às 06:30 UTC e o teste de restauração, aos domingos. Restaurar um
        cliente continua sendo feito pelo terminal, de propósito, porque substitui os dados dele. O
        comando está no guia de implantação.
      </p>

      {hosts.map((result) => (
        <Panel
          key={result.role}
          eyebrow={
            result.role === "db" ? "Cópia principal, 14 dias" : "Cópia de segurança, 30 dias"
          }
          title={hostLabels[result.role]}
          description={result.reachable ? result.snapshot.backups.location : undefined}
          bodyClassName="p-0"
        >
          {!result.reachable ? (
            <div className="p-5">
              <EmptyState title="Sentinela sem resposta" />
            </div>
          ) : result.snapshot.backups.copies.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nenhuma cópia aqui" />
            </div>
          ) : (
            <TableWrap className="max-h-96 overflow-y-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Cópia</Th>
                    <Th>Quando</Th>
                    <Th className="text-right">Tamanho</Th>
                    <Th className="text-right">Clientes</Th>
                    <Th>Conferência</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.snapshot.backups.copies.map((copy) => (
                    <Tr key={copy.name}>
                      <Td className="py-2">
                        <Mono>{copy.name}</Mono>
                      </Td>
                      <Td className="py-2 text-xs text-muted-foreground">
                        {formatDateTime(copy.at)}
                      </Td>
                      <Td className="py-2 text-right tabular-nums">{formatBytes(copy.bytes)}</Td>
                      <Td className="py-2 text-right tabular-nums">{copy.clients}</Td>
                      <Td className="py-2">
                        <LevelBadge level={copy.verified ? "ok" : "warning"}>
                          {copy.verified ? "Com checksum" : "Sem checksum"}
                        </LevelBadge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
      ))}
    </div>
  );
}
