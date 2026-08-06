import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, Radio, RefreshCw, Search, Truck } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import {
  Avatar,
  KpiCard,
  PageHeader,
  Pager,
  Panel,
  StatusPill,
  TableWrap,
  Td,
  Th,
  Timeline,
  Tr,
  toneFor,
} from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fleetOps, freightSeries } from "@/lib/mock";

export const Route = createFileRoute("/operacoes")({
  head: () => ({
    meta: [
      { title: "Operações · FrotaK Master" },
      {
        name: "description",
        content:
          "Torre de controle global: empresas e motoristas online, fretes, ocorrências e eventos em tempo real.",
      },
      { property: "og:title", content: "Operações · FrotaK Master" },
      {
        property: "og:description",
        content: "Torre de controle global de fretes, motoristas e ocorrências.",
      },
    ],
  }),
  component: Operacoes,
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

function Operacoes() {
  const [open, setOpen] = useState<(typeof fleetOps)[number] | null>(null);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Torre de controle · streaming ativo"
        title="Operações Globais"
        description="Consolidação da operação de todas as transportadoras: veículos em rota, paradas, ocorrências e eventos."
        crumbs={[{ label: "Operações" }]}
        actions={
          <>
            <StatusPill tone="success">
              <Radio className="size-3" /> Ao vivo
            </StatusPill>
            <Button size="sm" variant="outline" className="gap-2 rounded-xl">
              <RefreshCw className="size-4" /> Sincronizar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Empresas online"
          value="94"
          delta="tempo real"
          trend="flat"
          icon={Activity}
          index={0}
        />
        <KpiCard label="Motoristas online" value="6.317" delta="+1,8%" trend="up" index={1} />
        <KpiCard
          label="Fretes em rota"
          value="3.204"
          delta="-42"
          trend="down"
          icon={Truck}
          index={2}
        />
        <KpiCard label="Veículos parados" value="1.128" delta="+64" trend="down" index={3} />
        <KpiCard label="Ocorrências abertas" value="87" delta="-12" trend="up" index={4} />
        <KpiCard label="Tempo médio de rota" value="4h 12m" delta="-6 min" trend="up" index={5} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          eyebrow="Fluxo operacional"
          title="Movimentação nas últimas 24h"
          actions={
            <Tabs defaultValue="24h">
              <TabsList className="rounded-xl">
                <TabsTrigger value="24h">24h</TabsTrigger>
                <TabsTrigger value="7d">7d</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={freightSeries}>
              <defs>
                <linearGradient id="op1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="h" {...axis} interval={2} />
              <YAxis {...axis} width={36} />
              <RTooltip {...tip} />
              <Area
                type="monotone"
                dataKey="fretes"
                stroke="var(--chart-1)"
                fill="url(#op1)"
                strokeWidth={2.5}
                name="Fretes"
              />
              <Area
                type="monotone"
                dataKey="ocorrencias"
                stroke="var(--chart-4)"
                fill="transparent"
                strokeWidth={2}
                name="Ocorrências"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel eyebrow="Eventos" title="Timeline operacional">
          <Timeline
            items={[
              { title: "OEP-4660 iniciou retorno", meta: "14:26 · Laranjeiras/SE" },
              {
                title: "QMG-1611 reportou quebra",
                meta: "14:04 · Caruaru/PE",
                tone: "danger",
                body: "Resgate acionado pela torre",
              },
              { title: "Excesso de velocidade", meta: "13:48 · Rodoserra", tone: "warning" },
              { title: "Carregamento concluído", meta: "13:12 · Atlas Bulk", tone: "info" },
              {
                title: "Jornada iniciada · 42 motoristas",
                meta: "06:00 · global",
                tone: "neutral",
              },
            ]}
          />
        </Panel>
      </div>

      <Panel
        className="mt-3"
        eyebrow="Monitoramento consolidado"
        title="Veículos em operação"
        bodyClassName="p-5 pb-0"
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Placa, motorista ou cliente" className="rounded-xl pl-9" />
          </div>
        }
      >
        <TableWrap>
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <Th>Placa</Th>
                <Th>Motorista</Th>
                <Th>Cliente</Th>
                <Th>Situação</Th>
                <Th>Status</Th>
                <Th>Localização</Th>
                <Th>Velocidade</Th>
                <Th className="text-right">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {fleetOps.map((f) => (
                <Tr key={f.plate}>
                  <Td className="font-mono font-bold">{f.plate}</Td>
                  <Td>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={f.driver} className="size-7 text-[10px]" />
                      <span className="truncate font-semibold">{f.driver}</span>
                    </div>
                  </Td>
                  <Td className="text-muted-foreground">{f.client}</Td>
                  <Td>{f.status}</Td>
                  <Td>
                    <StatusPill tone={toneFor(f.status)}>{f.detail}</StatusPill>
                  </Td>
                  <Td className="text-muted-foreground">{f.city}</Td>
                  <Td className="font-mono">{f.speed} km/h</Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setOpen(f)}
                    >
                      Detalhes
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <div className="-mx-5">
          <Pager total={fleetOps.length} />
        </div>
      </Panel>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{open.plate}</SheetTitle>
                <SheetDescription>
                  {open.driver} · {open.client}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { l: "Situação", v: open.status },
                    { l: "Velocidade", v: `${open.speed} km/h` },
                    { l: "Cidade", v: open.city },
                    { l: "Jornada", v: "4h 12m" },
                  ].map((i) => (
                    <div key={i.l} className="rounded-xl border border-border bg-elevated/50 p-3">
                      <p className="eyebrow">{i.l}</p>
                      <p className="mt-1 text-sm font-bold">{i.v}</p>
                    </div>
                  ))}
                </div>
                <Timeline
                  items={[
                    { title: "Última posição recebida", meta: "há 12 s" },
                    {
                      title: "Parada de 22 min",
                      meta: "13:58 · posto credenciado",
                      tone: "warning",
                    },
                    { title: "Saída do pátio", meta: "09:14 · base Laranjeiras", tone: "info" },
                  ]}
                />
                <Button className="w-full rounded-xl font-bold">Abrir no mapa global</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
