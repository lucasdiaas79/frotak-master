import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Calculator,
  CircleDollarSign,
  Download,
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
import { listFreightExpenses } from "@/lib/services/freight-expenses";
import { listFreightHistory } from "@/lib/services/freight-history";
import { supabase } from "@/lib/supabase";
import { useFleet } from "@/lib/store";
import {
  FREIGHT_EXPENSE_CATEGORY_LABEL,
  type FreightExpense,
  type FreightExpenseCategory,
  type FreightHistory,
  type Trailer,
  type Vehicle,
} from "@/lib/types";
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
  isDemo?: boolean;
};

type TruckDetailData = {
  freights: FreightFinancialSource[];
  expenses: FreightExpense[];
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
const DEMO_TRUCKS: TruckSummary[] = [
  ["QMB0J31", "Adriano Jose de Oliveira", "Silo", 48620, 12180, 5],
  ["QMF4J77", "Misael Santos", "Basculante 4 eixos", 44250, 10940, 5],
  ["RRG4J84", "Renildo da Silva", "Silo", 41890, 9840, 4],
  ["QMJ6E24", "Geilson Barreto de Souza", "Basculante 3 eixos", 39640, 10320, 4],
  ["RRA5D83", "Elias Barbosa Reis", "Silo", 37450, 8760, 4],
  ["QMPIJ25", "Cleone Melo Santos", "Basculante 4 eixos", 35280, 8420, 4],
  ["SKE0H10", "Andre Ferreira Ramos", "Silo", 33190, 7950, 3],
  ["OEP4630", "Marcio Ferreira de Oliveira", "Basculante 3 eixos", 31870, 7640, 3],
  ["OER5D76", "Joao Carlos dos Santos", "Silo", 29640, 6930, 3],
  ["QMH9957", "Jailson dos Santos", "Basculante 4 eixos", 28150, 6680, 3],
].map(([plate, driverName, implementModel, revenue, expenses, freightCount], index) => ({
  id: `demo-truck-${index + 1}`,
  plate: String(plate),
  driverName: String(driverName),
  implementModels: new Set([String(implementModel)]),
  freightCount: Number(freightCount),
  revenue: Number(revenue),
  expenses: Number(expenses),
  profit: Number(revenue) - Number(expenses),
  isDemo: true,
}));
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

function demoDate(startDate: string, endDate: string, offset: number) {
  const date = new Date(`${startDate}T12:00:00`);
  const maximum = new Date(`${endDate}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return new Date(Math.min(date.getTime(), maximum.getTime())).toISOString();
}

function buildDemoDetail(truck: TruckSummary, startDate: string, endDate: string): TruckDetailData {
  const senders = ["CSN", "Votorantim Cimentos", "Porto TMIB"];
  const recipients = ["Central Transportes", "Terminal Maruim", "Porto de Sergipe"];
  const products = ["Clinquer", "Gesso", "Areia media"];
  const categories: FreightExpenseCategory[] = [
    "diesel_s10",
    "arla",
    "pedagio",
    "alimentacao",
    "estacionamento",
    "manutencao",
  ];
  const freightCount = Math.max(truck.freightCount, 1);
  const baseRevenue = Math.floor((truck.revenue / freightCount) * 100) / 100;
  const baseExpense = Math.floor((truck.expenses / categories.length) * 100) / 100;

  const freights = Array.from({ length: freightCount }, (_, index) => ({
    id: `demo-freight-${truck.id}-${index}`,
    freightId: `demo-freight-${truck.id}-${index}`,
    vehicleId: truck.id,
    plate: truck.plate,
    driverName: truck.driverName,
    senderId: `demo-sender-${index % senders.length}`,
    senderName: senders[index % senders.length],
    recipientId: `demo-recipient-${index % recipients.length}`,
    recipientName: recipients[index % recipients.length],
    productId: `demo-product-${index % products.length}`,
    productName: products[index % products.length],
    implementModels: [...truck.implementModels],
    freightValue:
      index === freightCount - 1 ? truck.revenue - baseRevenue * (freightCount - 1) : baseRevenue,
    date: demoDate(startDate, endDate, index * 3),
  }));

  const expenses = categories.map((category, index) => ({
    id: `demo-expense-${truck.id}-${index}`,
    freightId: freights[index % freights.length].freightId,
    vehicleId: truck.id,
    category,
    description: FREIGHT_EXPENSE_CATEGORY_LABEL[category],
    amount:
      index === categories.length - 1
        ? truck.expenses - baseExpense * (categories.length - 1)
        : baseExpense,
    source: "driver_app" as const,
    recordedAt: demoDate(startDate, endDate, index * 2 + 1),
    createdAt: demoDate(startDate, endDate, index * 2 + 1),
  }));

  return { freights, expenses };
}

function ReceitasDespesasPage() {
  const { vehicles, drivers, trailers, senders, recipients, products, loadAll } = useFleet();
  const [expenses, setExpenses] = useState<FreightExpense[]>([]);
  const [history, setHistory] = useState<FreightHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedTruck, setSelectedTruck] = useState<TruckSummary>();

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
      filteredFreights,
      filteredExpenses,
      topTrucks: [...trucks.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    };
  }, [expenses, filters, freightSources]);

  const displayTrucks = useMemo(() => {
    if (report.topTrucks.length >= 10) return report.topTrucks;
    const occupiedPlates = new Set(report.topTrucks.map((truck) => truck.plate));
    const demoComplements = DEMO_TRUCKS.filter((truck) => !occupiedPlates.has(truck.plate)).slice(
      0,
      10 - report.topTrucks.length,
    );
    return [...report.topTrucks, ...demoComplements].sort((a, b) => b.revenue - a.revenue);
  }, [report.topTrucks]);

  const selectedTruckDetail = useMemo(() => {
    if (!selectedTruck) return undefined;
    if (selectedTruck.isDemo) {
      return buildDemoDetail(selectedTruck, filters.startDate, filters.endDate);
    }

    const freights = report.filteredFreights.filter(
      (freight) => (freight.vehicleId ?? freight.plate) === selectedTruck.id,
    );
    const freightIds = new Set(freights.map((freight) => freight.freightId));
    return {
      freights,
      expenses: report.filteredExpenses.filter((expense) => freightIds.has(expense.freightId)),
    };
  }, [
    filters.endDate,
    filters.startDate,
    report.filteredExpenses,
    report.filteredFreights,
    selectedTruck,
  ]);

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
            {displayTrucks.length} veiculo(s)
          </span>
        </div>

        {loading ? (
          <div className="premium-card px-5 py-10 text-center text-[13px] font-semibold text-muted-foreground">
            Carregando financeiro...
          </div>
        ) : displayTrucks.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {displayTrucks.map((truck, index) => (
              <TruckRevenueCard
                key={truck.id}
                truck={truck}
                position={index + 1}
                onClick={() => setSelectedTruck(truck)}
              />
            ))}
          </div>
        ) : (
          <div className="premium-card px-5 py-10 text-center text-[13px] font-semibold text-muted-foreground">
            Nenhum frete faturado para os filtros selecionados.
          </div>
        )}
      </section>

      <TruckFinancialDialog
        truck={selectedTruck}
        detail={selectedTruckDetail}
        startDate={filters.startDate}
        endDate={filters.endDate}
        onClose={() => setSelectedTruck(undefined)}
      />
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

function TruckRevenueCard({
  truck,
  position,
  onClick,
}: {
  truck: TruckSummary;
  position: number;
  onClick: () => void;
}) {
  const implementLabel = [...truck.implementModels].join(" + ") || "Sem modelo informado";

  return (
    <button
      type="button"
      onClick={onClick}
      className="premium-card overflow-hidden p-4 text-left transition hover:border-primary/35 hover:bg-primary/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
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
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Truck className="size-5 text-primary" />
          {truck.isDemo ? (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">
              Demonstracao
            </span>
          ) : null}
        </div>
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
    </button>
  );
}

function shortDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

function periodLabel(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`).toLocaleDateString("pt-BR");
  const end = new Date(`${endDate}T12:00:00`).toLocaleDateString("pt-BR");
  return `${start} a ${end}`;
}

async function exportDrePdf(
  truck: TruckSummary,
  detail: TruckDetailData,
  startDate: string,
  endDate: string,
) {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ unit: "mm", format: "a4" });
  const revenue = detail.freights.reduce((sum, freight) => sum + freight.freightValue, 0);
  const expense = detail.expenses.reduce((sum, item) => sum + item.amount, 0);
  const result = revenue - expense;
  const categoryTotals = new Map<FreightExpenseCategory, number>();
  detail.expenses.forEach((item) => {
    categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.amount);
  });

  document.setTextColor(25, 30, 28);
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 12);
  document.text("FROTAK - RELATORIO FINANCEIRO OPERACIONAL", 196, 12, { align: "right" });
  document.setDrawColor(70, 80, 75);
  document.line(14, 16, 196, 16);

  document.setFont("helvetica", "bold");
  document.setFontSize(15);
  document.text("DEMONSTRATIVO DE RESULTADO POR EQUIPAMENTO", 105, 26, { align: "center" });
  document.setFontSize(10);
  document.text(`${truck.plate} - ${truck.driverName}`, 105, 33, { align: "center" });

  document.setFont("helvetica", "normal");
  document.setFontSize(9);
  document.text(`Periodo de competencia: ${periodLabel(startDate, endDate)}`, 14, 43);
  document.text(
    `Modelo implemento: ${[...truck.implementModels].join(" + ") || "Nao informado"}`,
    14,
    49,
  );

  const x = 14;
  const descriptionWidth = 122;
  const valueWidth = 30;
  const rowHeight = 8;
  let y = 57;

  const drawRow = (description: string, incoming?: number, outgoing?: number, emphasis = false) => {
    document.setFillColor(emphasis ? 232 : 248, emphasis ? 237 : 249, emphasis ? 234 : 248);
    document.rect(x, y, descriptionWidth + valueWidth * 2, rowHeight, "FD");
    document.line(x + descriptionWidth, y, x + descriptionWidth, y + rowHeight);
    document.line(
      x + descriptionWidth + valueWidth,
      y,
      x + descriptionWidth + valueWidth,
      y + rowHeight,
    );
    document.setFont("helvetica", emphasis ? "bold" : "normal");
    document.setFontSize(8.5);
    document.text(description, x + 2, y + 5.2);
    if (incoming !== undefined) {
      document.text(money(incoming), x + descriptionWidth + valueWidth - 2, y + 5.2, {
        align: "right",
      });
    }
    if (outgoing !== undefined) {
      document.text(money(outgoing), x + descriptionWidth + valueWidth * 2 - 2, y + 5.2, {
        align: "right",
      });
    }
    y += rowHeight;
  };

  document.setFillColor(222, 229, 225);
  document.rect(x, y, descriptionWidth + valueWidth * 2, rowHeight, "FD");
  document.setFont("helvetica", "bold");
  document.text("Conta", x + 2, y + 5.2);
  document.text("Entradas", x + descriptionWidth + 2, y + 5.2);
  document.text("Saidas", x + descriptionWidth + valueWidth + 2, y + 5.2);
  y += rowHeight;

  drawRow("1.001 - RECEITAS COM FRETES", revenue, undefined);
  drawRow("TOTAL DE RECEITAS", revenue, undefined, true);

  [...categoryTotals.entries()].forEach(([category, amount], index) => {
    drawRow(
      `2.${String(index + 1).padStart(3, "0")} - ${FREIGHT_EXPENSE_CATEGORY_LABEL[category].toUpperCase()}`,
      undefined,
      amount,
    );
  });
  drawRow("TOTAL DE DESPESAS", undefined, expense, true);
  drawRow(
    "RESULTADO DO PERIODO",
    result >= 0 ? result : undefined,
    result < 0 ? Math.abs(result) : undefined,
    true,
  );

  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.text(`${detail.freights.length} frete(s) considerado(s) no periodo.`, 14, y + 8);
  document.text("Documento gerado pelo sistema Frotak.", 196, 286, { align: "right" });
  document.save(`DRE-${truck.plate}-${startDate}-${endDate}.pdf`);
}

