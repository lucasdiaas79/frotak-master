import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { FrotakEmptyState, FrotakMetric, FrotakSection } from "@/components/frotak/FrotakPage";
import { cn } from "@/lib/utils";
import { driverScore, listDrivers } from "@/modules/driver-ops/infrastructure/opsRepository";
import { LoadError, StatusBadge, money, num, useLoad } from "./shared";

export function PerformanceTab() {
  const drivers = useLoad(listDrivers, []);
  const from = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }, []);
  const scores = useLoad(async () => {
    const list = drivers.data ?? [];
    const res = await Promise.all(list.map((d) => driverScore(d.id, from).catch(() => null)));
    return list
      .map((d, i) => ({ driver: d, score: res[i] }))
      .filter((r) => r.score)
      .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
  }, [drivers.data, from]);
  const [open, setOpen] = useState<string | null>(null);
  const rows = scores.data ?? [];
  const prize = rows.reduce((s, r) => s + (r.score?.tier?.amount ?? 0), 0);
  const avg = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.score?.total ?? 0), 0) / rows.length)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <FrotakMetric
          label="Nota média do mês"
          value={rows.length ? avg : "--"}
          icon={<Trophy className="size-4" />}
        />
        <FrotakMetric
          label="Motoristas na faixa de prêmio"
          value={rows.filter((r) => r.score?.tier).length}
          tone="positive"
        />
        <FrotakMetric
          label="Prêmio previsto"
          value={money(prize)}
          detail="Se o mês fechasse hoje"
          tone="warning"
        />
      </div>
      <LoadError error={scores.error ?? drivers.error} />
      <FrotakSection
        title="Ranking do mês"
        description="Nota com dados que a FrotaK já tem: consumo tanque cheio a tanque cheio, velocidade do rastreador, pontualidade nas janelas, checklist, documentos e canhotos. Linha sem dado fica de fora do cálculo."
        contentClassName="p-0"
      >
        {!rows.length && !scores.loading ? (
          <FrotakEmptyState
            title="Sem notas ainda"
            description="A nota aparece quando o motorista tem jornadas, entregas ou abastecimentos no mês."
          />
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {rows.map((r, i) => (
              <li key={r.driver.id}>
                <button
                  onClick={() => setOpen(open === r.driver.id ? null : r.driver.id)}
                  className="flex w-full items-center gap-4 px-5 py-3 text-left text-xs hover:bg-muted/40"
                >
                  <span className="w-6 text-sm tabular-nums text-muted-foreground">{i + 1}º</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{r.driver.name}</span>
                    <span className="block text-muted-foreground">
                      {r.score?.kmPerLiter != null
                        ? `${num(r.score.kmPerLiter, 2)} km/l`
                        : "km/l sem dado"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-xl tabular-nums",
                      (r.score?.total ?? 0) >= 70 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {r.score?.total}
                  </span>
                  {r.score?.tier ? (
                    <StatusBadge tone="ok">
                      {r.score.tier.label} · {money(r.score.tier.amount)}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="muted">Sem prêmio</StatusBadge>
                  )}
                </button>
                {open === r.driver.id ? (
                  <ul className="grid gap-2 bg-muted/25 px-5 py-3 text-xs sm:grid-cols-2">
                    {r.score?.lines.map((l) => (
                      <li key={l.key} className={cn(!l.available && "opacity-60")}>
                        <span className="font-medium">
                          {l.label}: {l.available ? `${l.points}/${l.max}` : "sem dado"}
                        </span>
                        <span className="block text-muted-foreground">{l.why}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </FrotakSection>
    </div>
  );
}
