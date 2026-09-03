import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Download,
  FilterX,
  Landmark,
  Percent,
  RefreshCw,
  RouteIcon,
  Search,
  TrendingUp,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FinancialNav } from "@/components/financial/FinancialNav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFinancialAccess, listFinancialPartners } from "@/lib/financial/phase2";
import {
  getFleetProfitabilitySummary,
  getFreightProfitability,
  getPartnerProfitability,
  getVehicleProfitability,
} from "@/lib/financial/profitability";
import type {
  BusinessPartner,
  FleetProfitabilitySummary,
  FreightProfitabilityRow,
  PartnerProfitabilityRow,
  ProfitabilityFilters,
  ProfitabilitySort,
  ProfitabilityView,
  VehicleProfitabilityRow,
} from "@/lib/financial/types";
import { useFleet } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lucros-despesas")({
  head: () => ({
    meta: [
      { title: "Rentabilidade da Frota - Central Transportes" },
      {
        name: "description",
        content: "Rentabilidade por caminhao, frete e cliente usando dados financeiros canonicos.",
      },
    ],
  }),
  component: FleetProfitabilityPage,
});

const ALL = "all";

type UiFilters = {
  startDate: string;
  endDate: string;
  vehicleId: string;
  billingPartnerId: string;
  senderId: string;
  recipientId: string;
  productId: string;
  implementModel: string;
  paymentType: string;
};

