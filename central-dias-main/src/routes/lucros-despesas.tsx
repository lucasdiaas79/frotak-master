import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CircleDollarSign,
  FilterX,
  MapPin,
  Package,
  Percent,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listFreightExpenses } from "@/lib/services/freight-expenses";
import { listFreightHistory } from "@/lib/services/freight-history";
import { supabase } from "@/lib/supabase";
import { useFleet } from "@/lib/store";
import type { FreightExpense, FreightHistory, Trailer, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lucros-despesas")({
  head: () => ({
    meta: [
      { title: "Receitas e Despesas - Central Transportes" },
      {
        name: "description",
        content: "Relatorio financeiro por caminhao, frete e periodo.",
      },
    ],
  }),
  component: ReceitasDespesasPage,
});

type FreightFinancialSource = {
  id: string;
  freightId: string;
  vehicleId?: string;
  plate: string;
  driverName?: string;
  senderId?: string;
  senderName: string;
  recipientId?: string;
  recipientName: string;
  productId?: string;
  productName: string;
  implementModels: string[];
  freightValue: number;
  date?: string;
};

type TruckSummary = {
  id: string;
  plate: string;
  driverName: string;
  implementModels: Set<string>;
  freightCount: number;
  revenue: number;
  expenses: number;
  profit: number;
};

type Filters = {
  startDate: string;
  endDate: string;
  plate: string;
  senderId: string;
  recipientId: string;
  productId: string;
  implementModel: string;
};

const ALL = "all";
const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(value: number) {
  return moneyFormatter.format(value);
}

