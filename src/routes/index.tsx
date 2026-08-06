import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CloudUpload,
  Cpu,
  Database,
  Download,
  Plug,
  RefreshCw,
  Radio,
  Truck,
  Users,
  Wallet,
  Bell,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import {
  EmptyState,
  KpiCard,
  Meter,
  PageHeader,
  Panel,
  StatusPill,
  Timeline,
  toneFor,
  Avatar,
} from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activityFeed,
  freightSeries,
  logs,
  planMix,
  radarData,
  revenueSeries,
  stateHeat,
  systemHealth,
} from "@/lib/mock";
import { getMasterDashboardSnapshot, type MasterDashboardSnapshot } from "@/lib/masterControl";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Master · FrotaK" },
      {
        name: "description",
        content:
          "Visão consolidada de receita, clientes, fretes ativos e saúde da plataforma FrotaK em tempo real.",
      },
      { property: "og:title", content: "Dashboard Master · FrotaK" },
      {
        property: "og:description",
        content: "Receita, clientes, operações e saúde do sistema em um único painel enterprise.",
      },
    ],
  }),
  component: Dashboard,
});

const chartAxis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 12,
    color: "var(--popover-foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)", fontWeight: 700 },
};

const kpiIcons = [
  Wallet,
  Wallet,
  Users,
  Users,
  Activity,
  Users,
  Truck,
  Truck,
  Truck,
  Wallet,
  Wallet,
  ArrowUpRight,
];

const emptySnapshot: MasterDashboardSnapshot = {
  tenantCount: 0,
  activeTenants: 0,
  suspendedTenants: 0,
  cancelledTenants: 0,
  totalUsers: 0,
  totalDrivers: 0,
  totalTrailers: 0,
  totalVehicles: 0,
  totalTruckLimit: 0,
  totalSenders: 0,
  totalRecipients: 0,
  totalProducts: 0,
  inRouteVehicles: 0,
  maintenanceVehicles: 0,
  brokenVehicles: 0,
};

