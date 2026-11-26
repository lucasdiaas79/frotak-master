import { createFileRoute } from "@tanstack/react-router";
import { Filter, Plus, Target, Users, Handshake, Megaphone } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  FunnelChart,
  Funnel,
  LabelList,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, KpiCard, Meter, PageHeader, Panel, StatusPill } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pipeline } from "@/lib/mock";

export const Route = createFileRoute("/comercial")({
  head: () => ({
    meta: [
      { title: "Comercial · FrotaK Master" },
      {
        name: "description",
        content:
          "Pipeline CRM, funil de conversão, propostas, contratos, campanhas e afiliados da FrotaK.",
      },
      { property: "og:title", content: "Comercial · FrotaK Master" },
      {
        property: "og:description",
        content: "Pipeline, funil de conversão, propostas e campanhas.",
      },
    ],
  }),
  component: Comercial,
});

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false };
const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 12,
  },
};

const funnel = [
  { name: "Leads", value: 1240, fill: "var(--chart-2)" },
  { name: "Qualificados", value: 618, fill: "var(--chart-3)" },
  { name: "Propostas", value: 284, fill: "var(--chart-1)" },
  { name: "Negociação", value: 142, fill: "var(--chart-5)" },
  { name: "Ganhos", value: 68, fill: "var(--primary)" },
];

function Comercial() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Pipeline ativo · R$ 2,4 M em negociação"
        title="Comercial"
        description="CRM interno da FrotaK: leads, qualificação, propostas, contratos, campanhas e afiliados."
        crumbs={[{ label: "Comercial" }]}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl">
              <Filter className="size-4" /> Filtros
            </Button>
            <Button size="sm" className="gap-2 rounded-xl font-bold">
              <Plus className="size-4" /> Nova oportunidade
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Leads no mês"
          value="1.240"
          delta="+18,2%"
          trend="up"
          icon={Users}
          index={0}
        />
        <KpiCard
          label="Taxa de conversão"
          value="5,5%"
          delta="+0,7pp"
          trend="up"
          icon={Target}
          index={1}
        />
        <KpiCard label="Propostas abertas" value="284" delta="+31" trend="up" index={2} />
        <KpiCard
          label="Contratos fechados"
          value="68"
          delta="+9"
          trend="up"
          icon={Handshake}
          index={3}
        />
        <KpiCard
          label="Campanhas ativas"
          value="7"
          delta="ROI 4,1x"
          trend="flat"
          icon={Megaphone}
          index={4}
        />
      </div>

      <Panel
        className="mt-3"
        eyebrow="Kanban"
        title="Pipeline de vendas"
        description="Arraste visual · 5 estágios"
        bodyClassName="p-4"
      >
        <div className="scroll-slim flex gap-3 overflow-x-auto pb-2">
          {pipeline.map((col) => (
            <div
              key={col.stage}
              className="w-[260px] shrink-0 rounded-2xl border border-border bg-elevated/40 p-3"
            >
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: `var(--${col.color})` }}
                  />
                  {col.stage}
                </p>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {col.deals.length}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {col.deals.map((d) => (
                  <li
                    key={d.name}
                    className="cursor-grab rounded-xl border border-border bg-surface p-3 shadow-elevate transition hover:-translate-y-0.5 hover:border-primary/30 active:cursor-grabbing"
                  >
                    <p className="truncate text-sm font-bold">{d.name}</p>
                    <p className="mt-1 font-mono text-xs text-primary">{d.value}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <StatusPill tone="neutral" dot={false}>
                        {d.tag}
                      </StatusPill>
                      <Avatar name={d.owner} className="size-6 text-[10px]" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel eyebrow="Conversão" title="Funil comercial" className="xl:col-span-1">
          <ResponsiveContainer width="100%" height={260}>
            <FunnelChart>
              <RTooltip {...tip} />
              <Funnel dataKey="value" data={funnel} isAnimationActive>
                <LabelList
                  position="right"
                  fill="var(--foreground)"
                  stroke="none"
                  dataKey="name"
                  fontSize={11}
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </Panel>

        <Panel eyebrow="Origem" title="Leads por canal" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={[
                { c: "Inbound", v: 412 },
                { c: "Outbound", v: 318 },
                { c: "Indicação", v: 206 },
                { c: "Afiliados", v: 164 },
                { c: "Eventos", v: 88 },
                { c: "Parcerias", v: 52 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="c" {...axis} />
              <YAxis {...axis} width={36} />
              <RTooltip {...tip} />
              <Bar dataKey="v" fill="var(--chart-1)" radius={[6, 6, 0, 0]} name="Leads" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel className="mt-3" eyebrow="Gestão" title="Propostas, contratos e campanhas">
        <Tabs defaultValue="prop">
          <TabsList className="rounded-xl">
            <TabsTrigger value="prop">Propostas</TabsTrigger>
            <TabsTrigger value="cont">Contratos</TabsTrigger>
            <TabsTrigger value="camp">Campanhas</TabsTrigger>
            <TabsTrigger value="afi">Afiliados</TabsTrigger>
          </TabsList>
          <TabsContent value="prop" className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              { n: "Atlas Bulk Mining", v: "R$ 48,9k", s: "Aguardando" },
              { n: "Meridional Cargas", v: "R$ 18,4k", s: "Em análise" },
              { n: "Costa Azul", v: "R$ 7,6k", s: "Vencido" },
            ].map((p) => (
              <div key={p.n} className="rounded-xl border border-border bg-elevated/50 p-4">
                <p className="truncate font-bold">{p.n}</p>
                <p className="mt-1 font-mono text-sm text-primary">{p.v}</p>
                <div className="mt-3">
                  <StatusPill
                    tone={p.s === "Vencido" ? "danger" : p.s === "Em análise" ? "info" : "warning"}
                  >
                    {p.s}
                  </StatusPill>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="cont" className="mt-4 space-y-3">
            <Meter label="Contratos assinados digitalmente" value={88} />
            <Meter label="Renovações no trimestre" value={71} />
            <Meter label="Contratos em revisão jurídica" value={22} />
          </TabsContent>
          <TabsContent value="camp" className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              { n: "Google Ads · Frota pesada", roi: "4,8x", inv: "R$ 22k" },
              { n: "LinkedIn · Diretores de logística", roi: "3,2x", inv: "R$ 18k" },
              { n: "Webinar · Gestão de caçambas", roi: "6,1x", inv: "R$ 6k" },
              { n: "E-mail · Base inativa", roi: "2,4x", inv: "R$ 2k" },
            ].map((c) => (
              <div
                key={c.n}
                className="flex items-center justify-between rounded-xl border border-border bg-elevated/50 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{c.n}</p>
                  <p className="text-xs text-muted-foreground">Investimento {c.inv}</p>
                </div>
                <StatusPill tone="success" dot={false}>
                  ROI {c.roi}
                </StatusPill>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="afi" className="mt-4 space-y-2">
            {[
              "Consultoria RodoPlan · 12 indicações",
              "TMS Partners · 8 indicações",
              "Grupo LogBR · 6 indicações",
            ].map((a) => (
              <div
                key={a}
                className="flex items-center justify-between rounded-xl border border-border bg-elevated/50 px-4 py-3 text-sm"
              >
                <span className="truncate font-semibold">{a}</span>
                <StatusPill tone="success">Ativo</StatusPill>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </Panel>
    </AppShell>
  );
}