function percent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function margin(revenue: number, profit: number) {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthPeriod() {
  const now = new Date();
  return {
    startDate: localDateValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: localDateValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function initialFilters(): Filters {
  return {
    ...currentMonthPeriod(),
    plate: ALL,
    senderId: ALL,
    recipientId: ALL,
    productId: ALL,
    implementModel: ALL,
  };
}

function isWithinPeriod(value: string | undefined, startDate: string, endDate: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T23:59:59.999`).getTime();
  return time >= start && time <= end;
}

function trailerModelsForVehicle(vehicle: Vehicle, trailersById: Map<string, Trailer>) {
  const trailerIds = vehicle.trailerIds?.length
    ? vehicle.trailerIds
    : vehicle.trailerId
      ? [vehicle.trailerId]
      : [];

  return Array.from(
    new Set(
      trailerIds
        .map((id) => {
          const trailer = trailersById.get(id);
          return (
            trailer?.implementModel || trailer?.model || trailer?.implementType || trailer?.type
          );
        })
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  );
}

function historyTrailerModels(item: FreightHistory, trailersById: Map<string, Trailer>) {
  const trailer = item.trailerId ? trailersById.get(item.trailerId) : undefined;
  const model =
    trailer?.implementModel || trailer?.model || trailer?.implementType || trailer?.type;
  return model?.trim() ? [model.trim()] : [];
}

function ReceitasDespesasPage() {
  const { vehicles, drivers, trailers, senders, recipients, products, loadAll } = useFleet();
  const [expenses, setExpenses] = useState<FreightExpense[]>([]);
  const [history, setHistory] = useState<FreightHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filters, setFilters] = useState<Filters>(initialFilters);

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

  const freightSources = useMemo(() => {
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const trailerById = new Map(trailers.map((trailer) => [trailer.id, trailer]));
    const senderById = new Map(senders.map((sender) => [sender.id, sender]));
    const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
    const productById = new Map(products.map((product) => [product.id, product]));

    const activeFreights: FreightFinancialSource[] = vehicles
      .filter((vehicle) => vehicle.currentFreightId)
      .map((vehicle) => {
        const sender = vehicle.senderId ? senderById.get(vehicle.senderId) : undefined;
        const recipient = vehicle.recipientId ? recipientById.get(vehicle.recipientId) : undefined;
        const product = vehicle.productId ? productById.get(vehicle.productId) : undefined;
        const driver = vehicle.driverId ? driverById.get(vehicle.driverId) : undefined;

        return {
          id: vehicle.id,
          freightId: vehicle.currentFreightId!,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          driverName: driver?.name,
          senderId: vehicle.senderId,
          senderName: sender?.name ?? "Sem origem",
          recipientId: vehicle.recipientId,
          recipientName: recipient?.name ?? "Sem destino",
          productId: vehicle.productId,
          productName: product?.name ?? "Sem produto",
          implementModels: trailerModelsForVehicle(vehicle, trailerById),
          freightValue: vehicle.freightValue ?? 0,
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
      senderName: item.senderName ?? "Sem origem",
      recipientId: item.recipientId,
      recipientName: item.recipientName ?? "Sem destino",
      productId: item.productId,
      productName: item.productName ?? "Sem produto",
      implementModels: historyTrailerModels(item, trailerById),
      freightValue: item.freightValue ?? 0,
      date: item.finishedAt,
    }));

    return [...activeFreights, ...finishedFreights];
  }, [drivers, history, products, recipients, senders, trailers, vehicles]);

  const options = useMemo(() => {
    const byLabel = <T extends { id: string; name: string }>(items: T[]) =>
      [...items].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return {
      plates: Array.from(new Set(freightSources.map((freight) => freight.plate))).sort(),
      senders: byLabel(senders),
      recipients: byLabel(recipients),
      products: byLabel(products),
      implementModels: Array.from(
        new Set(
          trailers
            .map(
              (trailer) =>
                trailer.implementModel || trailer.model || trailer.implementType || trailer.type,
            )
            .filter((value): value is string => Boolean(value?.trim()))
            .map((value) => value.trim()),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }, [freightSources, products, recipients, senders, trailers]);

  const report = useMemo(() => {
    const filteredFreights = freightSources.filter((freight) => {
      if (!isWithinPeriod(freight.date, filters.startDate, filters.endDate)) return false;
      if (filters.plate !== ALL && freight.plate !== filters.plate) return false;
      if (filters.senderId !== ALL && freight.senderId !== filters.senderId) return false;
      if (filters.recipientId !== ALL && freight.recipientId !== filters.recipientId) return false;
      if (filters.productId !== ALL && freight.productId !== filters.productId) return false;
      if (
        filters.implementModel !== ALL &&
        !freight.implementModels.includes(filters.implementModel)
      ) {
        return false;
      }
      return true;
    });

    const freightIds = new Set(filteredFreights.map((freight) => freight.freightId));
    const filteredExpenses = expenses.filter((expense) => freightIds.has(expense.freightId));
    const expensesByFreight = new Map<string, number>();
    filteredExpenses.forEach((expense) => {
      expensesByFreight.set(
        expense.freightId,
        (expensesByFreight.get(expense.freightId) ?? 0) + expense.amount,
      );
    });

    const trucks = new Map<string, TruckSummary>();
    filteredFreights.forEach((freight) => {
      const truckId = freight.vehicleId ?? freight.plate;
      const current = trucks.get(truckId) ?? {
        id: truckId,
        plate: freight.plate,
        driverName: freight.driverName ?? "Sem motorista",
        implementModels: new Set<string>(),
        freightCount: 0,
        revenue: 0,
        expenses: 0,
        profit: 0,
      };

      freight.implementModels.forEach((model) => current.implementModels.add(model));
      current.freightCount += 1;
      current.revenue += freight.freightValue;
      current.expenses += expensesByFreight.get(freight.freightId) ?? 0;
      current.profit = current.revenue - current.expenses;
      trucks.set(truckId, current);
    });

    const totalRevenue = filteredFreights.reduce((sum, freight) => sum + freight.freightValue, 0);
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalProfit = totalRevenue - totalExpenses;

    return {
      totalRevenue,
      totalExpenses,
      totalProfit,
      totalMargin: margin(totalRevenue, totalProfit),
      topTrucks: [...trucks.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    };
  }, [expenses, filters, freightSources]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Receitas e Despesas"
        subtitle="Financeiro operacional por caminhao e frete"
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="premium-card p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label-tiny">Filtros do relatorio</div>
            <h2 className="mt-1 text-[18px] font-extrabold text-foreground">
              Selecione o recorte financeiro
            </h2>
          </div>
          <Button
            variant="ghost"
            className="h-9 gap-2"
            onClick={() => setFilters(initialFilters())}
          >
            <FilterX className="size-4" />
            Limpar filtros
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <FilterField label="Periodo inicial" icon={CalendarDays}>
            <Input
              type="date"
              value={filters.startDate}
              max={filters.endDate}
              onChange={(event) => updateFilter("startDate", event.target.value)}
              className="h-10"
            />
          </FilterField>
          <FilterField label="Periodo final" icon={CalendarDays}>
            <Input
              type="date"
              value={filters.endDate}
              min={filters.startDate}
              onChange={(event) => updateFilter("endDate", event.target.value)}
              className="h-10"
            />
          </FilterField>
          <FilterSelect
            label="Placa"
            value={filters.plate}
            placeholder="Todas as placas"
            options={options.plates.map((plate) => ({ value: plate, label: plate }))}
            onChange={(value) => updateFilter("plate", value)}
          />
          <FilterSelect
            label="Origem"
            value={filters.senderId}
            placeholder="Todas as origens"
            options={options.senders.map((sender) => ({ value: sender.id, label: sender.name }))}
            onChange={(value) => updateFilter("senderId", value)}
          />
          <FilterSelect
            label="Destino"
            value={filters.recipientId}
            placeholder="Todos os destinos"
            options={options.recipients.map((recipient) => ({
              value: recipient.id,
              label: recipient.name,
            }))}
            onChange={(value) => updateFilter("recipientId", value)}
          />
          <FilterSelect
            label="Produto"
            value={filters.productId}
            placeholder="Todos os produtos"
            options={options.products.map((product) => ({
              value: product.id,
              label: product.name,
            }))}
            onChange={(value) => updateFilter("productId", value)}
          />
          <FilterSelect
            label="Modelo implemento"
            value={filters.implementModel}
            placeholder="Todos os modelos"
            options={options.implementModels.map((model) => ({ value: model, label: model }))}
            onChange={(value) => updateFilter("implementModel", value)}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 px-1">
          <div>
            <div className="label-tiny">Maior faturamento no periodo</div>
            <h2 className="mt-1 text-[20px] font-extrabold text-foreground">Top 10 caminhões</h2>
          </div>
          <span className="text-[12px] font-semibold text-muted-foreground">
            {report.topTrucks.length} veiculo(s)
          </span>
        </div>

        {loading ? (
          <div className="premium-card px-5 py-10 text-center text-[13px] font-semibold text-muted-foreground">
            Carregando financeiro...
          </div>
        ) : report.topTrucks.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {report.topTrucks.map((truck, index) => (
              <TruckRevenueCard key={truck.id} truck={truck} position={index + 1} />
            ))}
          </div>
        ) : (
          <div className="premium-card px-5 py-10 text-center text-[13px] font-semibold text-muted-foreground">
            Nenhum frete faturado para os filtros selecionados.
          </div>
        )}
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
        <div className="min-w-0">
          <div className="label-tiny">{label}</div>
          <div className="mt-3 truncate font-sans text-[26px] font-black text-foreground">
            {value}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border bg-surface-2/70",
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

function FilterField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <label className="min-w-0 space-y-1.5">
      <span className="flex items-center gap-1.5 font-sans text-[10px] font-bold uppercase text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </span>
      {children}
    </label>
  );
}

function FilterSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <FilterField label={label} icon={label === "Produto" ? Package : MapPin}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

function TruckRevenueCard({ truck, position }: { truck: TruckSummary; position: number }) {
  const implementLabel = [...truck.implementModels].join(" + ") || "Sem modelo informado";

  return (
    <article className="premium-card overflow-hidden p-4 transition-colors hover:border-primary/35">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border font-sans text-[13px] font-black",
              position <= 3
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border bg-surface-2 text-muted-foreground",
            )}
          >
            {position}º
          </span>
          <div className="min-w-0">
            <div className="truncate font-sans text-[17px] font-black text-foreground">
              {truck.plate}
            </div>
            <div className="truncate text-[11px] font-semibold text-muted-foreground">
              {truck.driverName}
            </div>
          </div>
        </div>
        <Truck className="size-5 shrink-0 text-primary" />
      </div>

      <div className="mt-4 border-y border-border/70 py-3">
        <div className="label-tiny">Faturamento</div>
        <div className="mt-1 font-sans text-[23px] font-black text-success">
          {money(truck.revenue)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 font-sans text-[11px] font-bold">
        <div>
          <div className="text-muted-foreground">Fretes</div>
          <div className="mt-0.5 text-foreground">{truck.freightCount}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Despesas</div>
          <div className="mt-0.5 text-destructive">{money(truck.expenses)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Resultado</div>
          <div className={cn("mt-0.5", truck.profit >= 0 ? "text-success" : "text-destructive")}>
            {money(truck.profit)}
          </div>
        </div>
      </div>

      <div className="mt-3 truncate border-t border-border/70 pt-3 text-[11px] font-semibold text-muted-foreground">
        {implementLabel}
      </div>
    </article>
  );
}
