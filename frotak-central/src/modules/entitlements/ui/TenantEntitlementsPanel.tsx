import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Lock } from "lucide-react";
import { StatusPill } from "@/components/kit/ui-kit";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  modulesOf,
  products,
  type ModuleCode,
  type ModuleDefinition,
  type ProductCode,
} from "@/modules/catalog/domain/catalog";
import {
  hasModule,
  hasProduct,
  type TenantEntitlements,
} from "@/modules/entitlements/domain/entitlements";
import { changeTenantEntitlementFn } from "@/modules/entitlements/server";
import { isTenantOperational, type TenantStatus } from "@/modules/tenants/domain/tenant";

type PendingKey = `product:${ProductCode}` | `module:${ModuleCode}`;

/**
 * Liga e desliga produtos e modulos de um cliente. A mudanca vale em segundos no app
 * cliente (menu e bloqueio no banco); desligar nao apaga dados.
 */
export function TenantEntitlementsPanel({
  tenantId,
  tenantStatus,
  entitlements,
  canOperate,
  onChange,
}: {
  tenantId: string;
  tenantStatus: TenantStatus;
  entitlements: TenantEntitlements;
  canOperate: boolean;
  onChange: (next: TenantEntitlements) => void;
}) {
  const [pending, setPending] = useState<PendingKey | null>(null);

  async function change(
    key: PendingKey,
    input: { kind: "product" | "module"; code: string; enabled: boolean },
    label: string,
  ) {
    setPending(key);
    try {
      const next = await changeTenantEntitlementFn({ data: { tenantId, ...input } });
      onChange(next);
      toast.success(`${label} ${input.enabled ? "liberado" : "bloqueado"} para este cliente.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a liberação.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-3">
      {!isTenantOperational(tenantStatus) ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            Cliente <strong>{tenantStatus.toLowerCase()}</strong>: as liberações ficam guardadas,
            mas o acesso só vale com o cliente ativo ou em trial.
          </p>
        </div>
      ) : null}

      {!canOperate ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-elevated/40 p-3 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          Seu papel no Master permite apenas consulta.
        </div>
      ) : null}

      {products.map((product) => {
        const productOn = hasProduct(entitlements, product.code);
        const productKey: PendingKey = `product:${product.code}`;
        const productModules = modulesOf(product.code);

        return (
          <section key={product.code} className="rounded-2xl border border-border bg-elevated/30">
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="icon-tile size-9 shrink-0 text-primary">
                  <Boxes className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{product.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{product.description}</p>
                </div>
              </div>
              <Switch
                checked={productOn}
                disabled={!canOperate || pending !== null}
                aria-label={`${productOn ? "Bloquear" : "Liberar"} ${product.name}`}
                onCheckedChange={(enabled) =>
                  change(productKey, { kind: "product", code: product.code, enabled }, product.name)
                }
              />
            </div>

            {productModules.length ? (
              <ul className="grid gap-px border-t border-border/70">
                {productModules.map((module) => (
                  <ModuleRow
                    key={module.code}
                    module={module}
                    checked={hasModule(entitlements, module.code)}
                    productOn={productOn}
                    disabled={!canOperate || pending !== null || !productOn || module.core}
                    saving={pending === `module:${module.code}`}
                    onToggle={(enabled) =>
                      change(
                        `module:${module.code}`,
                        { kind: "module", code: module.code, enabled },
                        module.name,
                      )
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
                Produto sem módulos separados: liberar o produto libera tudo.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ModuleRow({
  module,
  checked,
  productOn,
  disabled,
  saving,
  onToggle,
}: {
  module: ModuleDefinition;
  checked: boolean;
  productOn: boolean;
  disabled: boolean;
  saving: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 bg-background/40 px-4 py-3",
        !productOn && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{module.name}</p>
          {module.core ? (
            <StatusPill tone="neutral" dot={false}>
              Base
            </StatusPill>
          ) : null}
          {saving ? <span className="text-[11px] text-muted-foreground">Salvando...</span> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{module.description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={`${checked ? "Bloquear" : "Liberar"} ${module.name}`}
        onCheckedChange={onToggle}
      />
    </li>
  );
}
