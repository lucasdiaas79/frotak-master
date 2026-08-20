import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CircleDollarSign,
  Percent,
  ReceiptText,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Trophy,
  Truck,
} from "lucide-react";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listFreightExpenses } from "@/lib/services/freight-expenses";
import { listFreightHistory } from "@/lib/services/freight-history";
import { supabase } from "@/lib/supabase";
import { useFleet } from "@/lib/store";
import {
  FREIGHT_EXPENSE_CATEGORY_LABEL,
  type FreightExpense,
  type FreightHistory,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lucros-despesas")({
  head: () => ({
    meta: [
      { title: "Lucros e Despesas - Central Transportes" },
      {
        name: "description",
        content: "Relatorio financeiro por caminhao, frete e embarcador.",
      },
    ],
  }),
  component: LucrosDespesasPage,
});

type FreightFinancialSource = {
  id: string;
  freightId: string;
  vehicleId?: string;
  plate: string;
  driverName?: string;
  senderId?: string;
  senderName: string;
  productName: string;
  freightValue: number;
  status: "active" | "finished";
  date?: string;
};

type RankingRow = {
  id: string;
  label: string;
  subtitle: string;
  freightCount: number;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function money(value: number) {
  return moneyFormatter.format(value);
}

function percent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function safeDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormatter.format(date);
}

