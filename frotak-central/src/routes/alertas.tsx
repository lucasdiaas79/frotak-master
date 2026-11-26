import { createFileRoute } from "@tanstack/react-router";
import { Bell, Filter, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { KpiCard, PageHeader, Panel, StatusPill, Timeline, toneFor } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { alerts } from "@/lib/mock";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas · FrotaK Master" },
      {
        name: "description",
        content:
          "Central de alertas operacionais, financeiros e de plataforma por prioridade e status.",
      },
      { property: "og:title", content: "Alertas · FrotaK Master" },
      {
        property: "og:description",
        content: "Central unificada de alertas por prioridade, módulo e status.",
      },
    ],
  }),
  component: Alertas,
});

function Alertas() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="9 alertas abertos · 2 críticos"
        title="Central de Alertas"
        description="Eventos que exigem intervenção humana, priorizados por criticidade e impacto no cliente."
        crumbs={[{ label: "Alertas" }]}
        actions={
          <Button size="sm" className="gap-2 rounded-xl font-bold">
            <Bell className="size-4" /> Regras de alerta
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Críticos" value="2" delta="+1" trend="down" index={0} />
        <KpiCard label="Altos" value="3" delta="estável" trend="flat" index={1} />
        <KpiCard label="Em análise" value="3" delta="-2" trend="up" index={2} />
        <KpiCard label="Resolvidos hoje" value="14" delta="+6" trend="up" index={3} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          eyebrow="Fila de trabalho"
          title="Alertas ativos"
          actions={
            <Tabs defaultValue="todos">
              <TabsList className="rounded-xl">
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="crit">Críticos</TabsTrigger>
                <TabsTrigger value="res">Resolvidos</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por ID, cliente ou título" className="rounded-xl pl-9" />
            </div>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl">
              <Filter className="size-4" /> Filtros
            </Button>
          </div>
          <ul className="mt-4 space-y-2.5">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-elevated/50 p-4 transition hover:border-primary/30 sm:flex sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-muted-foreground">
                      {a.id}
                    </span>
                    <StatusPill tone={toneFor(a.severity)}>{a.severity}</StatusPill>
                    <StatusPill tone="neutral" dot={false}>
                      {a.module}
                    </StatusPill>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-bold">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.client} · {a.when}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill tone={toneFor(a.status)}>{a.status}</StatusPill>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    Tratar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel eyebrow="Categorias" title="Distribuição">
            <ul className="space-y-2.5">
              {[
                { c: "Operações", n: 3 },
                { c: "Plataforma", n: 2 },
                { c: "Financeiro", n: 1 },
                { c: "Integrações", n: 1 },
                { c: "Segurança", n: 2 },
              ].map((i) => (
                <li
                  key={i.c}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"
                >
                  {i.c}
                  <span className="text-muted-foreground">{i.n}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel eyebrow="Histórico" title="Últimas resoluções">
            <Timeline
              items={[
                { title: "Token de integração renovado", meta: "14:02 · João Bastos" },
                {
                  title: "Tentativas de login bloqueadas",
                  meta: "12:40 · segurança",
                  tone: "danger",
                },
                { title: "Fila de webhooks drenada", meta: "11:18 · plataforma", tone: "info" },
                { title: "Cobrança regularizada", meta: "09:55 · financeiro", tone: "neutral" },
              ]}
            />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
