import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { HostRole } from "@/modules/control-panel/domain/control-panel";
import { hostLabels } from "@/modules/control-panel/domain/control-panel";
import { getLogsFn, restartTargetFn } from "@/modules/control-panel/server";
import { ErrorBlock, LoadingBlock, RangeFilter } from "@/modules/control-panel/ui/shared";

export type PanelTarget = {
  role: HostRole;
  kind: "container" | "service";
  name: string;
  clientSlug?: string | null;
};

const LOG_SIZES = [
  { hours: 100, label: "100 linhas" },
  { hours: 200, label: "200 linhas" },
  { hours: 500, label: "500 linhas" },
];

export function LogsSheet({
  target,
  onClose,
}: {
  target: PanelTarget | null;
  onClose: () => void;
}) {
  const [lines, setLines] = useState(200);
  const logs = useQuery({
    queryKey: ["panel", "logs", target?.role, target?.kind, target?.name, lines],
    queryFn: () =>
      getLogsFn({
        data: {
          role: target!.role,
          kind: target!.kind,
          name: target!.name,
          lines,
        },
      }),
    enabled: Boolean(target),
    gcTime: 0,
  });

  return (
    <Sheet open={Boolean(target)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="break-all">Logs de {target?.name}</SheetTitle>
          <SheetDescription>
            {target ? hostLabels[target.role] : ""}. Senhas e tokens são retirados antes de sair da
            VPS.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4">
          <RangeFilter hours={lines} onChange={setLines} ranges={LOG_SIZES} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void logs.refetch()}
            disabled={logs.isFetching}
          >
            <RefreshCw className={logs.isFetching ? "size-4 animate-spin" : "size-4"} />
            Atualizar
          </Button>
        </div>
        <div className="min-h-0 flex-1 px-4 pb-4">
          {logs.isLoading ? (
            <LoadingBlock label="Buscando logs..." />
          ) : logs.isError ? (
            <ErrorBlock error={logs.error} onRetry={() => void logs.refetch()} />
          ) : (
            <pre className="h-full overflow-auto rounded-2xl border border-border bg-elevated/40 p-4 font-mono text-[11px] leading-relaxed whitespace-pre">
              {logs.data?.length ? logs.data.join("\n") : "Sem linhas de log."}
            </pre>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function restartEffect(target: PanelTarget) {
  if (target.name === "frotak-db") {
    return "O Postgres atende todos: o Central e todos os clientes ficam fora do ar até ele voltar, normalmente menos de um minuto.";
  }
  if (target.name === "frotak-kong") {
    return "Todas as APIs ficam fora do ar por alguns segundos, de todos os clientes.";
  }
  if (target.name.startsWith("realtime")) {
    return "As atualizações em tempo real de todos os clientes param por alguns segundos.";
  }
  if (target.name === "frotak-app@master") {
    return "Este painel sai do ar por alguns segundos.";
  }
  if (target.name === "frotak-app@tms") {
    return "O TMS de todos os clientes fica fora do ar por alguns segundos.";
  }
  if (target.name === "caddy") {
    return "O acesso pela internet a tudo cai por alguns segundos, inclusive este painel.";
  }
  if (target.name.startsWith("wg-quick")) {
    return "A ligação entre as duas VPS cai por alguns segundos: os sistemas ficam sem acesso ao banco nesse tempo.";
  }
  if (target.clientSlug) {
    return `Afeta só o cliente ${target.clientSlug}, por alguns segundos.`;
  }
  return "O serviço fica indisponível por alguns segundos.";
}

export function RestartDialog({
  target,
  onClose,
}: {
  target: PanelTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const needsTyping = target?.name === "frotak-db";

  function close() {
    setConfirmation("");
    onClose();
  }

  async function restart() {
    if (!target) return;
    setSaving(true);
    try {
      await restartTargetFn({ data: { role: target.role, kind: target.kind, name: target.name } });
      toast.success(`${target.name} reiniciado.`);
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reiniciar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-all">Reiniciar {target?.name}?</DialogTitle>
          <DialogDescription>
            {target ? restartEffect(target) : ""} A ação fica registrada na auditoria.
          </DialogDescription>
        </DialogHeader>
        {needsTyping ? (
          <div className="space-y-2">
            <Label htmlFor="restart-confirmation">Digite frotak-db para confirmar</Label>
            <Input
              id="restart-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => void restart()}
            disabled={saving || (needsTyping && confirmation !== "frotak-db")}
          >
            {saving ? "Reiniciando..." : "Reiniciar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
