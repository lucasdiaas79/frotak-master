import {
  ArrowDown,
  ArrowUp,
  Download,
  FilterX,
  Landmark,
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
  most_profitable: "Mais rentáveis",
  lowest_profit: "Menos rentáveis",
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

type RankingItem =
  | {
      dimension: "vehicles";
      id: string;
      title: string;
      subtitle: string;
      meta: string;
      revenue: number;
      costs: number;
      result: number;
      margin: number;
      freightCount: number;
      raw: VehicleProfitabilityRow;
    }
  | {
      dimension: "freights";
      id: string;
      title: string;
      subtitle: string;
      meta: string;
      revenue: number;
      costs: number;
      result: number;
      margin: number;
      freightCount: number;
      raw: FreightProfitabilityRow;
    }
  | {
      dimension: "partners";
      id: string;
      title: string;
      subtitle: string;
      meta: string;
      revenue: number;
      costs: number;
      result: number;
      margin: number;
      freightCount: number;
      raw: PartnerProfitabilityRow;
    };

const viewLabels: Record<ProfitabilityView, string> = {
  vehicles: "Por Caminhão",
  freights: "Por Frete",
  partners: "Por Cliente",
};

const viewSingularLabels: Record<ProfitabilityView, string> = {
  vehicles: "caminhão",
  freights: "frete",
  partners: "cliente",
};

function sortRankingItems(items: RankingItem[], sort: ProfitabilitySort) {
  return [...items].sort((a, b) => {
    if (sort === "lowest_profit") return a.result - b.result;
    if (sort === "highest_revenue") return b.revenue - a.revenue;
    if (sort === "highest_cost") return b.costs - a.costs;
    return b.result - a.result;
  });
}

function vehicleItem(row: VehicleProfitabilityRow): RankingItem {
  return {
    dimension: "vehicles",
    id: row.vehicleId,
    title: row.plate,
    subtitle: row.model || row.driverName || "Caminhão",
    meta: `${row.freightCount} frete(s) · ${row.implementModels.join(", ") || "Sem implemento"}`,
    revenue: row.revenue,
    costs: row.costs,
    result: row.result,
    margin: row.margin,
    freightCount: row.freightCount,
    raw: row,
  };
}

function freightItem(row: FreightProfitabilityRow): RankingItem {
  return {
    dimension: "freights",
    id: row.freightId,
    title: row.plate,
    subtitle: `${row.senderName} -> ${row.recipientName}`,
    meta: `${row.billingPartnerName} · ${row.paymentType || "Sem CIF/FOB"} · ${dateLabel(row.completedAt)}`,
    revenue: row.revenue,
    costs: row.costs,
    result: row.result,
    margin: row.margin,
    freightCount: 1,
    raw: row,
  };
}

function partnerItem(row: PartnerProfitabilityRow): RankingItem {
  return {
    dimension: "partners",
    id: row.partnerId ?? row.partnerName,
    title: row.partnerName,
    subtitle: `${row.freightCount} frete(s) no período`,
    meta: "Cliente pagador",
    revenue: row.revenue,
    costs: row.costs,
    result: row.result,
    margin: row.margin,
    freightCount: row.freightCount,
    raw: row,
  };
}

function marginTone(value: number) {
  if (value < 0) return "negative";
  if (value === 0) return "neutral";
  return "positive";
}

function ExecutiveStrip({ summary }: { summary: FleetProfitabilitySummary }) {
  const tone = marginTone(summary.margin);

  return (
    <section className="financial-profitability-executive">
      <div className="financial-profitability-result">
        <span>Resultado</span>
        <strong className={summary.result < 0 ? "financial-profitability-negative" : undefined}>
          {money(summary.result)}
        </strong>
        <small>Faturar mais não é lucrar mais</small>
      </div>
      <div className={cn("financial-profitability-margin", `is-${tone}`)}>
        <span>Margem</span>
        <strong className={`financial-profitability-${tone}`}>{percent(summary.margin)}</strong>
      </div>
      <div className="financial-profitability-executive-line">
        <MetricMini label="Faturamento" value={money(summary.revenue)} icon={ArrowUp} />
        <MetricMini label="Custos + despesas" value={money(summary.costs)} icon={ArrowDown} />
      </div>
    </section>
  );
}

function MetricMini({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
}) {
  return (
    <div className="financial-profitability-mini">
      <Icon className="size-4" />
      <span>{label}</span>
      <strong>{value}</strong>
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

function DimensionSelector({
  view,
  setView,
}: {
  view: ProfitabilityView;
  setView: (view: ProfitabilityView) => void;
}) {
  return (
    <section className="financial-profitability-dimensions" aria-label="Dimensão de rentabilidade">
      {(["vehicles", "freights", "partners"] as ProfitabilityView[]).map((value) => (
        <button
          key={value}
          type="button"
          className={cn(value === view && "is-active")}
          onClick={() => setView(value)}
        >
          {viewLabels[value]}
        </button>
      ))}
    </section>
  );
}

function RankingCard({
  item,
  index,
  maxResult,
  onClick,
}: {
  item: RankingItem;
  index: number;
  maxResult: number;
  onClick: () => void;
}) {
  const isNegative = item.result < 0;
  const barWidth = maxResult > 0 ? Math.max(6, Math.min(100, (Math.abs(item.result) / maxResult) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "financial-profitability-rank-card",
        index < 3 && "financial-profitability-rank-featured",
        isNegative && "financial-profitability-rank-negative",
      )}
    >
      <div className="financial-profitability-rank-top">
        <span>#{String(index + 1).padStart(2, "0")}</span>
        {item.dimension === "vehicles" ? <Truck className="size-4" /> : item.dimension === "freights" ? <RouteIcon className="size-4" /> : <Landmark className="size-4" />}
      </div>
      <div className="financial-profitability-rank-title">
        <strong>{item.title}</strong>
        <span>{item.subtitle}</span>
        <small>{item.meta}</small>
      </div>
      <div className="financial-profitability-rank-result">
        <span>Resultado</span>
        <strong className={isNegative ? "financial-profitability-negative" : undefined}>
          {money(item.result)}
        </strong>
      </div>
      <div className="financial-profitability-rank-metrics">
        <span>
          Margem{" "}
          <strong className={`financial-profitability-${marginTone(item.margin)}`}>
            {percent(item.margin)}
          </strong>
        </span>
        <span>Receita <strong>{money(item.revenue)}</strong></span>
        <span>Custos <strong>{money(item.costs)}</strong></span>
      </div>
      <div className="financial-profitability-bar" aria-hidden="true">
        <span style={{ width: `${barWidth}%` }} />
      </div>
    </button>
  );
}

function FreightList({ rows, onSelect }: { rows: FreightProfitabilityRow[]; onSelect?: (item: RankingItem) => void }) {
  if (!rows.length) {
    return <EmptyState />;
  }
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <button
          key={row.freightId}
          type="button"
          onClick={() => onSelect?.(freightItem(row))}
          className="financial-profitability-freight-row"
        >
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
        </button>
      ))}
    </div>
  );
}

