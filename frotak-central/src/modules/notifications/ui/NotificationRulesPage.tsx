import { BellRing, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { getSession } from "@/lib/auth";
import type { DistributionReport, TenantOption } from "@/modules/notifications/domain/rule";
import { audienceRoles, sourceOf, triggerLabels } from "@/modules/notifications/domain/catalog";
import {
  emptyRuleDraft,
  type NotificationRule,
  type NotificationRuleDraft,
} from "@/modules/notifications/domain/rule";
import {
  deleteNotificationRuleFn,
  listNotificationRulesFn,
  saveNotificationRuleFn,
  setNotificationRuleActiveFn,
  syncNotificationRulesFn,
} from "@/modules/notifications/server";
import { RuleEditor } from "@/modules/notifications/ui/RuleEditor";

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function reportDistribution(distribution: DistributionReport, success: string) {
  if (distribution.failures.length > 0) {
    toast.warning(
      `${success} Não chegou em: ${distribution.failures.map((failure) => failure.client).join(", ")}. Use "Reenviar para os clientes" quando voltarem.`,
    );
    return;
  }
  toast.success(success);
}

function roleNames(codes: string[]) {
  if (codes.length === 0) return "Todos os usuários";
  return codes
    .map((code) => audienceRoles.find((role) => role.value === code)?.label ?? code)
    .join(", ");
}

/** Regras de notificacao: a equipe FrotaK cria aqui; os usuarios do TMS recebem. */
export function NotificationRulesPage() {
  const role = getSession()?.role;
  const canOperate = role === "super_admin" || role === "operations";
  const isAdmin = role === "super_admin";
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<NotificationRuleDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await listNotificationRulesFn();
      setRules(result.rules);
      setTenants(result.tenants);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageOf(error, "Não foi possível carregar as regras."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tenantName = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants],
  );
  const canTouch = (rule: Pick<NotificationRule, "tenantId">) =>
    canOperate && (rule.tenantId !== null || isAdmin);

  function startNew() {
    const draft = emptyRuleDraft();
    // Operacao (sem ser administrador) so cria regra para um cliente especifico.
    setEditing(isAdmin ? draft : { ...draft, tenantId: tenants[0]?.id ?? null });
  }

  async function save() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      const result = await saveNotificationRuleFn({ data: editing });
      setEditing(null);
      reportDistribution(result.distribution, editing.id ? "Regra atualizada." : "Regra criada.");
      await load();
    } catch (error) {
      toast.error(messageOf(error, "Não foi possível salvar a regra."));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: NotificationRule, active: boolean) {
    setBusyId(rule.id);
    try {
      const result = await setNotificationRuleActiveFn({ data: { id: rule.id, active } });
      reportDistribution(result.distribution, active ? "Regra ativada." : "Regra pausada.");
      await load();
    } catch (error) {
      toast.error(messageOf(error, "Não foi possível mudar a regra."));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rule: NotificationRule) {
    if (
      !window.confirm(
        `Excluir a regra "${rule.name}"? As preferências dos usuários para ela também saem.`,
      )
    ) {
      return;
    }
    setBusyId(rule.id);
    try {
      const result = await deleteNotificationRuleFn({ data: { id: rule.id } });
      reportDistribution(result.distribution, "Regra excluída.");
      await load();
    } catch (error) {
      toast.error(messageOf(error, "Não foi possível excluir a regra."));
    } finally {
      setBusyId(null);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const report = await syncNotificationRulesFn();
      reportDistribution(
        report,
        report.clients > 0
          ? `Regras reenviadas para ${report.clients} ${report.clients === 1 ? "cliente" : "clientes"}.`
          : "Banco único: as regras já valem para todos, não há cópia a enviar.",
      );
    } catch (error) {
      toast.error(messageOf(error, "Não foi possível reenviar as regras."));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Avisos para os clientes"
        title="Notificações"
        description="Regras que geram avisos para os usuários do TMS: no sino, em um aviso na tela e no Windows. Cada usuário escolhe no próprio sistema quais quer receber."
        crumbs={[{ label: "Notificações" }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl"
              onClick={() => void sync()}
              disabled={!canOperate || syncing}
            >
              <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
              Reenviar para os clientes
            </Button>
            <Button
              size="sm"
              className="gap-2 rounded-xl font-bold"
              onClick={startNew}
              disabled={!canOperate}
            >
              <Plus className="size-4" />
              Nova regra
            </Button>
          </>
        }
      />

      <Panel
        title="Regras"
        description={
          canOperate
            ? "Regra para todos os clientes só pode ser criada ou alterada por um administrador do Master."
            : "Seu papel permite apenas consulta."
        }
        bodyClassName="p-0"
      >
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : loadError ? (
          <div className="p-5">
            <EmptyState
              title="Não foi possível carregar"
              description={loadError}
              action={
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Tentar de novo
                </Button>
              }
            />
          </div>
        ) : rules.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhuma regra"
              description="Crie uma regra para avisar os usuários dos clientes, por exemplo quando um frete muda de etapa."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {rules.map((rule) => {
              const source = sourceOf(rule.source);
              return (
                <li
                  key={rule.id}
                  className="flex min-w-0 flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <BellRing className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-sm font-semibold">{rule.name}</p>
                      <StatusPill tone={rule.active ? "success" : "neutral"}>
                        {rule.active ? "Ativa" : "Pausada"}
                      </StatusPill>
                      <StatusPill tone="info" dot={false}>
                        {rule.tenantId
                          ? (tenantName.get(rule.tenantId) ?? "Cliente")
                          : "Todos os clientes"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {source?.label ?? rule.source} · {triggerLabels[rule.triggerKind]} ·{" "}
                      {rule.conditions.length
                        ? `${rule.conditions.length} ${rule.conditions.length === 1 ? "condição" : "condições"}`
                        : "sem condição"}{" "}
                      · {roleNames(rule.audienceRoles)}
                    </p>
                    <p className="mt-1 break-words text-xs text-foreground/80">
                      “{rule.titleTemplate}”
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={rule.active}
                      disabled={!canTouch(rule) || busyId === rule.id}
                      onCheckedChange={(active) => void toggle(rule, active)}
                      aria-label={rule.active ? "Pausar regra" : "Ativar regra"}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Editar regra"
                      disabled={!canTouch(rule)}
                      onClick={() => setEditing({ ...rule })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir regra"
                      disabled={!canTouch(rule) || busyId === rule.id}
                      onClick={() => void remove(rule)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar regra" : "Nova regra"}</DialogTitle>
            <DialogDescription>
              O aviso vai para os usuários do cliente no sino, na tela e no Windows (para quem
              ligou).
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <RuleEditor
              draft={editing}
              tenants={tenants}
              canTouchAllClients={isAdmin}
              onChange={setEditing}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
