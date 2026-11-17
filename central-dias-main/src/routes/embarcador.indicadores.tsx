import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, Leaf, Radar, Timer } from "lucide-react";
import { FreightDetailSheet } from "@/components/shipper/FreightDetailSheet";
import { Card, Kpi, PageTitle, Pill, formatDateTime } from "@/components/shipper/ShipperUi";
import {
  computeKpis,
  computeScorecards,
  formatDuration,
  isDelivered,
} from "@/lib/shipper/analytics";
import { useShipperPortal } from "@/lib/shipper/client";
import { DWELL_LIMIT_MIN } from "@/lib/shipper/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/indicadores")({
  component: ShipperIndicatorsPage,
});

function Bar({
  label,
  value,
  max,
  display,
  tone = "primary",
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: "primary" | "warning" | "success";
}) {
  const width = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[140px_1fr_70px] items-center gap-3 text-[12px] sm:grid-cols-[180px_1fr_80px]">
      <span className="truncate font-semibold">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-2/60">
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="text-right font-bold">{display}</span>
    </div>
  );
}

function ShipperIndicatorsPage() {
  const { data } = useShipperPortal();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const kpis = useMemo(() => (data ? computeKpis(data) : null), [data]);
  const cards = useMemo(() => (data ? computeScorecards(data) : []), [data]);
  if (!data || !kpis) return null;

  const withDwell = data.freights.filter(
    (f) => f.loadingDwellMin !== undefined || f.unloadingDwellMin !== undefined,
  );
  const overLimit = data.freights
    .flatMap((f) => [
      f.loadingDwellMin !== undefined && f.loadingDwellMin > DWELL_LIMIT_MIN
        ? { freight: f, where: "Carregamento", min: f.loadingDwellMin }
        : null,
      f.unloadingDwellMin !== undefined && f.unloadingDwellMin > DWELL_LIMIT_MIN
        ? { freight: f, where: "Descarga", min: f.unloadingDwellMin }
        : null,
    ])
    .filter((item): item is NonNullable<typeof item> => !!item)
    .sort((a, b) => b.min - a.min);
  const destinations = new Map<string, number[]>();
  for (const f of data.freights) {
    if (f.unloadingDwellMin === undefined) continue;
    const key = f.destinationName ?? f.destination ?? "Sem destino";
    destinations.set(key, [...(destinations.get(key) ?? []), f.unloadingDwellMin]);
  }
  const destinationAvg = [...destinations.entries()]
    .map(([name, values]) => ({
      name,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    }))
    .sort((a, b) => b.avg - a.avg);
  const maxDest = Math.max(0, ...destinationAvg.map((d) => d.avg));

  const co2Cards = cards.filter((card) => card.co2Kg > 0).sort((a, b) => b.co2Kg - a.co2Kg);
  const maxCo2 = Math.max(0, ...co2Cards.map((card) => card.co2Kg));
  const delivered = data.freights.filter(isDelivered);
  const co2PerTrip = delivered.filter((f) => f.co2Kg).length
    ? Math.round(
        delivered.reduce((s, f) => s + (f.co2Kg ?? 0), 0) / delivered.filter((f) => f.co2Kg).length,
      )
    : undefined;

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));
    return date;
  });
  const perDay = days.map((day) => {
    const next = day.getTime() + 86_400_000;
    return {
      day,
      count: delivered.filter((f) => {
        const t = f.deliveredAt ? new Date(f.deliveredAt).getTime() : 0;
        return t >= day.getTime() && t < next;
      }).length,
    };
  });
  const maxDay = Math.max(1, ...perDay.map((d) => d.count));
  const selected = data.freights.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Indicadores"
        title="Tempo, entregas e emissões"
        subtitle="Calculados com os dados das transportadoras conectadas, nos últimos 90 dias."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Espera média na descarga"
          value={formatDuration(kpis.avgUnloadingDwellMin)}
          hint={`${withDwell.length} carga(s) medidas`}
          icon={Timer}
        />
        <Kpi
          label="Paradas acima de 5 h"
          value={kpis.dwellOverLimit}
          hint="Podem gerar estadia"
          icon={Timer}
          tone={kpis.dwellOverLimit ? "warning" : "good"}
        />
        <Kpi
          label="CO₂ em 30 dias"
          value={`${kpis.co2Kg30d.toLocaleString("pt-BR")} kg`}
          hint={co2PerTrip ? `${co2PerTrip} kg por viagem, em média` : "Sem dado de diesel ainda"}
          icon={Leaf}
          tone="good"
        />
        <Kpi
          label="Cargas com rastreio"
          value={`${kpis.trackedPct}%`}
          hint="Das cargas em andamento"
          icon={Radar}
          tone={kpis.trackedPct >= 80 ? "good" : "warning"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-primary" />
            <h2 className="text-[15px] font-extrabold">Espera na descarga por destino</h2>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Onde os caminhões mais esperam. Ajuda a cobrar o cliente final ou reorganizar a doca.
          </p>
          <div className="mt-4 space-y-2.5">
            {destinationAvg.length ? (
              destinationAvg.map((d) => (
                <Bar
                  key={d.name}
                  label={d.name}
                  value={d.avg}
                  max={maxDest}
                  display={formatDuration(d.avg)}
                  tone={d.avg > DWELL_LIMIT_MIN ? "warning" : "primary"}
                />
              ))
            ) : (
              <p className="text-[13px] text-muted-foreground">Ainda sem descargas medidas.</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-warning" />
            <h2 className="text-[15px] font-extrabold">Paradas acima de 5 horas</h2>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            A lei do transporte de cargas (Lei 11.442) prevê estadia quando a espera para carregar
            ou descarregar passa de 5 horas.
          </p>
          {overLimit.length ? (
            <ul className="mt-3 divide-y divide-border/70">
              {overLimit.map((item) => (
                <li key={`${item.freight.id}-${item.where}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.freight.id)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-[13px]"
                  >
                    <span>
                      <span className="block font-bold">
                        {item.freight.plate} · {item.freight.carrierName}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {item.where} ·{" "}
                        {item.where === "Descarga"
                          ? item.freight.destinationName
                          : item.freight.originName}{" "}
                        · {formatDateTime(item.freight.startedAt)}
                      </span>
                    </span>
                    <Pill tone="warning">{formatDuration(item.min)}</Pill>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-muted-foreground">
              Nenhuma parada passou de 5 horas.
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Leaf className="size-4 text-success" />
            <h2 className="text-[15px] font-extrabold">Emissões por transportadora</h2>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Calculado pelo diesel que a transportadora abasteceu durante as suas viagens ({"2,6"} kg
            de CO₂ por litro). Serve para o relatório ESG da cadeia.
          </p>
          <div className="mt-4 space-y-2.5">
            {co2Cards.length ? (
              co2Cards.map((card) => (
                <Bar
                  key={card.carrier.id}
                  label={card.carrier.name}
                  value={card.co2Kg}
                  max={maxCo2}
                  display={`${card.co2Kg.toLocaleString("pt-BR")} kg`}
                  tone="success"
                />
              ))
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Ainda sem abastecimentos nas viagens entregues.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-[15px] font-extrabold">Entregas por dia</h2>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">Últimos 14 dias.</p>
          <div className="mt-4 flex h-40 items-end gap-1.5">
            {perDay.map((d) => (
              <div key={d.day.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-muted-foreground">{d.count || ""}</span>
                <span
                  className="w-full rounded-t-lg bg-primary/80"
                  style={{ height: `${(d.count / maxDay) * 110 + 2}px` }}
                />
                <span className="text-[9px] text-muted-foreground">{d.day.getDate()}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <FreightDetailSheet freight={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