function EmptyState({
  text = "Nenhum dado de rentabilidade para o período selecionado.",
}: {
  text?: string;
}) {
  return (
    <div className="financial-profitability-empty">
      <strong>{text}</strong>
      <span>Conclua fretes e registre receitas/despesas para formar a análise.</span>
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
  const [selectedItem, setSelectedItem] = useState<RankingItem | null>(null);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [rankingSearch, setRankingSearch] = useState("");
  const [rankingSort, setRankingSort] = useState<ProfitabilitySort>("most_profitable");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const vehicles = useFleet((state) => state.vehicles);
  const senders = useFleet((state) => state.senders);
  const recipients = useFleet((state) => state.recipients);
  const products = useFleet((state) => state.products);
  const trailers = useFleet((state) => state.trailers);
  const loadAll = useFleet((state) => state.loadAll);

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

  const activeRanking = useMemo(() => {
    if (view === "freights") return freightsProfit.map(freightItem);
    if (view === "partners") return partnersProfit.map(partnerItem);
    return vehiclesProfit.map(vehicleItem);
  }, [freightsProfit, partnersProfit, vehiclesProfit, view]);

  const rankedItems = useMemo(() => sortRankingItems(activeRanking, sort), [activeRanking, sort]);
  const topItems = rankedItems.slice(0, 10);
  const maxResult = Math.max(0, ...topItems.map((item) => Math.abs(item.result)));
  const attentionItems = useMemo(
    () =>
      [...activeRanking]
        .sort((a, b) => {
          if (a.result < 0 || b.result < 0) return a.result - b.result;
          return a.margin - b.margin;
        })
        .slice(0, 5),
    [activeRanking],
  );
  const rankingItems = useMemo(() => {
    const searched = rankingSearch.trim().toLocaleLowerCase("pt-BR");
    const rows = searched
      ? activeRanking.filter((item) =>
          `${item.title} ${item.subtitle} ${item.meta}`.toLocaleLowerCase("pt-BR").includes(searched),
        )
      : activeRanking;
    return sortRankingItems(rows, rankingSort);
  }, [activeRanking, rankingSearch, rankingSort]);

  const selectedFreights = useMemo(() => {
    if (!selectedItem) return [];
    if (selectedItem.dimension === "vehicles") {
      return freightsProfit.filter((freight) => freight.vehicleId === selectedItem.raw.vehicleId);
    }
    if (selectedItem.dimension === "partners") {
      return freightsProfit.filter((freight) => freight.billingPartnerId === selectedItem.raw.partnerId);
    }
    return [selectedItem.raw];
  }, [freightsProfit, selectedItem]);

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
    <div className="financial-shell financial-profitability-shell">
      <PageHeader
        title="Rentabilidade"
        subtitle="Resultado real da operação por caminhão, frete e cliente"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportReport}>
              <Download className="size-4" />
              Exportar Relatório
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              Atualizar
            </Button>
          </>
        }
      />
      <FinancialNav />

      <DimensionSelector view={view} setView={setView} />

      <section className="financial-profitability-filters">
        <div className="financial-profitability-filter-head">
          <div>
            <p className="financial-section-kicker">Filtros</p>
            <h2>Período e operação</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX className="size-4" />
            Limpar
          </Button>
        </div>
        <div className="financial-profitability-filter-primary">
          <Field label="Período inicial">
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) => updateFilter("startDate", event.target.value)}
            />
          </Field>
          <Field label="Período final">
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
        </div>
        <details className="financial-profitability-more-filters">
          <summary>Mais filtros</summary>
          <div className="financial-profitability-filter-secondary">
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
            <Field label="Ordenação">
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
        </details>
      </section>

      <ExecutiveStrip summary={summary} />

      {summary.unallocatedCosts > 0 && (
        <div className="financial-profitability-warning">
          Custos não alocados: {money(summary.unallocatedCosts)}. Eles não foram distribuídos entre
          caminhões porque não possuem vínculo confiável com veículo ou frete.
        </div>
      )}

      {error && (
        <div className="financial-profitability-error">{error}</div>
      )}

      <section className="financial-profitability-ranking">
        <div className="financial-profitability-ranking-head">
          <div>
            <p className="financial-section-kicker">{viewLabels[view]}</p>
            <h2>Top 10 mais rentáveis</h2>
            <span>
              Resultado e margem comandam o ranking no período {filters.startDate} a{" "}
              {filters.endDate}.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRankingSort(sort);
              setRankingSearch("");
              setRankingOpen(true);
            }}
          >
            Ver todos
          </Button>
        </div>
        {loading ? (
          <EmptyState text={`Carregando rentabilidade ${viewSingularLabels[view]}...`} />
        ) : topItems.length ? (
          <div className="financial-profitability-top-grid">
            {topItems.map((item, index) => (
              <RankingCard
                key={`${item.dimension}-${item.id}`}
                item={item}
                index={index}
                maxResult={maxResult}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      <section className="financial-profitability-analysis">
        <div className="financial-profitability-attention">
          <div>
            <p className="financial-section-kicker">Análise</p>
            <h2>Pontos de atenção</h2>
          </div>
          {attentionItems.length ? (
            <div className="financial-profitability-attention-list">
              {attentionItems.map((item, index) => (
                <button
                  key={`${item.dimension}-attention-${item.id}`}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className={cn(
                    "financial-profitability-attention-row",
                    item.result < 0 && "is-negative",
                  )}
                >
                  <span>{index + 1}</span>
                  <strong>{item.title}</strong>
                  <small>{percent(item.margin)}</small>
                  <b>{money(item.result)}</b>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState text="Nenhum ponto de atenção no período selecionado." />
          )}
        </div>
        <div className="financial-profitability-compare">
          <p className="financial-section-kicker">Comparação</p>
          <h2>Resultado acima de faturamento</h2>
          <p>
            A leitura prioriza lucro e margem. Receita aparece como contexto operacional, não como
            sinônimo de performance.
          </p>
          <div>
            <MetricMini label="Itens analisados" value={String(activeRanking.length)} icon={RouteIcon} />
            <MetricMini label="Prejuízos" value={String(activeRanking.filter((item) => item.result < 0).length)} icon={ArrowDown} />
          </div>
        </div>
      </section>

      <Dialog open={rankingOpen} onOpenChange={setRankingOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Ranking completo - {viewLabels[view]}</DialogTitle>
            <DialogDescription>
              Mesma dimensão, período e filtros atuais. Ordenação feita com os dados já carregados.
            </DialogDescription>
          </DialogHeader>
          <div className="financial-profitability-modal-tools">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar no ranking"
                value={rankingSearch}
                onChange={(event) => setRankingSearch(event.target.value)}
              />
            </div>
            <Select
              value={rankingSort}
              onValueChange={(value) => setRankingSort(value as ProfitabilitySort)}
            >
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
          </div>
          <div className="financial-profitability-table-wrap">
            <table className="financial-profitability-table">
              <thead>
                <tr>
                  <th>Posição</th>
                  <th>Entidade</th>
                  <th>Faturamento</th>
                  <th>Custos/despesas</th>
                  <th>Resultado</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {rankingItems.map((item, index) => (
                  <tr
                    key={`${item.dimension}-full-${item.id}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <td>#{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </td>
                    <td>{money(item.revenue)}</td>
                    <td>{money(item.costs)}</td>
                    <td className={item.result < 0 ? "financial-profitability-negative" : ""}>
                      {money(item.result)}
                    </td>
                    <td>{percent(item.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rankingItems.length && <EmptyState />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedItem?.title ?? "Rentabilidade"}</DialogTitle>
            <DialogDescription>
              Detalhamento da rentabilidade no período selecionado.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="financial-profitability-detail">
              <section className="financial-profitability-detail-head">
                <div>
                  <p className="financial-section-kicker">Detalhamento da rentabilidade</p>
                  <h2>{selectedItem.title}</h2>
                  <span>{selectedItem.subtitle}</span>
                </div>
                <div>
                  <span>Resultado</span>
                  <strong
                    className={selectedItem.result < 0 ? "financial-profitability-negative" : ""}
                  >
                    {money(selectedItem.result)}
                  </strong>
                  <small>Margem {percent(selectedItem.margin)}</small>
                </div>
              </section>
              <section className="financial-profitability-equation">
                <div>
                  <span>Receitas</span>
                  <strong>{money(selectedItem.revenue)}</strong>
                </div>
                <b>-</b>
                <div>
                  <span>Custos + despesas</span>
                  <strong>{money(selectedItem.costs)}</strong>
                </div>
                <b>=</b>
                <div className="is-result">
                  <span>Resultado</span>
                  <strong
                    className={selectedItem.result < 0 ? "financial-profitability-negative" : ""}
                  >
                    {money(selectedItem.result)}
                  </strong>
                  <small>{percent(selectedItem.margin)}</small>
                </div>
              </section>
              <section className="financial-profitability-breakdown">
                <div>
                  <h3>Receitas</h3>
                  <div className="financial-profitability-breakdown-row">
                    <span>Total de receitas atribuído pela fonte canônica</span>
                    <strong>{money(selectedItem.revenue)}</strong>
                  </div>
                </div>
                <div>
                  <h3>Custos e despesas</h3>
                  <div className="financial-profitability-breakdown-row">
                    <span>Total de custos/despesas atribuído pela fonte canônica</span>
                    <strong>{money(selectedItem.costs)}</strong>
                  </div>
                </div>
              </section>
              <section className="financial-profitability-related">
                <h3>Fretes relacionados</h3>
                <FreightList rows={selectedFreights} onSelect={setSelectedItem} />
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