const sortLabels: Record<ProfitabilitySort, string> = {
  most_profitable: "Mais rentaveis",
  lowest_profit: "Menos rentaveis",
  highest_revenue: "Maior faturamento",
  highest_cost: "Maior custo",
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(value: number) {
  return moneyFormatter.format(value || 0);
}

function percent(value: number) {
  return `${(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function dateLabel(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function cleanFilter(value: string) {
  return value === ALL ? null : value;
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof TrendingUp;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div
      className={cn(
        "premium-card flex min-h-[118px] flex-col justify-between p-4",
        tone === "positive" && "border-primary/30 bg-primary/5",
        tone === "negative" && "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <span className="grid size-10 place-items-center rounded-2xl border border-border bg-surface">
          <Icon className="size-4 text-primary" />
        </span>
      </div>
      <div>
        <strong className="block text-2xl font-extrabold text-foreground md:text-3xl">
          {value}
        </strong>
        <span className="text-xs text-muted-foreground">{helper}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function VehicleCard({
  row,
  index,
  onClick,
}: {
  row: VehicleProfitabilityRow;
  index: number;
  onClick: () => void;
}) {
  const isNegative = row.result < 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="premium-card group flex min-h-[176px] w-full flex-col justify-between p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/45"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-2 inline-flex items-center rounded-full border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground">
            TOP {index + 1}
          </span>
          <h3 className="truncate text-xl font-extrabold text-foreground">{row.plate}</h3>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {row.driverName || "Motorista nao informado"}
          </p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Truck className="size-5" />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Faturamento
          </p>
          <strong>{money(row.revenue)}</strong>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Custos
          </p>
          <strong>{money(row.costs)}</strong>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Resultado
          </p>
          <strong className={isNegative ? "text-destructive" : "text-primary"}>
            {money(row.result)}
          </strong>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Margem
          </p>
          <strong>{percent(row.margin)}</strong>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate">{row.implementModels.join(", ") || row.model || "-"}</span>
        <span>{row.freightCount} frete(s)</span>
      </div>
    </button>
  );
}

function FreightList({ rows }: { rows: FreightProfitabilityRow[] }) {
  if (!rows.length) {
    return <EmptyState text="Nenhum frete concluido encontrado para os filtros atuais." />;
  }
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.freightId} className="rounded-2xl border border-border bg-surface/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm text-foreground">{row.plate}</strong>
            <span className="text-xs text-muted-foreground">{dateLabel(row.completedAt)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.senderName} {"->"} {row.recipientName}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <span>Produto: {row.productName}</span>
            <span>Pagador: {row.billingPartnerName}</span>
            <span>Receita: {money(row.revenue)}</span>
            <span className={row.result < 0 ? "text-destructive" : "text-primary"}>
              Resultado: {money(row.result)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function FleetProfitabilityPage() {
  const currentMonth = useMemo(monthRange, []);
  const [filters, setFilters] = useState<UiFilters>({
    startDate: currentMonth.startDate,
    endDate: currentMonth.endDate,
    vehicleId: ALL,
    billingPartnerId: ALL,
    senderId: ALL,
    recipientId: ALL,
    productId: ALL,
    implementModel: ALL,
    paymentType: ALL,
  });
  const [sort, setSort] = useState<ProfitabilitySort>("most_profitable");
  const [view, setView] = useState<ProfitabilityView>("vehicles");
  const [summary, setSummary] = useState<FleetProfitabilitySummary>({
    revenue: 0,
    costs: 0,
    result: 0,
    margin: 0,
    unallocatedCosts: 0,
  });
  const [vehiclesProfit, setVehiclesProfit] = useState<VehicleProfitabilityRow[]>([]);
  const [freightsProfit, setFreightsProfit] = useState<FreightProfitabilityRow[]>([]);
  const [partnersProfit, setPartnersProfit] = useState<PartnerProfitabilityRow[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleProfitabilityRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { vehicles, senders, recipients, products, trailers, loadAll } = useFleet((state) => ({
    vehicles: state.vehicles,
    senders: state.senders,
    recipients: state.recipients,
    products: state.products,
    trailers: state.trailers,
    loadAll: state.loadAll,
  }));

  const implementModels = useMemo(
    () =>
      Array.from(
        new Set(
          trailers
            .map((trailer) => trailer.implementModel || trailer.model || trailer.type)
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [trailers],
  );

  const profitabilityFilters = useCallback(
    (workspaceId: string): ProfitabilityFilters => ({
      workspaceId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      vehicleId: cleanFilter(filters.vehicleId),
      billingPartnerId: cleanFilter(filters.billingPartnerId),
      senderId: cleanFilter(filters.senderId),
      recipientId: cleanFilter(filters.recipientId),
      productId: cleanFilter(filters.productId),
      implementModel: cleanFilter(filters.implementModel),
      paymentType:
        filters.paymentType === "CIF" || filters.paymentType === "FOB" ? filters.paymentType : null,
    }),
    [filters],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const access = await getFinancialAccess();
      const nextFilters = profitabilityFilters(access.workspaceId);
      const [summaryData, vehicleRows, freightRows, partnerRows, partnerRowsRaw] =
        await Promise.all([
          getFleetProfitabilitySummary(nextFilters),
          getVehicleProfitability(nextFilters, sort, 100),
          getFreightProfitability(nextFilters),
          getPartnerProfitability(nextFilters),
          listFinancialPartners(),
          loadAll(),
        ]);
      setSummary(summaryData);
      setVehiclesProfit(vehicleRows);
      setFreightsProfit(freightRows);
      setPartnersProfit(partnerRows);
      setPartners(partnerRowsRaw);
    } catch (err) {
      console.error("[profitability] failed", err);
      setError("Nao foi possivel carregar a rentabilidade da frota. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [loadAll, profitabilityFilters, sort]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedVehicleFreights = useMemo(
    () => freightsProfit.filter((freight) => freight.vehicleId === selectedVehicle?.vehicleId),
    [freightsProfit, selectedVehicle],
  );

  const selectedRevenue = selectedVehicleFreights.reduce((total, row) => total + row.revenue, 0);
  const selectedCosts = selectedVehicleFreights.reduce((total, row) => total + row.costs, 0);
  const selectedResult = selectedRevenue - selectedCosts;

  const updateFilter = (key: keyof UiFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      startDate: currentMonth.startDate,
      endDate: currentMonth.endDate,
      vehicleId: ALL,
      billingPartnerId: ALL,
      senderId: ALL,
      recipientId: ALL,
      productId: ALL,
      implementModel: ALL,
      paymentType: ALL,
    });
    setSort("most_profitable");
  };

  const exportReport = () => {
    if (view === "freights") {
      downloadCsv("rentabilidade-por-frete.csv", [
        [
          "Frete",
          "Placa",
          "Origem",
          "Destino",
          "Produto",
          "Pagador",
          "Receita",
          "Custos",
          "Resultado",
        ],
        ...freightsProfit.map((row) => [
          row.freightId,
          row.plate,
          row.senderName,
          row.recipientName,
          row.productName,
          row.billingPartnerName,
          row.revenue,
          row.costs,
          row.result,
        ]),
      ]);
      return;
    }
    if (view === "partners") {
      downloadCsv("rentabilidade-por-cliente.csv", [
        ["Cliente", "Fretes", "Receita", "Custos", "Resultado", "Margem"],
        ...partnersProfit.map((row) => [
          row.partnerName,
          row.freightCount,
          row.revenue,
          row.costs,
          row.result,
          row.margin,
        ]),
      ]);
      return;
    }
    downloadCsv("rentabilidade-por-caminhao.csv", [
      [
        "Placa",
        "Modelo",
        "Motorista",
        "Implementos",
        "Fretes",
        "Receita",
        "Custos",
        "Resultado",
        "Margem",
      ],
      ...vehiclesProfit.map((row) => [
        row.plate,
        row.model,
        row.driverName,
        row.implementModels.join(", "),
        row.freightCount,
        row.revenue,
        row.costs,
        row.result,
        row.margin,
      ]),
    ]);
  };

  return (
    <div className="financial-shell flex min-h-0 flex-col gap-4 pb-8">
      <PageHeader
        title="Rentabilidade da Frota"
        subtitle="Financeiro operacional por caminhao, frete e cliente"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportReport}>
              <Download className="size-4" />
              Exportar Relatorio
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              Atualizar
            </Button>
          </>
        }
      />
      <FinancialNav />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Faturamento"
          value={money(summary.revenue)}
          helper="Receitas por competencia"
          icon={ArrowUp}
          tone="positive"
        />
        <MetricCard
          label="Custos"
          value={money(summary.costs)}
          helper="Custos alocados a frete/caminhao"
          icon={ArrowDown}
          tone={summary.costs > 0 ? "negative" : "neutral"}
        />
        <MetricCard
          label="Resultado"
          value={money(summary.result)}
          helper="Faturamento menos custos"
          icon={TrendingUp}
          tone={summary.result < 0 ? "negative" : "positive"}
        />
        <MetricCard
          label="Margem"
          value={percent(summary.margin)}
          helper="Resultado sobre faturamento"
          icon={Percent}
        />
      </section>

      <section className="premium-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Filtros de rentabilidade
            </p>
            <h2 className="text-lg font-extrabold text-foreground">Periodo e operacao</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX className="size-4" />
            Limpar
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Periodo inicial">
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) => updateFilter("startDate", event.target.value)}
            />
          </Field>
          <Field label="Periodo final">
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => updateFilter("endDate", event.target.value)}
            />
          </Field>
          <Field label="Placa">
            <Select
              value={filters.vehicleId}
              onValueChange={(value) => updateFilter("vehicleId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas as placas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as placas</SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.plate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente pagador">
            <Select
              value={filters.billingPartnerId}
              onValueChange={(value) => updateFilter("billingPartnerId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os pagadores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os pagadores</SelectItem>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.tradeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Origem">
            <Select
              value={filters.senderId}
              onValueChange={(value) => updateFilter("senderId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas as origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as origens</SelectItem>
                {senders.map((sender) => (
                  <SelectItem key={sender.id} value={sender.id}>
                    {sender.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Destino">
            <Select
              value={filters.recipientId}
              onValueChange={(value) => updateFilter("recipientId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os destinos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os destinos</SelectItem>
                {recipients.map((recipient) => (
                  <SelectItem key={recipient.id} value={recipient.id}>
                    {recipient.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Produto">
            <Select
              value={filters.productId}
              onValueChange={(value) => updateFilter("productId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os produtos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os produtos</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Modelo implemento">
            <Select
              value={filters.implementModel}
              onValueChange={(value) => updateFilter("implementModel", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os modelos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os modelos</SelectItem>
                {implementModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="CIF / FOB">
            <Select
              value={filters.paymentType}
              onValueChange={(value) => updateFilter("paymentType", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="CIF">CIF</SelectItem>
                <SelectItem value="FOB">FOB</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ordenacao">
            <Select value={sort} onValueChange={(value) => setSort(value as ProfitabilitySort)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sortLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      {summary.unallocatedCosts > 0 && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-200">
          Custos nao alocados: {money(summary.unallocatedCosts)}. Eles nao foram distribuidos entre
          caminhoes porque nao possuem vinculo confiavel com veiculo ou frete.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs value={view} onValueChange={(value) => setView(value as ProfitabilityView)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="vehicles">Por caminhao</TabsTrigger>
            <TabsTrigger value="freights">Por frete</TabsTrigger>
            <TabsTrigger value="partners">Por cliente</TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            Regime de competencia: {filters.startDate} a {filters.endDate}
          </p>
        </div>

        <TabsContent value="vehicles" className="mt-4">
          {loading ? (
            <EmptyState text="Carregando rentabilidade por caminhao..." />
          ) : vehiclesProfit.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {vehiclesProfit.slice(0, 10).map((row, index) => (
                <VehicleCard
                  key={row.vehicleId}
                  row={row}
                  index={index}
                  onClick={() => setSelectedVehicle(row)}
                />
              ))}
            </div>
          ) : (
            <EmptyState text="Nenhum caminhao com movimentacao financeira no periodo." />
          )}
        </TabsContent>

        <TabsContent value="freights" className="mt-4">
          <div className="premium-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h2 className="text-lg font-extrabold text-foreground">Rentabilidade por frete</h2>
              <p className="text-xs text-muted-foreground">
                Apenas fretes concluidos com documentos financeiros validos.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-surface/80 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Placa</th>
                    <th className="px-4 py-3">Rota</th>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3">CIF/FOB</th>
                    <th className="px-4 py-3 text-right">Receita</th>
                    <th className="px-4 py-3 text-right">Custos</th>
                    <th className="px-4 py-3 text-right">Resultado</th>
                    <th className="px-4 py-3 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {freightsProfit.map((row) => (
                    <tr key={row.freightId} className="border-t border-border">
                      <td className="px-4 py-3 font-bold">{row.plate}</td>
                      <td className="px-4 py-3">
                        {row.senderName} {"->"} {row.recipientName}
                        <span className="block text-xs text-muted-foreground">
                          {dateLabel(row.completedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.productName}</td>
                      <td className="px-4 py-3">
                        {row.paymentType || "-"} / {row.billingPartnerName}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{money(row.revenue)}</td>
                      <td className="px-4 py-3 text-right font-bold">{money(row.costs)}</td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-bold",
                          row.result < 0 ? "text-destructive" : "text-primary",
                        )}
                      >
                        {money(row.result)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{percent(row.margin)}</td>
                    </tr>
                  ))}
                  {!freightsProfit.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhum frete encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="partners" className="mt-4">
          {partnersProfit.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {partnersProfit.map((row, index) => (
                <div key={row.partnerId ?? `partner-${index}`} className="premium-card p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="mb-2 inline-flex items-center rounded-full border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <h3 className="truncate text-lg font-extrabold text-foreground">
                        {row.partnerName}
                      </h3>
                      <p className="text-xs text-muted-foreground">{row.freightCount} frete(s)</p>
                    </div>
                    <Landmark className="size-5 text-primary" />
                  </div>
                  <div className="grid gap-2 text-sm">
                    <span>Receita: {money(row.revenue)}</span>
                    <span>Custos: {money(row.costs)}</span>
                    <strong className={row.result < 0 ? "text-destructive" : "text-primary"}>
                      Resultado: {money(row.result)}
                    </strong>
                    <span>Margem: {percent(row.margin)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Nenhum cliente pagador encontrado para os filtros atuais." />
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(selectedVehicle)}
        onOpenChange={(open) => !open && setSelectedVehicle(null)}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedVehicle?.plate ?? "Caminhao"}</DialogTitle>
            <DialogDescription>
              Rentabilidade por competencia do periodo filtrado na tela.
            </DialogDescription>
          </DialogHeader>
          {selectedVehicle && (
            <Tabs defaultValue="summary">
              <TabsList className="mb-4">
                <TabsTrigger value="summary">Resumo</TabsTrigger>
                <TabsTrigger value="freights">Fretes</TabsTrigger>
                <TabsTrigger value="revenue">Receitas</TabsTrigger>
                <TabsTrigger value="costs">Custos</TabsTrigger>
              </TabsList>
              <TabsContent value="summary">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <MetricCard
                    label="Receita"
                    value={money(selectedRevenue)}
                    helper="Fretes concluidos"
                    icon={ArrowUp}
                  />
                  <MetricCard
                    label="Custos"
                    value={money(selectedCosts)}
                    helper="Custos alocados"
                    icon={ArrowDown}
                  />
                  <MetricCard
                    label="Resultado"
                    value={money(selectedResult)}
                    helper="Receita menos custos"
                    icon={TrendingUp}
                    tone={selectedResult < 0 ? "negative" : "positive"}
                  />
                  <MetricCard
                    label="Margem"
                    value={percent(selectedVehicle.margin)}
                    helper={`${selectedVehicle.freightCount} frete(s)`}
                    icon={Percent}
                  />
                </div>
              </TabsContent>
              <TabsContent value="freights">
                <FreightList rows={selectedVehicleFreights} />
              </TabsContent>
              <TabsContent value="revenue">
                <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-border p-3">
                    <Search className="mb-2 size-4 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      Origem, destino e produto seguem os filtros da tela.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border p-3">
                    <RouteIcon className="mb-2 size-4 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      Total de receitas: <strong>{money(selectedRevenue)}</strong>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border p-3">
                    <CalendarDays className="mb-2 size-4 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      Competencia: {filters.startDate} a {filters.endDate}
                    </p>
                  </div>
                </div>
                <FreightList rows={selectedVehicleFreights.filter((row) => row.revenue > 0)} />
              </TabsContent>
              <TabsContent value="costs">
                <div className="mb-3 rounded-2xl border border-border p-3 text-sm text-muted-foreground">
                  Total de custos alocados ao caminhao no periodo:{" "}
                  <strong>{money(selectedCosts)}</strong>
                </div>
                <FreightList rows={selectedVehicleFreights.filter((row) => row.costs > 0)} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