function margin(revenue: number, profit: number) {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

function addRankingValue(map: Map<string, RankingRow>, id: string, input: Partial<RankingRow>) {
  const current = map.get(id) ?? {
    id,
    label: input.label ?? "-",
    subtitle: input.subtitle ?? "-",
    freightCount: 0,
    revenue: 0,
    expenses: 0,
    profit: 0,
    margin: 0,
  };

  const nextRevenue = current.revenue + (input.revenue ?? 0);
  const nextExpenses = current.expenses + (input.expenses ?? 0);
  const nextProfit = nextRevenue - nextExpenses;

  map.set(id, {
    ...current,
    label: input.label ?? current.label,
    subtitle: input.subtitle ?? current.subtitle,
    freightCount: current.freightCount + (input.freightCount ?? 0),
    revenue: nextRevenue,
    expenses: nextExpenses,
    profit: nextProfit,
    margin: margin(nextRevenue, nextProfit),
  });
}

function LucrosDespesasPage() {
  const { vehicles, drivers, senders, products, loadAll } = useFleet();
  const [expenses, setExpenses] = useState<FreightExpense[]>([]);
  const [history, setHistory] = useState<FreightHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [expenseRows, historyRows] = await Promise.all([
        listFreightExpenses(),
        listFreightHistory(),
        loadAll(),
      ]);
      setExpenses(expenseRows);
      setHistory(historyRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar o relatorio.");
    } finally {
      setLoading(false);
    }
  }, [loadAll]);

  useEffect(() => {
    void reload();

    const channel = supabase
      .channel("financial-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "freight_expenses" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "freight_history" },
        () => void reload(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  const report = useMemo(() => {
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const senderById = new Map(senders.map((sender) => [sender.id, sender]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    const activeFreights: FreightFinancialSource[] = vehicles
      .filter((vehicle) => vehicle.currentFreightId)
      .map((vehicle) => {
        const sender = vehicle.senderId ? senderById.get(vehicle.senderId) : undefined;
        const product = vehicle.productId ? productById.get(vehicle.productId) : undefined;
        const driver = vehicle.driverId ? driverById.get(vehicle.driverId) : undefined;

        return {
          id: vehicle.id,
          freightId: vehicle.currentFreightId!,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          driverName: driver?.name,
          senderId: vehicle.senderId,
          senderName: sender?.name ?? "Sem embarcador",
          productName: product?.name ?? "-",
          freightValue: vehicle.freightValue ?? 0,
          status: "active",
          date: vehicle.updatedAt,
        };
      });

    const finishedFreights: FreightFinancialSource[] = history.map((item) => ({
      id: item.id,
      freightId: item.freightId ?? item.id,
      vehicleId: item.vehicleId,
      plate: item.vehiclePlate,
      driverName: item.driverName,
      senderId: item.senderId,
      senderName: item.senderName ?? "Sem embarcador",
      productName: item.productName ?? "-",
      freightValue: item.freightValue ?? 0,
      status: "finished",
      date: item.finishedAt,
    }));

    const freightSources = [...activeFreights, ...finishedFreights];
    const freightById = new Map(freightSources.map((freight) => [freight.freightId, freight]));
    const expensesByFreight = new Map<string, FreightExpense[]>();

    expenses.forEach((expense) => {
      const current = expensesByFreight.get(expense.freightId) ?? [];
      current.push(expense);
      expensesByFreight.set(expense.freightId, current);
    });

    const truckStats = new Map<string, RankingRow>();
    const senderStats = new Map<string, RankingRow>();

    freightSources.forEach((freight) => {
      const freightExpenses = expensesByFreight.get(freight.freightId) ?? [];
      const expenseTotal = freightExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const truckId = freight.vehicleId ?? freight.plate;

      addRankingValue(truckStats, truckId, {
        label: freight.plate,
        subtitle: freight.driverName ?? "Sem motorista",
        freightCount: 1,
        revenue: freight.freightValue,
        expenses: expenseTotal,
      });

      addRankingValue(senderStats, freight.senderId ?? freight.senderName, {
        label: freight.senderName,
        subtitle: freight.productName,
        freightCount: 1,
        revenue: freight.freightValue,
        expenses: expenseTotal,
      });
    });

    expenses.forEach((expense) => {
      if (freightById.has(expense.freightId)) return;
      const vehicle = expense.vehicleId ? vehicleById.get(expense.vehicleId) : undefined;
      addRankingValue(truckStats, expense.vehicleId ?? expense.id, {
        label: vehicle?.plate ?? "Sem veiculo",
        subtitle: "Despesa sem frete vinculado",
        expenses: expense.amount,
      });
    });

    const totalRevenue = freightSources.reduce((sum, freight) => sum + freight.freightValue, 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalProfit = totalRevenue - totalExpenses;

    return {
      freightSources,
      freightById,
      totalRevenue,
      totalExpenses,
      totalProfit,
      totalMargin: margin(totalRevenue, totalProfit),
      truckRanking: [...truckStats.values()].sort((a, b) => b.profit - a.profit),
      senderRanking: [...senderStats.values()].sort((a, b) => b.profit - a.profit),
    };
  }, [drivers, expenses, history, products, senders, vehicles]);

  const filteredExpenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expenses.filter((expense) => {
      const freight = report.freightById.get(expense.freightId);
      const haystack = [
        expense.description,
        FREIGHT_EXPENSE_CATEGORY_LABEL[expense.category],
        freight?.plate,
        freight?.senderName,
        freight?.productName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !needle || haystack.includes(needle);
    });
  }, [expenses, query, report.freightById]);

  return (
    <div className="space-y-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Lucros e Despesas"
        subtitle="Financeiro operacional por caminhao, frete e embarcador"
        actions={
          <Button variant="outline" className="h-10 gap-2" onClick={() => void reload()}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        }
        className="mx-0 mt-3 md:mt-0"
      />

      {error ? (
        <div className="premium-card border-destructive/25 bg-destructive/5 p-5 text-[13px] font-semibold text-destructive">
          Nao foi possivel carregar o relatorio financeiro. Tente novamente.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Faturamento"
          value={money(report.totalRevenue)}
          tone="success"
        />
        <MetricCard icon={ReceiptText} label="Despesas" value={money(report.totalExpenses)} />
        <MetricCard
          icon={report.totalProfit >= 0 ? TrendingUp : TrendingDown}
          label="Lucro"
          value={money(report.totalProfit)}
          tone={report.totalProfit >= 0 ? "success" : "danger"}
        />
        <MetricCard icon={Percent} label="Margem" value={percent(report.totalMargin)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <RankingPanel
          title="Ranking de caminhões"
          subtitle="Ordenado por lucro operacional"
          icon={Truck}
          rows={report.truckRanking}
          empty="Nenhum caminhao com receita ou despesa registrada."
        />
        <RankingPanel
          title="Ranking de embarcadores"
          subtitle="Quem mais gera resultado"
          icon={Building2}
          rows={report.senderRanking}
          empty="Nenhum embarcador com frete faturado."
        />
      </section>

      <section className="premium-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/80 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="label-tiny">Relatorio de despesas</div>
            <h2 className="mt-1 text-[18px] font-extrabold text-foreground">Despesas por frete</h2>
          </div>
          <div className="relative min-w-0 md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar placa, embarcador ou despesa"
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[920px]">
            <thead>
              <tr>
                <th>Data</th>
                <th>Caminhao</th>
                <th>Embarcador</th>
                <th>Categoria</th>
                <th>Descricao</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => {
                const freight = report.freightById.get(expense.freightId);
                return (
                  <tr key={expense.id}>
                    <td>{safeDate(expense.recordedAt)}</td>
                    <td className="font-sans font-black">{freight?.plate ?? "-"}</td>
                    <td>{freight?.senderName ?? "-"}</td>
                    <td>{FREIGHT_EXPENSE_CATEGORY_LABEL[expense.category]}</td>
                    <td>{expense.description}</td>
                    <td className="font-sans font-black text-destructive">
                      {money(expense.amount)}
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhuma despesa registrada para o filtro atual.
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Carregando financeiro...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div
      className={cn(
        "premium-card min-h-[116px] p-4",
        tone === "success" && "border-success/30 bg-success/5",
        tone === "danger" && "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label-tiny">{label}</div>
          <div className="mt-3 font-sans text-[26px] font-black text-foreground">{value}</div>
        </div>
        <span
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-2xl border bg-surface-2/70",
            tone === "success"
              ? "border-success/25 text-success"
              : tone === "danger"
                ? "border-destructive/25 text-destructive"
                : "border-border text-primary",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function RankingPanel({
  title,
  subtitle,
  icon: Icon,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  rows: RankingRow[];
  empty: string;
}) {
  return (
    <section className="premium-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-4">
        <div className="min-w-0">
          <div className="label-tiny">{subtitle}</div>
          <h2 className="mt-1 text-[18px] font-extrabold text-foreground">{title}</h2>
        </div>
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
      </div>

      <div className="divide-y divide-border/80">
        {rows.slice(0, 8).map((row, index) => (
          <div
            key={row.id}
            className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  "inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border font-sans text-[12px] font-black",
                  index === 0
                    ? "border-warning/25 bg-warning/10 text-warning"
                    : "border-border bg-surface-2/70 text-muted-foreground",
                )}
              >
                {index === 0 ? <Trophy className="size-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <div className="truncate font-sans text-[14px] font-black text-foreground">
                  {row.label}
                </div>
                <div className="truncate text-[12px] font-semibold text-muted-foreground">
                  {row.subtitle} · {row.freightCount} frete(s)
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right font-sans text-[12px] font-bold md:min-w-[330px]">
              <div>
                <div className="text-muted-foreground">Fat.</div>
                <div>{money(row.revenue)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Desp.</div>
                <div className="text-destructive">{money(row.expenses)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Lucro</div>
                <div className={row.profit >= 0 ? "text-success" : "text-destructive"}>
                  {money(row.profit)}
                </div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] font-semibold text-muted-foreground">
            {empty}
          </div>
        ) : null}
      </div>
    </section>
  );
}
