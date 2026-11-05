import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { canOperatePanel } from "@/modules/control-panel/ui/access";
import { LevelBadge } from "@/modules/control-panel/ui/shared";
import type { Tenant } from "@/modules/tenants/domain/tenant";
import { setClientStatusFn, updateClientProfileFn } from "@/modules/tenants/admin-server";
import { Section } from "@/modules/tenants/ui/client-ui";

export function ClientProfileTab({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const canOperate = canOperatePanel();
  const [form, setForm] = useState({
    legalName: tenant.legalName,
    tradeName: tenant.tradeName,
    cnpj: tenant.cnpj,
    maxVehicles: String(tenant.vehicleLimit || 1),
  });
  const [saving, setSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState<"active" | "suspended" | null>(null);
  const suspended = tenant.status === "Suspenso" || tenant.status === "Cancelado";

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateClientProfileFn({
        data: {
          slug: tenant.slug,
          profile: {
            legalName: form.legalName,
            tradeName: form.tradeName,
            cnpj: form.cnpj,
            maxVehicles: Number(form.maxVehicles),
          },
        },
      });
      toast.success("Cadastro salvo. O TMS mostra o nome novo em até 30 segundos.");
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    if (!statusTarget) return;
    setSaving(true);
    try {
      await setClientStatusFn({ data: { slug: tenant.slug, status: statusTarget } });
      toast.success(statusTarget === "suspended" ? "Cliente suspenso." : "Cliente reativado.");
      setStatusTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mudar a situação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Section title="Cadastro" description="Vale no Central e no banco do cliente.">
        <form onSubmit={(event) => void save(event)} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="client-legal-name" className="text-xs">
              Razão social
            </Label>
            <Input
              id="client-legal-name"
              required
              value={form.legalName}
              disabled={!canOperate}
              onChange={(event) => update("legalName", event.target.value)}
              className="mt-1.5 rounded-xl"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="client-trade-name" className="text-xs">
              Nome fantasia (aparece no login e no TMS)
            </Label>
            <Input
              id="client-trade-name"
              value={form.tradeName}
              disabled={!canOperate}
              onChange={(event) => update("tradeName", event.target.value)}
              className="mt-1.5 rounded-xl"
            />
          </div>
          <div>
            <Label htmlFor="client-cnpj" className="text-xs">
              CNPJ
            </Label>
            <Input
              id="client-cnpj"
              required
              value={form.cnpj}
              disabled={!canOperate}
              onChange={(event) => update("cnpj", event.target.value)}
              className="mt-1.5 rounded-xl"
            />
          </div>
          <div>
            <Label htmlFor="client-max-vehicles" className="text-xs">
              Limite de veículos
            </Label>
            <Input
              id="client-max-vehicles"
              required
              type="number"
              min={1}
              value={form.maxVehicles}
              disabled={!canOperate}
              onChange={(event) => update("maxVehicles", event.target.value)}
              className="mt-1.5 rounded-xl"
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            O endereço não muda com o nome. Para trocá-lo, use a aba "Endereço e domínios".
          </p>
          {canOperate ? (
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar cadastro"}
              </Button>
            </div>
          ) : null}
        </form>
      </Section>

      <Section title="Situação" description="Suspender bloqueia o acesso de todos; os dados ficam.">
        <div className="space-y-3">
          <LevelBadge level={suspended ? "critical" : "ok"}>{tenant.status}</LevelBadge>
          {canOperate ? (
            suspended ? (
              <Button className="w-full" onClick={() => setStatusTarget("active")}>
                Reativar cliente
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={() => setStatusTarget("suspended")}
              >
                Suspender cliente
              </Button>
            )
          ) : null}
          <p className="text-xs text-muted-foreground">
            Apagar o cliente ainda não tem botão: apaga banco e arquivos e não volta. É feito pelo
            agente, com backup antes. Veja o guia de implantação.
          </p>
        </div>
      </Section>

      <Dialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => (open ? undefined : setStatusTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget === "suspended"
                ? `Suspender ${tenant.name}?`
                : `Reativar ${tenant.name}?`}
            </DialogTitle>
            <DialogDescription>
              {statusTarget === "suspended"
                ? "Todos os usuários do cliente perdem o acesso ao TMS em até um minuto. Nada é apagado, e reativar devolve tudo."
                : "Os usuários voltam a entrar com os mesmos logins e dados."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void changeStatus()} disabled={saving}>
              {saving ? "Salvando..." : statusTarget === "suspended" ? "Suspender" : "Reativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
