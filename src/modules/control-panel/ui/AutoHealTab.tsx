import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EmptyState, Panel, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  hostLabels,
  type HealthLevel,
  type HostResult,
  type HostRole,
  type HostSnapshot,
} from "@/modules/control-panel/domain/control-panel";
import { getEventsFn, getTeamActionsFn, setAutoHealFn } from "@/modules/control-panel/server";
import { formatAgo, formatDateTime, toEpoch } from "@/modules/control-panel/ui/format";
import { canOperatePanel } from "@/modules/control-panel/ui/access";
import {
  ErrorBlock,
  LevelBadge,
  LevelIcon,
  LoadingBlock,
  Mono,
} from "@/modules/control-panel/ui/shared";

const eventLevel: Record<string, HealthLevel> = {
  info: "ok",
  warning: "warning",
  critical: "critical",
};

const actionLabels: Record<string, string> = {
  "master.infra_restart": "Reiniciou",
  "master.infra_autoheal": "Mudou o auto-heal",
  "master.database_rows_read": "Leu dados de tabela",
};

function HostHeal({ role, snapshot }: { role: HostRole; snapshot: HostSnapshot }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const canOperate = canOperatePanel();
  const { heal } = snapshot;
  const id = `autoheal-${role}`;

  async function toggle(enabled: boolean) {
    setSaving(true);
    try {
      await setAutoHealFn({ data: { role, enabled } });
      toast.success(enabled ? "Auto-heal ligado." : "Auto-heal pausado. Falhas só serão avisadas.");
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mudar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      eyebrow={`Verifica a cada ${heal.intervalSeconds} s, última ${formatAgo(heal.lastCycleAt)}`}
      title={hostLabels[role]}
      actions={
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={heal.enabled}
            disabled={!canOperate || saving}
            onCheckedChange={(checked) => void toggle(checked)}
          />
          <Label htmlFor={id}>{heal.enabled ? "Ligado" : "Pausado"}</Label>
        </div>
      }
      bodyClassName="p-0"
    >
      <TableWrap>
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <Th>O que vigia</Th>
              <Th>Quando age</Th>
              <Th>O que faz</Th>
              <Th>Limite</Th>
            </tr>
          </thead>
          <tbody>
            {heal.rules.map((rule) => (
              <Tr key={rule.target}>
                <Td className="font-semibold">{rule.target}</Td>
                <Td className="text-xs text-muted-foreground">{rule.watches}</Td>
                <Td className="text-xs">{rule.action}</Td>
                <Td className="text-xs text-muted-foreground">{rule.limit}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Panel>
  );
}

export function AutoHealTab({ hosts }: { hosts: HostResult[] }) {
  const events = useQuery({
    queryKey: ["panel", "events"],
    queryFn: () => getEventsFn(),
    refetchInterval: 20_000,
  });
  const actions = useQuery({
    queryKey: ["panel", "team-actions"],
    queryFn: () => getTeamActionsFn(),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
        O auto-heal age sozinho, com limite de tentativas: se o conserto não resolver, ele para,
        avisa aqui e espera uma pessoa. Só existe este aviso no painel: ainda não há e-mail nem
        WhatsApp.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        {hosts.map((result) =>
          result.reachable ? (
            <HostHeal key={result.role} role={result.role} snapshot={result.snapshot} />
          ) : (
            <Panel key={result.role} title={hostLabels[result.role]}>
              <EmptyState title="Sentinela sem resposta" />
            </Panel>
          ),
        )}
      </div>

      <Panel
        eyebrow="Histórico"
        title="O que aconteceu"
        description="Consertos, alertas e resoluções das duas VPS. Fica guardado por 90 dias."
        bodyClassName="p-0"
      >
        {events.isLoading ? (
          <LoadingBlock />
        ) : events.isError ? (
          <div className="p-5">
            <ErrorBlock error={events.error} onRetry={() => void events.refetch()} />
          </div>
        ) : events.data?.length ? (
          <TableWrap className="max-h-[60vh] overflow-y-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>VPS</Th>
                  <Th>O que aconteceu</Th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((event) => (
                  <Tr key={`${event.host}-${event.id}`}>
                    <Td className="py-2 text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(event.ts)}
                    </Td>
                    <Td className="py-2 text-xs whitespace-nowrap">{hostLabels[event.host]}</Td>
                    <Td className="py-2">
                      <span className="flex items-start gap-2">
                        <LevelIcon level={eventLevel[event.level] ?? "idle"} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{event.title}</span>
                          {event.detail ? (
                            <span className="block text-xs break-all text-muted-foreground">
                              {event.detail}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <div className="p-5">
            <EmptyState
              title="Nada aconteceu ainda"
              description="Quando o auto-heal agir ou um alerta abrir, aparece aqui."
            />
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Auditoria"
        title="O que a equipe fez neste painel"
        description="Reinícios, mudanças no auto-heal e leituras de dados de tabela."
        bodyClassName="p-0"
      >
        {actions.isLoading ? (
          <LoadingBlock />
        ) : actions.isError ? (
          <div className="p-5">
            <ErrorBlock error={actions.error} onRetry={() => void actions.refetch()} />
          </div>
        ) : actions.data?.length ? (
          <TableWrap className="max-h-96 overflow-y-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Quem</Th>
                  <Th>Ação</Th>
                  <Th>Em quê</Th>
                </tr>
              </thead>
              <tbody>
                {actions.data.map((action) => (
                  <Tr key={action.id}>
                    <Td className="py-2 text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(toEpoch(action.at))}
                    </Td>
                    <Td className="py-2 text-xs">{action.actorEmail}</Td>
                    <Td className="py-2 text-xs">
                      <LevelBadge level="idle">
                        {actionLabels[action.action] ?? action.action}
                      </LevelBadge>
                    </Td>
                    <Td className="py-2">
                      <Mono>{action.target}</Mono>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <div className="p-5">
            <EmptyState title="Nenhuma ação registrada" />
          </div>
        )}
      </Panel>
    </div>
  );
}