function Dashboard() {
  const [snapshot, setSnapshot] = useState<MasterDashboardSnapshot>(emptySnapshot);

  useEffect(() => {
    let active = true;

    async function load() {
      const data = await getMasterDashboardSnapshot();
      if (active) setSnapshot(data);
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const liveKpis = useMemo(
    () => [
      {
        label: "Tenants",
        value: String(snapshot.tenantCount),
        delta: `${snapshot.activeTenants} ativos`,
        trend: "up" as const,
        hint: "base central",
      },
      {
        label: "Caminhões cadastrados",
        value: String(snapshot.totalVehicles),
        delta: `${snapshot.totalTruckLimit} contratados`,
        trend: "up" as const,
        hint: "todos os tenants",
      },
      {
        label: "Motoristas",
        value: String(snapshot.totalDrivers),
        delta: "base real",
        trend: "up" as const,
        hint: "todos os tenants",
      },
      {
        label: "Usuários",
        value: String(snapshot.totalUsers),
        delta: "acessos ativos",
        trend: "up" as const,
        hint: "todos os tenants",
      },
      {
        label: "Caminhões em rota",
        value: String(snapshot.inRouteVehicles),
        delta: "situação atual",
        trend: "flat" as const,
        hint: "frota global",
      },
      {
        label: "Caçambas",
        value: String(snapshot.totalTrailers),
        delta: "base real",
        trend: "flat" as const,
        hint: "todos os tenants",
      },
      {
        label: "Remetentes",
        value: String(snapshot.totalSenders),
        delta: "cadastro central",
        trend: "flat" as const,
        hint: "todos os tenants",
      },
      {
        label: "Destinatários",
        value: String(snapshot.totalRecipients),
        delta: "cadastro central",
        trend: "flat" as const,
        hint: "todos os tenants",
      },
      {
        label: "Produtos",
        value: String(snapshot.totalProducts),
        delta: "catálogo total",
        trend: "flat" as const,
        hint: "todos os tenants",
      },
      {
        label: "Em manutenção",
        value: String(snapshot.maintenanceVehicles),
        delta: "situação atual",
        trend: "flat" as const,
        hint: "frota global",
      },
      {
        label: "Quebrados",
        value: String(snapshot.brokenVehicles),
        delta: "situação atual",
        trend: "down" as const,
        hint: "frota global",
      },
      {
        label: "Suspensos",
        value: String(snapshot.suspendedTenants + snapshot.cancelledTenants),
        delta: "tenants com restrição",
        trend: "flat" as const,
        hint: "controle master",
      },
    ],
    [snapshot],
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Visão consolidada da frota · atualizado 14:28:07"
        title="Dashboard Operacional"
        description="Indicadores de receita, adoção e operação de todas as transportadoras conectadas à plataforma FrotaK."
        crumbs={[{ label: "Dashboard" }]}
        actions={
          <>
            <StatusPill tone="success">
              <Radio className="size-3" /> Tempo real
            </StatusPill>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl">
              <Download className="size-4" /> Exportar
            </Button>
            <Button size="sm" className="gap-2 rounded-xl font-bold">
              <RefreshCw className="size-4" /> Atualizar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {liveKpis.map((k, i) => (
          <KpiCard key={k.label} {...k} icon={kpiIcons[i]} index={i} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          eyebrow="Receita recorrente"
          title="MRR, expansão e churn"
          description="Valores em milhares de reais · últimos 12 meses"
          actions={
            <Tabs defaultValue="12m">
              <TabsList className="rounded-xl">
                <TabsTrigger value="30d">30d</TabsTrigger>
                <TabsTrigger value="6m">6m</TabsTrigger>
                <TabsTrigger value="12m">12m</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenueSeries}>
              <defs>
                <linearGradient id="gMrr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="m" {...chartAxis} />
              <YAxis {...chartAxis} width={40} />
              <RTooltip {...tooltipStyle} />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                fill="url(#gMrr)"
                name="MRR"
              />
              <Line
                type="monotone"
                dataKey="expansion"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
                name="Expansão"
              />
              <Line
                type="monotone"
                dataKey="churn"
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={false}
                name="Churn"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel eyebrow="Distribuição" title="Mix de planos" description="128 contratos ativos">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={planMix}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {planMix.map((_, i) => (
                  <Cell key={i} fill={`var(--chart-${i + 1})`} />
                ))}
              </Pie>
              <RTooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-2 space-y-2">
            {planMix.map((p, i) => (
              <li key={p.name} className="flex items-center gap-2 text-xs font-semibold">
                <span
                  className="size-2 rounded-full"
                  style={{ background: `var(--chart-${i + 1})` }}
                />
                {p.name}
                <span className="ml-auto text-muted-foreground">{p.value} clientes</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          eyebrow="Operação 24h"
          title="Fretes e ocorrências por hora"
          actions={<StatusPill tone="info">8.951 fretes hoje</StatusPill>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={freightSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="h" {...chartAxis} interval={2} />
              <YAxis {...chartAxis} width={36} />
              <RTooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="fretes" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="Fretes" />
              <Bar
                dataKey="ocorrencias"
                fill="var(--chart-4)"
                radius={[4, 4, 0, 0]}
                name="Ocorrências"
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel eyebrow="Capacidade" title="Radar de plataforma">
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} outerRadius={82}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              />
              <Radar
                dataKey="atual"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.35}
                name="Atual"
              />
              <Radar
                dataKey="meta"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.12}
                name="Meta"
              />
              <RTooltip {...tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Panel eyebrow="Gauge" title="SLA global" description="Meta contratual: 99,5%">
          <ResponsiveContainer width="100%" height={170}>
            <RadialBarChart
              data={[{ name: "SLA", value: 99.6, fill: "var(--chart-1)" }]}
              innerRadius="70%"
              outerRadius="100%"
              startAngle={210}
              endAngle={-30}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "var(--muted)" }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <p className="-mt-10 text-center text-3xl font-extrabold">99,6%</p>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Uptime consolidado 30 dias
          </p>
        </Panel>

        <Panel eyebrow="Heatmap" title="Fretes por estado" bodyClassName="p-4">
          <div className="grid grid-cols-4 gap-1.5">
            {stateHeat.map((s) => (
              <div
                key={s.uf}
                title={`${s.uf}: ${s.v}`}
                className="grid aspect-square place-items-center rounded-lg text-[11px] font-bold ring-1 ring-border"
                style={{
                  background: `color-mix(in oklab, var(--chart-1) ${s.v}%, transparent)`,
                  color: s.v > 60 ? "var(--primary-foreground)" : "var(--foreground)",
                }}
              >
                {s.uf}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Intensidade = volume relativo de fretes
          </p>
        </Panel>

        <Panel eyebrow="Consumo" title="Recursos da plataforma" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Meter label="Storage" value={74} hint="74% de 4 TB" />
            <Meter label="API (req/min)" value={58} hint="58% do limite" />
            <Meter label="Realtime" value={41} hint="8,3k conexões" />
            <Meter label="Banco de dados" value={38} hint="CPU 38%" />
            <Meter label="Fila de webhooks" value={88} hint="1.284 pendentes" />
            <Meter label="Integrações ativas" value={62} hint="9 de 12" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { icon: Database, label: "Banco", v: "OK" },
              { icon: CloudUpload, label: "Storage", v: "Atenção" },
              { icon: Cpu, label: "Workers", v: "OK" },
              { icon: Plug, label: "Integrações", v: "OK" },
            ].map((i) => (
              <div key={i.label} className="rounded-xl border border-border bg-elevated/60 p-3">
                <i.icon className="size-4 text-primary" />
                <p className="mt-2 text-xs font-bold">{i.label}</p>
                <p className="text-[11px] text-muted-foreground">{i.v}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          eyebrow="Activity feed"
          title="Últimos eventos"
          actions={
            <Button variant="ghost" size="sm" className="rounded-xl">
              Ver tudo
            </Button>
          }
        >
          <ul className="space-y-3">
            {activityFeed.map((a, i) => (
              <li key={i} className="flex gap-3">
                <Avatar name={a.who} />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-bold">{a.who}</span>{" "}
                    <span className="text-muted-foreground">{a.action}</span>{" "}
                    <span className="font-semibold text-primary">{a.target}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{a.when}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel eyebrow="Saúde do sistema" title="Serviços monitorados">
          <ul className="space-y-3">
            {systemHealth.map((s) => (
              <li
                key={s.name}
                className="flex items-center gap-3 rounded-xl border border-border bg-elevated/50 p-3"
              >
                <span className="icon-tile size-9 text-primary">
                  <Activity className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusPill tone={toneFor(s.status)}>{s.status}</StatusPill>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{s.value}%</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel eyebrow="Observabilidade" title="Logs recentes" bodyClassName="p-0">
            <ul className="divide-y divide-border/60">
              {logs.map((l, i) => (
                <li key={i} className="flex items-start gap-2.5 px-5 py-2.5">
                  <StatusPill tone={toneFor(l.level)} dot={false} className="mt-0.5 shrink-0">
                    {l.level}
                  </StatusPill>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{l.msg}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {l.at} · {l.ctx}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel eyebrow="Timeline" title="Marcos do dia">
            <Timeline
              items={[
                { title: "Fechamento de contrato Enterprise", meta: "14:12 · Atlas Bulk Mining" },
                { title: "Pico de fretes registrado", meta: "11:40 · 612 fretes/h", tone: "info" },
                { title: "Storage acima de 70%", meta: "09:22 · svc-storage", tone: "warning" },
                { title: "Deploy v4.18.2 concluído", meta: "07:05 · plataforma", tone: "neutral" },
              ]}
            />
          </Panel>

          <Panel eyebrow="Fila vazia" title="Aprovações pendentes">
            <EmptyState
              title="Nada aguardando você"
              description="Todas as aprovações de contrato e reembolso foram processadas."
              action={
                <Button variant="outline" size="sm" className="gap-2 rounded-xl">
                  <Bell className="size-4" /> Configurar alertas
                </Button>
              }
            />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