function TruckFinancialDialog({
  truck,
  detail,
  startDate,
  endDate,
  onClose,
}: {
  truck?: TruckSummary;
  detail?: TruckDetailData;
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
  const [senderFilter, setSenderFilter] = useState(ALL);
  const [recipientFilter, setRecipientFilter] = useState(ALL);
  const [productFilter, setProductFilter] = useState(ALL);
  const [expenseFilter, setExpenseFilter] = useState(ALL);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSenderFilter(ALL);
    setRecipientFilter(ALL);
    setProductFilter(ALL);
    setExpenseFilter(ALL);
  }, [truck?.id]);

  const revenueOptions = useMemo(() => {
    const freights = detail?.freights ?? [];
    const unique = (items: Array<{ value?: string; label: string }>) =>
      Array.from(
        new Map(items.filter((item) => item.value).map((item) => [item.value!, item])).values(),
      ).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return {
      senders: unique(
        freights.map((freight) => ({ value: freight.senderId, label: freight.senderName })),
      ),
      recipients: unique(
        freights.map((freight) => ({
          value: freight.recipientId,
          label: freight.recipientName,
        })),
      ),
      products: unique(
        freights.map((freight) => ({ value: freight.productId, label: freight.productName })),
      ),
    };
  }, [detail?.freights]);

  const filteredFreights = useMemo(
    () =>
      (detail?.freights ?? []).filter((freight) => {
        if (senderFilter !== ALL && freight.senderId !== senderFilter) return false;
        if (recipientFilter !== ALL && freight.recipientId !== recipientFilter) return false;
        if (productFilter !== ALL && freight.productId !== productFilter) return false;
        return true;
      }),
    [detail?.freights, productFilter, recipientFilter, senderFilter],
  );

  const filteredExpenses = useMemo(
    () =>
      (detail?.expenses ?? []).filter(
        (expense) => expenseFilter === ALL || expense.category === expenseFilter,
      ),
    [detail?.expenses, expenseFilter],
  );

  if (!truck || !detail) return null;

  const filteredRevenueTotal = filteredFreights.reduce(
    (sum, freight) => sum + freight.freightValue,
    0,
  );
  const filteredExpenseTotal = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const allRevenue = detail.freights.reduce((sum, freight) => sum + freight.freightValue, 0);
  const allExpenses = detail.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const result = allRevenue - allExpenses;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDrePdf(truck, detail, startDate, endDate);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-5 md:px-6">
          <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-[21px]">
                {truck.plate}
                {truck.isDemo ? (
                  <span className="rounded-md border border-border px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground">
                    Dados demonstrativos
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                {truck.driverName} · {periodLabel(startDate, endDate)}
              </DialogDescription>
            </div>
            <Button className="h-10 gap-2" onClick={() => void handleExport()} disabled={exporting}>
              <Download className="size-4" />
              {exporting ? "Gerando DRE..." : "Exportar DRE"}
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="receitas" className="min-h-0 overflow-y-auto px-4 pb-5 pt-4 md:px-6">
          <TabsList className="grid h-11 w-full grid-cols-3">
            <TabsTrigger value="receitas">Receitas</TabsTrigger>
            <TabsTrigger value="despesas">Despesas</TabsTrigger>
            <TabsTrigger value="resultado">Resultado</TabsTrigger>
          </TabsList>

          <TabsContent value="receitas" className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <FilterSelect
                label="Origem"
                value={senderFilter}
                placeholder="Todas as origens"
                options={revenueOptions.senders}
                onChange={setSenderFilter}
              />
              <FilterSelect
                label="Destino"
                value={recipientFilter}
                placeholder="Todos os destinos"
                options={revenueOptions.recipients}
                onChange={setRecipientFilter}
              />
              <FilterSelect
                label="Produto"
                value={productFilter}
                placeholder="Todos os produtos"
                options={revenueOptions.products}
                onChange={setProductFilter}
              />
            </div>

            <FinancialTotal
              label="Total de receitas"
              value={filteredRevenueTotal}
              description={`${filteredFreights.length} frete(s) no recorte selecionado`}
              tone="success"
            />

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="data-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Origem</th>
                      <th>Destino</th>
                      <th>Produto</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFreights.map((freight) => (
                      <tr key={freight.id}>
                        <td>{shortDate(freight.date)}</td>
                        <td>{freight.senderName}</td>
                        <td>{freight.recipientName}</td>
                        <td>{freight.productName}</td>
                        <td className="font-sans font-black text-success">
                          {money(freight.freightValue)}
                        </td>
                      </tr>
                    ))}
                    {!filteredFreights.length ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          Nenhuma receita encontrada para os filtros selecionados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="despesas" className="mt-4 space-y-4">
            <div className="max-w-sm">
              <FilterSelect
                label="Tipo de despesa"
                value={expenseFilter}
                placeholder="Todas as despesas"
                options={Object.entries(FREIGHT_EXPENSE_CATEGORY_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={setExpenseFilter}
              />
            </div>

            <FinancialTotal
              label="Total de despesas"
              value={filteredExpenseTotal}
              description={`${filteredExpenses.length} lancamento(s) no recorte selecionado`}
              tone="danger"
            />

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="data-table min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Despesa</th>
                      <th>Descricao</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{shortDate(expense.recordedAt)}</td>
                        <td>{FREIGHT_EXPENSE_CATEGORY_LABEL[expense.category]}</td>
                        <td>{expense.description}</td>
                        <td className="font-sans font-black text-destructive">
                          {money(expense.amount)}
                        </td>
                      </tr>
                    ))}
                    {!filteredExpenses.length ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nenhuma despesa encontrada para o filtro selecionado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="resultado" className="mt-4">
            <div className="grid gap-3 md:grid-cols-3">
              <ResultCard label="Receitas" value={allRevenue} tone="success" />
              <ResultCard label="Despesas" value={allExpenses} tone="danger" />
              <ResultCard
                label="Resultado"
                value={result}
                tone={result >= 0 ? "success" : "danger"}
              />
            </div>
            <div className="mt-4 rounded-lg border border-border bg-surface-2/40 p-5">
              <div className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground">
                <Calculator className="size-4 text-primary" />
                Calculo do periodo
              </div>
              <div className="mt-3 font-sans text-[16px] font-black text-foreground">
                {money(allRevenue)} - {money(allExpenses)} = {money(result)}
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Resultado consolidado de todos os fretes e despesas deste caminhao no periodo.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function FinancialTotal({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  tone: "success" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "success"
          ? "border-success/30 bg-success/5"
          : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="label-tiny">{label}</div>
      <div
        className={cn(
          "mt-2 font-sans text-[28px] font-black",
          tone === "success" ? "text-success" : "text-destructive",
        )}
      >
        {money(value)}
      </div>
      <div className="mt-1 text-[11px] font-semibold text-muted-foreground">{description}</div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="label-tiny">{label}</div>
      <div
        className={cn(
          "mt-2 font-sans text-[22px] font-black",
          tone === "success" ? "text-success" : "text-destructive",
        )}
      >
        {money(value)}
      </div>
    </div>
  );
}
