import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Wallet, TrendingUp, Users, Percent } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import {
  KpiCard,
  Meter,
  PageHeader,
  Pager,
  Panel,
  StatusPill,
  TableWrap,
  Td,
  Th,
  Tr,
  toneFor,
} from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { invoices, revenueSeries } from "@/lib/mock";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro · FrotaK Master" },
      {
        name: "description",
        content:
          "MRR, ARR, CAC, LTV, churn, inadimplência, fluxo de caixa e gateways de pagamento da operação FrotaK.",
      },
      { property: "og:title", content: "Financeiro · FrotaK Master" },
      {
        property: "og:description",
        content: "Receita recorrente, cobranças, gateways e inadimplência.",
      },
    ],
  }),
  component: Financeiro,
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

const gateways = [
  { name: "PIX", share: 46, volume: "R$ 591.054" },
  { name: "Cartão", share: 34, volume: "R$ 436.866" },
  { name: "Boleto", share: 17, volume: "R$ 218.433" },
  { name: "Transferência", share: 3, volume: "R$ 38.547" },
];

function Financeiro() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Ciclo julho/2026 · fechamento em 2 dias"
        title="Financeiro"
        description="Receita recorrente, cobranças, inadimplência e indicadores de eficiência da operação."
        crumbs={[{ label: "Financeiro" }]}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl">
              <Download className="size-4" /> Relatório
            </Button>
            <Button size="sm" className="gap-2 rounded-xl font-bold">
              <Plus className="size-4" /> Nova cobrança
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="MRR" value="R$ 1,28 M" delta="+12,4%" trend="up" icon={Wallet} index={0} />
        <KpiCard
          label="ARR"
          value="R$ 15,4 M"
          delta="+9,1%"
          trend="up"
          icon={TrendingUp}
          index={1}
        />
        <KpiCard label="CAC" value="R$ 3.410" delta="-6,2%" trend="up" icon={Users} index={2} />
        <KpiCard label="LTV" value="R$ 74.900" delta="+11,8%" trend="up" index={3} />
        <KpiCard label="Churn" value="1,4%" delta="-0,3pp" trend="up" icon={Percent} index={4} />
        <KpiCard label="Inadimplência" value="R$ 62,4 k" delta="+R$ 8,1k" trend="down" index={5} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          eyebrow="Fluxo de caixa"
          title="Receitas x despesas"
          description="Valores em milhares de reais"
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenueSeries}>
              <defs>
                <linearGradient id="fin1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fin2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="m" {...axis} />
              <YAxis {...axis} width={40} />
              <RTooltip {...tip} />
              <Area
                type="monotone"
                dataKey="mrr"
                name="Receita"
                stroke="var(--chart-1)"
                fill="url(#fin1)"
                strokeWidth={2.5}
              />
              <Area
                type="monotone"
                dataKey="expansion"
                name="Despesa"
                stroke="var(--chart-4)"
                fill="url(#fin2)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel eyebrow="Gateways" title="Meios de pagamento">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={gateways}
                dataKey="share"
                nameKey="name"
                innerRadius={48}
                outerRadius={76}
                paddingAngle={3}
                strokeWidth={0}
              >
                {gateways.map((_, i) => (
                  <Cell key={i} fill={`var(--chart-${i + 1})`} />
                ))}
              </Pie>
              <RTooltip {...tip} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-3 space-y-2.5">
            {gateways.map((g, i) => (
              <li key={g.name} className="flex items-center gap-2 text-xs font-semibold">
                <span
                  className="size-2 rounded-full"
                  style={{ background: `var(--chart-${i + 1})` }}
                />
                {g.name}
                <span className="ml-auto font-mono text-muted-foreground">{g.volume}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          eyebrow="Cobranças"
          title="Faturas recentes"
          bodyClassName="p-5 pb-0"
        >
          <Tabs defaultValue="todas">
            <TabsList className="rounded-xl">
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="pagas">Pagas</TabsTrigger>
              <TabsTrigger value="vencidas">Vencidas</TabsTrigger>
              <TabsTrigger value="reemb">Reembolsos</TabsTrigger>
            </TabsList>
            <TabsContent value="todas" className="mt-4">
              <TableWrap>
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr>
                      <Th>Fatura</Th>
                      <Th>Cliente</Th>
                      <Th>Valor</Th>
                      <Th>Meio</Th>
                      <Th>Vencimento</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => (
                      <Tr key={i.id}>
                        <Td className="font-mono font-semibold">{i.id}</Td>
                        <Td className="font-semibold">{i.client}</Td>
                        <Td className="font-mono">{i.amount}</Td>
                        <Td>
                          <StatusPill tone="neutral" dot={false}>
                            {i.method}
                          </StatusPill>
                        </Td>
                        <Td className="text-muted-foreground">{i.due}</Td>
                        <Td>
                          <StatusPill tone={toneFor(i.status)}>{i.status}</StatusPill>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </TabsContent>
            <TabsContent value="pagas" className="mt-4 pb-5 text-sm text-muted-foreground">
              4 faturas quitadas neste ciclo · R$ 116.900,00
            </TabsContent>
            <TabsContent value="vencidas" className="mt-4 pb-5 text-sm text-muted-foreground">
              1 fatura vencida · R$ 9.700,00 em cobrança automática.
            </TabsContent>
            <TabsContent value="reemb" className="mt-4 pb-5 text-sm text-muted-foreground">
              1 reembolso processado · R$ 7.600,00.
            </TabsContent>
          </Tabs>
          <div className="-mx-5">
            <Pager total={invoices.length} />
          </div>
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel eyebrow="Assinaturas" title="Saúde da carteira">
            <div className="space-y-4">
              <Meter label="Renovação automática" value={92} />
              <Meter label="Cobranças bem-sucedidas" value={97} />
              <Meter label="Contratos anuais" value={64} />
              <Meter label="Risco de churn" value={12} hint="12%" />
            </div>
          </Panel>

          <Panel eyebrow="Comissões" title="Parceiros e afiliados" bodyClassName="p-0">
            <Accordion type="single" collapsible className="px-5">
              {[
                {
                  q: "Afiliados nível 1",
                  a: "18 parceiros · R$ 42.100 em comissões pagas no mês.",
                },
                { q: "Revendas Enterprise", a: "4 revendas ativas · 12% de margem recorrente." },
                {
                  q: "Indicações internas",
                  a: "31 indicações convertidas · bônus de R$ 900 por contrato.",
                },
              ].map((i) => (
                <AccordionItem key={i.q} value={i.q}>
                  <AccordionTrigger className="text-sm font-semibold">{i.q}</AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground">
                    {i.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Panel>

          <Panel eyebrow="Despesas" title="Custos de plataforma">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={[
                  { n: "Infra", v: 82 },
                  { n: "APIs", v: 41 },
                  { n: "Pessoas", v: 320 },
                  { n: "Mkt", v: 96 },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="n" {...axis} />
                <YAxis {...axis} width={34} />
                <RTooltip {...tip} />
                <Bar dataKey="v" fill="var(--chart-2)" radius={[6, 6, 0, 0]} name="R$ mil" />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
