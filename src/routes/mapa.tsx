import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Layers, Radio, Search, Truck, Building2, TriangleAlert, User } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatusPill, Timeline } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { mapPins } from "@/lib/mock";

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa Global · FrotaK Master" },
      {
        name: "description",
        content: "Mapa global com fretes, motoristas, empresas e alertas em tempo real.",
      },
      { property: "og:title", content: "Mapa Global · FrotaK Master" },
      {
        property: "og:description",
        content: "Visualização geográfica da operação nacional da FrotaK.",
      },
    ],
  }),
  component: MapaGlobal,
});

const kindMeta = {
  frete: { icon: Truck, color: "var(--chart-1)", label: "Frete" },
  empresa: { icon: Building2, color: "var(--chart-2)", label: "Empresa" },
  alerta: { icon: TriangleAlert, color: "var(--destructive)", label: "Alerta" },
  motorista: { icon: User, color: "var(--chart-3)", label: "Motorista" },
} as const;

function MapaGlobal() {
  const [active, setActive] = useState<(typeof mapPins)[number] | null>(mapPins[0]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="9.521 ativos rastreados · latência 1,2 s"
        title="Mapa Global"
        description="Cobertura nacional em tempo real com clusters, filtros por camada e painel de inspeção."
        crumbs={[{ label: "Mapa Global" }]}
        actions={
          <StatusPill tone="success">
            <Radio className="size-3" /> Streaming
          </StatusPill>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <Panel eyebrow="Camadas" title="Filtros" bodyClassName="p-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar placa ou cliente" className="rounded-xl pl-9" />
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(kindMeta).map(([k, m]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-xl border border-border bg-elevated/50 px-3 py-2.5"
              >
                <Label className="flex items-center gap-2 text-xs font-bold">
                  <span className="size-2 rounded-full" style={{ background: m.color }} />
                  {m.label}s
                </Label>
                <Switch defaultChecked />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <Label className="flex items-center gap-2 text-xs font-bold">
                <Layers className="size-3.5 text-primary" /> Clusters
              </Label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <Label className="text-xs font-bold">Rotas planejadas</Label>
              <Switch />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <Label className="text-xs font-bold">Cercas eletrônicas</Label>
              <Switch defaultChecked />
            </div>
          </div>
        </Panel>

        <section className="panel relative min-h-[560px] overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: "var(--elevated)",
              backgroundImage:
                "linear-gradient(color-mix(in oklab, var(--border) 90%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 90%, transparent) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="absolute inset-0 surface-gradient" />
          <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
            <StatusPill tone="neutral" dot={false}>
              Brasil · visão nacional
            </StatusPill>
            <StatusPill tone="success">3.204 fretes ativos</StatusPill>
          </div>
          {mapPins.map((p) => {
            const m = kindMeta[p.kind as keyof typeof kindMeta];
            return (
              <button
                key={p.id}
                onClick={() => setActive(p)}
                className="absolute z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2 transition hover:scale-110"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  background: `color-mix(in oklab, ${m.color} 22%, transparent)`,
                  borderColor: m.color,
                  boxShadow:
                    active?.id === p.id
                      ? `0 0 0 6px color-mix(in oklab, ${m.color} 18%, transparent)`
                      : undefined,
                }}
                aria-label={p.label}
              >
                <m.icon className="size-4" style={{ color: m.color }} />
              </button>
            );
          })}
          <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-1.5">
            {["+", "−"].map((z) => (
              <button
                key={z}
                className="icon-tile size-9 bg-surface text-sm font-bold"
                aria-label={`Zoom ${z}`}
              >
                {z}
              </button>
            ))}
          </div>
        </section>

        <Panel eyebrow="Inspeção" title="Detalhes" bodyClassName="p-4">
          {active && (
            <>
              <p className="text-sm font-bold">{active.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{active.info}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  { l: "Tipo", v: kindMeta[active.kind as keyof typeof kindMeta].label },
                  { l: "Última leitura", v: "há 12 s" },
                  { l: "Precisão", v: "±4 m" },
                  { l: "Bateria", v: "82%" },
                ].map((i) => (
                  <div key={i.l} className="rounded-xl border border-border bg-elevated/50 p-2.5">
                    <p className="eyebrow">{i.l}</p>
                    <p className="mt-1 text-xs font-bold">{i.v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Timeline
                  items={[
                    { title: "Posição atualizada", meta: "há 12 s" },
                    { title: "Entrou na cerca do cliente", meta: "13:41", tone: "info" },
                    { title: "Parada não programada", meta: "12:58", tone: "warning" },
                  ]}
                />
              </div>
              <Button className="mt-4 w-full rounded-xl font-bold">Abrir ficha completa</Button>
            </>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
