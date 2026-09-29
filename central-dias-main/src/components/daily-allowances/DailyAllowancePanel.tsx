import { Banknote, Check, Clock3, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getFinancialAccess, hasFinancialPermission } from "@/lib/financial/phase2";
import {
  getDailyAllowanceSettings,
  listDriverDailyAllowances,
  reviewDriverDailyAllowance,
  saveDailyAllowanceSettings,
  type DailyAllowanceSettings,
  type DailyAllowanceStatus,
  type DriverDailyAllowance,
} from "@/lib/services/daily-allowances";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const statusLabel: Record<DailyAllowanceStatus, string> = {
  submitted: "Aguardando aprovacao",
  approved: "Aprovada",
  rejected: "Reprovada",
  cancelled: "Cancelada",
};

export function DailyAllowancePanel() {
  const [settings, setSettings] = useState<DailyAllowanceSettings | null>(null);
  const [items, setItems] = useState<DriverDailyAllowance[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string>();
  const [dailyAmount, setDailyAmount] = useState("0");
  const [paymentDueDays, setPaymentDueDays] = useState("5");
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    const access = await getFinancialAccess();
    const config = await getDailyAllowanceSettings(access.workspaceId);
    if (!config.available) {
      setSettings(config);
      return;
    }
    const allowances = await listDriverDailyAllowances(access.workspaceId);
    setSettings(config);
    setItems(allowances);
    setCanManage(hasFinancialPermission(access, "financial.create"));
    setDailyAmount(String(config.dailyAmount));
    setPaymentDueDays(String(config.paymentDueDays));
    setEnabled(config.enabled);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((error) => {
        if (active) console.warn("[daily-allowances] unavailable", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === "submitted").length,
    [items],
  );

  if (loading || !settings?.available) return null;

  const saveSettings = async () => {
    const parsedAmount = Number(dailyAmount.replace(",", "."));
    const parsedDays = Number(paymentDueDays);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Informe um valor de diaria valido.");
      return;
    }
    if (enabled && parsedAmount <= 0) {
      toast.error("Defina o valor da diaria antes de ativar.");
      return;
    }
    if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 365) {
      toast.error("Informe um prazo entre 0 e 365 dias.");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveDailyAllowanceSettings({
        workspaceId: settings.workspaceId,
        enabled,
        dailyAmount: parsedAmount,
        paymentDueDays: parsedDays,
      });
      setSettings(saved);
      toast.success("Configuracao de diarias salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  };

  const review = async (item: DriverDailyAllowance, action: "approve" | "reject") => {
    setReviewingId(item.id);
    try {
      await reviewDriverDailyAllowance({ allowanceId: item.id, action });
      await load();
      toast.success(
        action === "approve" ? "Diaria aprovada e enviada ao financeiro." : "Diaria reprovada.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel revisar a diaria.");
    } finally {
      setReviewingId(undefined);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface/70">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Diarias do tiro longo</p>
            {pendingCount > 0 ? <Badge>{pendingCount} pendentes</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            O motorista informa a quantidade; a aprovacao gera A Pagar e custo no DRE.
          </p>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <Label htmlFor="daily-allowance-value" className="text-xs">
                Valor unitario
              </Label>
              <Input
                id="daily-allowance-value"
                inputMode="decimal"
                value={dailyAmount}
                onChange={(event) => setDailyAmount(event.target.value)}
                className="h-9 w-32"
              />
            </label>
            <label className="space-y-1">
              <Label htmlFor="daily-allowance-due" className="text-xs">
                Vence em dias
              </Label>
              <Input
                id="daily-allowance-due"
                type="number"
                min={0}
                max={365}
                value={paymentDueDays}
                onChange={(event) => setPaymentDueDays(event.target.value)}
                className="h-9 w-24"
              />
            </label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3">
              <Switch id="daily-allowance-enabled" checked={enabled} onCheckedChange={setEnabled} />
              <Label htmlFor="daily-allowance-enabled" className="text-xs">
                Ativa
              </Label>
            </div>
            <Button size="sm" onClick={saveSettings} disabled={saving}>
              <Settings2 className="size-4" />
              {saving ? "Salvando" : "Salvar"}
            </Button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          Nenhuma diaria informada pelos motoristas.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">{item.driverName}</p>
                  <Badge variant="outline">{item.vehiclePlate}</Badge>
                  <Badge variant={item.status === "approved" ? "secondary" : "outline"}>
                    {statusLabel[item.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <Clock3 className="mr-1 inline size-3.5" />
                  {dateTime.format(new Date(item.submittedAt))} · {item.freightCount} fretes no
                  ciclo
                </p>
                {item.notes ? (
                  <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
                ) : null}
              </div>
              <div className="text-sm lg:text-right">
                <p className="text-xs text-muted-foreground">Quantidade</p>
                <p className="font-semibold">
                  {item.quantity} x {money.format(item.unitAmount)}
                </p>
              </div>
              <div className="text-sm lg:text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold">{money.format(item.totalAmount)}</p>
              </div>
              {canManage && item.status === "submitted" ? (
                <div className="flex gap-2 lg:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review(item, "reject")}
                    disabled={reviewingId === item.id}
                    aria-label={`Reprovar diaria de ${item.driverName}`}
                  >
                    <X className="size-4" />
                    Reprovar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => review(item, "approve")}
                    disabled={reviewingId === item.id}
                    aria-label={`Aprovar diaria de ${item.driverName}`}
                  >
                    <Check className="size-4" />
                    Aprovar
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground lg:text-right">
                  {item.financialDocumentId ? "Lancada no financeiro" : "Sem titulo financeiro"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
