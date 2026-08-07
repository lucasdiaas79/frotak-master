import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useFleet } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { FleetMap } from "@/components/FleetMap";
import { Modal } from "@/components/Modal";
import { statusGroup } from "@/lib/types";
import { VEHICLE_STATUS_LABEL } from "@/lib/types";
import type { FleetEvent, FleetEventSource, Vehicle, VehicleStatus } from "@/lib/types";
import { pendingActionKindOfVehicle, stageOfVehicle } from "@/lib/freight-workflow";
import { formatRelative } from "@/lib/format";
import { vehicleTrailerLabel } from "@/lib/vehicle-trailers";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDot,
  MapPin,
  Maximize2,
  PauseCircle,
  Radio,
  Send,
  Truck,
  Unlink,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Operacional - Central Transportes" },
      { name: "description", content: "Painel operacional da frota em tempo real." },
    ],
  }),
  ssr: false,
  component: Dashboard,
});

type FilterKey = "all" | "operacao" | "parado" | "manutencao" | "quebrado" | "sem-vinculo";

interface DashboardUpdate {
  id: string;
  vehicleId: string;
  plate: string;
  status: VehicleStatus;
  city: string;
  state: string;
  source: FleetEventSource | "Sistema";
  description: string;
  timestamp: string;
}

type PendingActionKind = "cte" | "confirmation" | "command";

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "Total da frota",
  operacao: "Em rota",
  parado: "Parados",
  manutencao: "Manutenção",
  quebrado: "Quebrados",
  "sem-vinculo": "Sem vínculo",
};

function matchesFilter(v: Vehicle, f: FilterKey): boolean {
  switch (f) {
    case "all":
      return true;
    case "operacao":
      return statusGroup(v.status) === "operacao";
    case "parado":
      return statusGroup(v.status) === "parado" && v.status !== "parado-quebrado";
    case "manutencao":
      return statusGroup(v.status) === "manutencao";
    case "quebrado":
      return v.status === "parado-quebrado";
    case "sem-vinculo":
      return !v.driverId;
  }
}

function KpiButton({
  label,
  value,
  icon: Icon,
  tone = "muted",
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "success" | "warning" | "maintenance" | "destructive" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10 ring-primary/20",
    success: "text-success bg-success/10 ring-success/20",
    warning: "text-warning bg-warning/10 ring-warning/20",
    maintenance: "text-maintenance bg-maintenance/10 ring-maintenance/20",
    destructive: "text-destructive bg-destructive/10 ring-destructive/20",
    muted: "text-muted-foreground bg-muted/60 ring-border",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "premium-card group relative min-h-[132px] overflow-hidden p-4 text-left transition-all duration-200 hover:-translate-y-0.5",
        active && "border-primary/50 bg-primary/8 ring-1 ring-primary/25",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-border/60 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-tiny truncate">{label}</div>
          <div className="mt-3 font-sans text-[34px] font-black leading-none tracking-[-0.02em] text-foreground">
            {value}
          </div>
        </div>
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform group-hover:scale-105",
            toneClass,
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{active ? "Filtro ativo" : "Clique para filtrar"}</span>
        <span
          className={cn(
            "size-1.5 rounded-full",
            active ? "bg-primary shadow-sm" : "bg-muted-foreground/35",
          )}
        />
      </div>
    </button>
  );
}

function buildMapTooltip({
  plate,
  cargoType,
  route,
  status,
}: {
  plate: string;
  cargoType: string;
  route: string;
  status: string;
}) {
  return `
    <div style="min-width:180px;padding:10px 12px;font-family:var(--font-sans);">
      <div style="font-size:13px;font-weight:900;color:#111827;">${escapeHtml(plate)}</div>
      <div style="margin-top:6px;font-size:11px;font-weight:700;color:#4b5563;">Carga</div>
      <div style="font-size:12px;font-weight:800;color:#111827;">${escapeHtml(cargoType)}</div>
      <div style="margin-top:6px;font-size:11px;font-weight:700;color:#4b5563;">Remetente - destinatário</div>
      <div style="font-size:12px;font-weight:800;color:#111827;">${escapeHtml(route)}</div>
      <div style="margin-top:6px;font-size:11px;font-weight:700;color:#4b5563;">Status</div>
      <div style="font-size:12px;font-weight:900;color:#0f172a;">${escapeHtml(status)}</div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const VEHICLE_UPDATE_LABEL: Record<VehicleStatus, string> = {
  "disponivel-patio": "Veículo disponível no pátio",
  "disponivel-oficina": "Veículo disponível na oficina",
  "aguardando-motorista": "Aguardando aceite do motorista",
  "rota-carregar": "Veículo em rota para carregamento",
  "rota-descarregar": "Veículo em rota para descarga",
  "rota-retornando": "Veículo retornando para base",
  "parado-aguardando-carga": "Parado aguardando carregamento",
  "aguardando-cte": "Aguardando CT-e",
  "aguardando-confirmacao": "Aguardando confirmação do motorista",
  "parado-aguardando-comando": "Parado aguardando comando",
  "parado-descarregando": "Parado aguardando descarga",
  "parado-quebrado": "Ocorrência crítica registrada",
  manutencao: "Veículo em manutenção",
};

function buildDashboardUpdates(events: FleetEvent[], vehicles: Vehicle[]): DashboardUpdate[] {
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  const eventUpdates = events.reduce<DashboardUpdate[]>((acc, event) => {
    const vehicle = vehiclesById.get(event.vehicleId);
    if (!vehicle) return acc;

    const description = event.description?.toLowerCase().includes("importado da planilha")
      ? VEHICLE_UPDATE_LABEL[event.status]
      : event.description || VEHICLE_UPDATE_LABEL[event.status];

    acc.push({
      id: event.id,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      status: event.status,
      city: event.city || vehicle.city,
      state: event.state || vehicle.state,
      source: event.source,
      description,
      timestamp: event.timestamp,
    });
    return acc;
  }, []);

  const updates: DashboardUpdate[] =
    eventUpdates.length > 0
      ? eventUpdates
      : vehicles.map<DashboardUpdate>((vehicle) => ({
          id: `vehicle-${vehicle.id}`,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          status: vehicle.status,
          city: vehicle.city,
          state: vehicle.state,
          source: "Sistema",
          description: VEHICLE_UPDATE_LABEL[vehicle.status],
          timestamp: vehicle.updatedAt,
        }));

  return updates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function buildCurrentVehicleUpdates(vehicles: Vehicle[]): DashboardUpdate[] {
  return vehicles
    .filter((vehicle) => pendingActionKindOfVehicle(vehicle) !== null)
    .map<DashboardUpdate>((vehicle) => ({
      id: `vehicle-current-${vehicle.id}`,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      status: vehicle.status,
      city: vehicle.city,
      state: vehicle.state,
      source: "Sistema",
      description:
        stageOfVehicle(vehicle) === "NOTA_APROVADA_AG_CTE"
          ? "Aguardando CT-e"
          : stageOfVehicle(vehicle) === "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA"
            ? "Aguardando Confirmação"
            : VEHICLE_UPDATE_LABEL[vehicle.status],
      timestamp: vehicle.updatedAt,
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function isPendingUpdate(update: DashboardUpdate) {
  return pendingActionKind(update) !== null;
}

function pendingActionKind(update: DashboardUpdate): PendingActionKind | null {
  const description = update.description.toLowerCase();

  if (update.status === "aguardando-cte") return "cte";
  if (update.status === "aguardando-confirmacao") return "confirmation";
  if (update.status === "parado-aguardando-comando") return "command";
  if (
    update.status === "parado-aguardando-carga" ||
    description.includes("aguardando ct-e") ||
    description.includes("aguardando cte")
  ) {
    return "cte";
  }
  if (
    description.includes("aguardando confirmação") ||
    description.includes("aguardando confirmacao")
  ) {
    return "confirmation";
  }
  return null;
}

function digitsOnly(value?: string) {
  return (value ?? "").replace(/\D/g, "");
}

function buildDashboardWhatsAppUrl(phone?: string, text?: string) {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${normalized}${query}`;
}

function DashboardUpdatePanel({
  title,
  subtitle,
  updates,
  emptyLabel,
  urgent,
  onFocus,
  onOpenMap,
  onAction,
}: {
  title: string;
  subtitle: string;
  updates: DashboardUpdate[];
  emptyLabel: string;
  urgent?: boolean;
  onFocus: (vehicleId: string) => void;
  onOpenMap: (vehicleId: string) => void;
  onAction?: (update: DashboardUpdate) => void;
}) {
  return (
    <section className="premium-card min-h-[360px] overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border/80 bg-surface/35 px-4 py-4">
        <div className="min-w-0">
          <div className="label-tiny">{urgent ? "Prioridade de tempo" : "Linha do tempo"}</div>
          <h2 className="mt-1 text-[17px] font-extrabold text-foreground">{title}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 font-sans text-[11px] font-black",
            urgent
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-primary/25 bg-primary/10 text-primary",
          )}
        >
          {updates.length}
        </span>
      </div>

      <div className="max-h-[520px] overflow-y-auto p-3">
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-3 gap-2">
            {updates.map((update) => (
              <DashboardUpdateCard
                key={update.id}
                update={update}
                urgent={Boolean(urgent)}
                onFocus={onFocus}
                onOpenMap={onOpenMap}
                onAction={onAction}
              />
            ))}
            {updates.length === 0 && (
              <div className="col-span-3 flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2/35 px-4 text-center text-[12.5px] font-semibold text-muted-foreground">
                {emptyLabel}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardUpdateCard({
  update,
  urgent,
  onFocus,
  onOpenMap,
  onAction,
}: {
  update: DashboardUpdate;
  urgent: boolean;
  onFocus: (vehicleId: string) => void;
  onOpenMap: (vehicleId: string) => void;
  onAction?: (update: DashboardUpdate) => void;
}) {
  return (
    <article
      className={cn(
        "group rounded-2xl border bg-surface-2/55 p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-surface-2",
        urgent
          ? "border-destructive/35 bg-destructive/[0.055] shadow-[0_0_18px_color-mix(in_oklch,var(--color-destructive)_8%,transparent)] hover:bg-destructive/[0.08]"
          : "border-border hover:border-primary/25",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => (onAction ? onAction(update) : onFocus(update.vehicleId))}
          className="min-w-0 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                urgent ? "animate-pulse bg-destructive" : "bg-primary",
              )}
            />
            <span className="truncate font-sans text-[13px] font-black text-foreground">
              {update.plate}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11.5px] font-semibold text-foreground">
            {update.description}
          </p>
        </button>
        <span className="shrink-0 font-sans text-[10.5px] font-bold text-muted-foreground">
          {formatRelative(update.timestamp)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={update.status} />
        <span className="truncate text-[11px] font-medium text-muted-foreground">
          {update.city}/{update.state} · {update.source}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenMap(update.vehicleId);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-bold transition",
            urgent
              ? "text-destructive hover:bg-destructive/10"
              : "text-primary hover:bg-primary/10",
          )}
        >
          <MapPin className="size-3.5" />
          Mapa
        </button>
      </div>
    </article>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const { vehicles, drivers, trailers, senders, recipients, events, setVehicleStatus } = useFleet();
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [expandedMap, setExpandedMap] = useState(false);
  const [actionUpdate, setActionUpdate] = useState<DashboardUpdate | null>(null);
  const [ctePhoto, setCtePhoto] = useState<File | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("pt-BR"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(
    () => ({
      total: vehicles.length,
      op: vehicles.filter((v) => matchesFilter(v, "operacao")).length,
      parado: vehicles.filter((v) => matchesFilter(v, "parado")).length,
      manut: vehicles.filter((v) => matchesFilter(v, "manutencao")).length,
      quebrado: vehicles.filter((v) => matchesFilter(v, "quebrado")).length,
      semVinculo: vehicles.filter((v) => matchesFilter(v, "sem-vinculo")).length,
    }),
    [vehicles],
  );

  const filteredVehicles = useMemo(
    () => vehicles.filter((v) => matchesFilter(v, filter)),
    [vehicles, filter],
  );

  const driverName = (id?: string) => drivers.find((d) => d.id === id)?.name ?? "-";
  const trailerName = (vehicle: Vehicle) => vehicleTrailerLabel(vehicle, trailers);
  const senderName = (id?: string) => senders.find((s) => s.id === id)?.name ?? "-";
  const recipientName = (id?: string) => recipients.find((r) => r.id === id)?.name ?? "-";
  const fmtMoney = (v?: number) =>
    v == null
      ? "-"
      : v.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
        });

  const selectedMap = vehicles.find((v) => v.id === selectedMapId) || null;
  const actionVehicle = actionUpdate
    ? (vehicles.find((vehicle) => vehicle.id === actionUpdate.vehicleId) ?? null)
    : null;
  const actionDriver = actionVehicle?.driverId
    ? drivers.find((driver) => driver.id === actionVehicle.driverId)
    : null;
  const actionSender = actionVehicle?.senderId
    ? senders.find((sender) => sender.id === actionVehicle.senderId)
    : null;
  const actionRecipient = actionVehicle?.recipientId
    ? recipients.find((recipient) => recipient.id === actionVehicle.recipientId)
    : null;
  const actionKind = actionUpdate ? pendingActionKind(actionUpdate) : null;
  const actionWhatsAppUrl =
    actionKind === "cte"
      ? buildDashboardWhatsAppUrl(
          actionDriver?.phone,
          [
            `CT-e/foto da viagem ${actionVehicle?.plate ?? ""}.`,
            `Origem: ${actionSender ? `${actionSender.city}/${actionSender.state}` : "-"}.`,
            `Destino: ${
              actionRecipient ? `${actionRecipient.city}/${actionRecipient.state}` : "-"
            }.`,
            "Arquivo da foto foi separado no sistema para envio.",
          ].join("\n"),
        )
      : null;
  const getTooltipHtml = (vehicle: Vehicle) =>
    buildMapTooltip({
      plate: vehicle.plate,
      cargoType: vehicle.fleetKind || vehicle.type || "-",
      route: `${senderName(vehicle.senderId)} - ${recipientName(vehicle.recipientId)}`,
      status: VEHICLE_STATUS_LABEL[vehicle.status],
    });

  const latestUpdates = useMemo(
    () => buildDashboardUpdates(events, vehicles).slice(0, 8),
    [events, vehicles],
  );

  const urgentUpdates = useMemo(() => buildCurrentVehicleUpdates(vehicles), [vehicles]);

  const focusOnMap = (vehicleId: string) => {
    navigate({ to: "/mapa", search: { focus: vehicleId } });
  };

  const selectAndScroll = (vehicleId: string) => {
    setSelectedMapId(vehicleId);
    if (typeof document !== "undefined") {
      document
        .getElementById("dashboard-map")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const openPendingAction = (update: DashboardUpdate) => {
    const kind = pendingActionKind(update);
    if (!kind) {
      setSelectedMapId(update.vehicleId);
      return;
    }
    setCtePhoto(null);
    setActionUpdate(update);
  };

  const generateNewFreight = () => {
    if (!actionVehicle) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        "central:new-freight-seed",
        JSON.stringify({
          vehicleId: actionVehicle.id,
          driverId: actionVehicle.driverId ?? "",
        }),
      );
    }
    navigate({ to: "/gestao-frota" });
  };

  const sendReturnToYard = async () => {
    if (!actionVehicle) return;
    await setVehicleStatus(actionVehicle.id, "rota-retornando", "ENTREGA_FINALIZADA");
    toast.success("Retorno ao pátio enviado", {
      description: `${actionVehicle.plate} agora está em rota retornando.`,
    });
    setActionUpdate(null);
  };

  const toggleFilter = (key: FilterKey) => {
    setFilter((cur) => (cur === key ? "all" : key));
    setSelectedMapId(null);
  };

  return (
    <div className="space-y-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Dashboard Operacional"
        subtitle={`Visão consolidada da frota${now ? ` · atualizado ${now}` : ""}`}
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-[11.5px] font-bold text-success">
            <Radio className="size-3.5" />
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            Tempo real
          </div>
        }
        className="mx-0 mt-3 md:mt-0"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiButton
          label="Total da frota"
          value={stats.total}
          icon={Truck}
          tone="primary"
          active={filter === "all"}
          onClick={() => toggleFilter("all")}
        />
        <KpiButton
          label="Em rota"
          value={stats.op}
          icon={CircleDot}
          tone="success"
          active={filter === "operacao"}
          onClick={() => toggleFilter("operacao")}
        />
        <KpiButton
          label="Parados"
          value={stats.parado}
          icon={PauseCircle}
          tone="warning"
          active={filter === "parado"}
          onClick={() => toggleFilter("parado")}
        />
        <KpiButton
          label="Manutenção"
          value={stats.manut}
          icon={Wrench}
          tone="maintenance"
          active={filter === "manutencao"}
          onClick={() => toggleFilter("manutencao")}
        />
        <KpiButton
          label="Quebrados"
          value={stats.quebrado}
          icon={AlertTriangle}
          tone="destructive"
          active={filter === "quebrado"}
          onClick={() => toggleFilter("quebrado")}
        />
        <KpiButton
          label="Sem vínculo"
          value={stats.semVinculo}
          icon={Unlink}
          active={filter === "sem-vinculo"}
          onClick={() => toggleFilter("sem-vinculo")}
        />
      </section>

      {filter !== "all" && (
        <div className="glass-card flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 text-[12px] text-muted-foreground">
          <span>Filtrando por:</span>
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 font-bold text-primary">
            {FILTER_LABEL[filter]} · {filteredVehicles.length}
          </span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="font-bold text-primary hover:underline"
          >
            limpar
          </button>
        </div>
      )}

      <section id="dashboard-map" className="premium-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/80 bg-surface/35 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="min-w-0">
            <div className="label-tiny">Monitoramento</div>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">Mapa da Frota</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Clique em um caminhão na tabela para localizá-lo no mapa.
            </p>
          </div>
          <Link
            to="/mapa"
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary transition hover:bg-primary/15"
          >
            Abrir mapa completo
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="relative h-[360px] overflow-hidden bg-surface-2 md:h-[420px]">
          <FleetMap
            vehicles={filteredVehicles}
            selectedId={selectedMapId}
            onSelect={setSelectedMapId}
            getTooltipHtml={getTooltipHtml}
            initialCenter={[-11.0, -37.5]}
            initialZoom={7}
            className="absolute inset-0"
          />
          <button
            type="button"
            onClick={() => setExpandedMap(true)}
            className="absolute right-3 top-3 z-[1001] inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface/90 px-3 text-[11.5px] font-bold text-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
          >
            <Maximize2 className="size-3.5" />
            Tela cheia
          </button>
          {selectedMap && (
            <div className="glass-card absolute right-3 top-14 z-[1000] w-[min(280px,calc(100%-1.5rem))] overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-border/80 bg-surface/45 px-3 py-2.5">
                <span className="font-sans text-[13px] font-black">{selectedMap.plate}</span>
                <button
                  type="button"
                  onClick={() => setSelectedMapId(null)}
                  className="inline-flex size-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="space-y-3 p-3 text-[12.5px]">
                <div>
                  <div className="label-tiny mb-1">Status</div>
                  <StatusBadge status={selectedMap.status} full />
                </div>
                <div>
                  <div className="label-tiny">Motorista</div>
                  <div className="font-semibold">{driverName(selectedMap.driverId)}</div>
                </div>
                <div>
                  <div className="label-tiny">Cidade/UF</div>
                  <div className="font-semibold">
                    {selectedMap.city}/{selectedMap.state}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => focusOnMap(selectedMap.id)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface-2/80 px-3 py-2 text-[11.5px] font-bold transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                >
                  <MapPin className="size-3.5" /> Abrir no mapa completo
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal
        open={expandedMap}
        onOpenChange={setExpandedMap}
        title="Mapa da Frota"
        description={`${filteredVehicles.length} veículos visíveis`}
        size="screen"
      >
        <div className="relative h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-surface-2">
          <FleetMap
            vehicles={filteredVehicles}
            selectedId={selectedMapId}
            onSelect={setSelectedMapId}
            getTooltipHtml={getTooltipHtml}
            initialCenter={[-11.0, -37.5]}
            initialZoom={7}
            className="absolute inset-0"
          />
        </div>
      </Modal>

      <section className="grid gap-4 lg:grid-cols-2">
        <DashboardUpdatePanel
          title="Últimas atualizações do sistema"
          subtitle="Eventos recentes da frota em ordem de tempo"
          updates={latestUpdates}
          emptyLabel="Nenhuma atualização recente."
          onFocus={setSelectedMapId}
          onOpenMap={focusOnMap}
        />
        <DashboardUpdatePanel
          title="Pendências para agir"
          subtitle="Cards aguardando CT-e, confirmação e comando"
          updates={urgentUpdates}
          emptyLabel="Nenhuma pendência operacional no momento."
          urgent
          onFocus={setSelectedMapId}
          onOpenMap={focusOnMap}
          onAction={openPendingAction}
        />
      </section>

      <Modal
        open={!!actionUpdate}
        onOpenChange={(open) => {
          if (!open) {
            setActionUpdate(null);
            setCtePhoto(null);
          }
        }}
        title={
          actionKind === "cte"
            ? `Aguardando CT-e - ${actionVehicle?.plate ?? ""}`
            : actionKind === "confirmation"
              ? `Aguardando Confirmação - ${actionVehicle?.plate ?? ""}`
              : `Aguardando comando - ${actionVehicle?.plate ?? ""}`
        }
        description="Dados da viagem e ações operacionais"
        size="lg"
      >
        {actionUpdate && actionVehicle && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
                <div className="label-tiny">Motorista</div>
                <div className="mt-1 text-[14px] font-extrabold text-foreground">
                  {actionDriver?.name ?? "-"}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
                <div className="label-tiny">Status</div>
                <div className="mt-2">
                  <StatusBadge status={actionVehicle.status} full />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
                <div className="label-tiny">Origem</div>
                <div className="mt-1 text-[13px] font-bold text-foreground">
                  {actionSender
                    ? `${actionSender.name} - ${actionSender.city}/${actionSender.state}`
                    : "-"}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
                <div className="label-tiny">Destino</div>
                <div className="mt-1 text-[13px] font-bold text-foreground">
                  {actionRecipient
                    ? `${actionRecipient.name} - ${actionRecipient.city}/${actionRecipient.state}`
                    : "-"}
                </div>
              </div>
            </div>

            {actionKind === "cte" ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[13px] font-extrabold text-foreground">
                      Foto para envio ao motorista
                    </div>
                    <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                      {ctePhoto?.name ?? "Nenhuma foto anexada ainda."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-surface-2/80 px-3 text-[12px] font-bold transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary">
                      <Upload className="size-4" />
                      Anexar foto
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => setCtePhoto(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    {actionWhatsAppUrl ? (
                      <a
                        href={actionWhatsAppUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() =>
                          toast.success("Mensagem preparada para o motorista", {
                            description: ctePhoto
                              ? "O WhatsApp foi aberto para anexar/enviar a foto selecionada."
                              : "Anexe uma foto antes de finalizar o envio.",
                          })
                        }
                        className={cn(
                          "inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-[12px] font-bold transition",
                          ctePhoto
                            ? "bg-success text-success-foreground hover:brightness-105"
                            : "border border-border bg-muted/50 text-muted-foreground",
                        )}
                      >
                        <Send className="size-4" />
                        Enviar ao motorista
                      </a>
                    ) : (
                      <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-border bg-muted/50 px-3 text-[12px] font-bold text-muted-foreground">
                        Motorista sem telefone
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : actionKind === "confirmation" ? (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.045] p-4">
                <div className="text-[14px] font-extrabold text-destructive">
                  Aguardando confirmação do motorista
                </div>
                <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                  O caminhão já está com CT-e/MDF-e gerado ou enviado e precisa da confirmação para
                  seguir a próxima etapa na Gestão de Frota.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMapId(actionVehicle.id);
                    setActionUpdate(null);
                  }}
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border bg-surface-2/80 px-3 text-[12px] font-bold transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                >
                  <MapPin className="size-4" />
                  Localizar no mapa
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={generateNewFreight}
                  className="rounded-2xl border border-primary/25 bg-primary/10 p-4 text-left transition hover:bg-primary/15"
                >
                  <div className="text-[14px] font-extrabold text-primary">Gerar novo frete</div>
                  <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                    Abre a Central de Fretes já com este motorista e veículo selecionados.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void sendReturnToYard()}
                  className="rounded-2xl border border-maintenance/25 bg-maintenance/10 p-4 text-left transition hover:bg-maintenance/15"
                >
                  <div className="text-[14px] font-extrabold text-maintenance">
                    Mandar retornar para o pátio
                  </div>
                  <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                    O motorista recebe a orientação e o status muda para em rota retornando.
                  </p>
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <section className="hidden">
        <div className="flex flex-col gap-3 border-b border-border/80 bg-surface/35 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="min-w-0">
            <div className="label-tiny">Frota</div>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Frota - visão completa
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Clique em uma linha para localizar o caminhão no mapa acima. Use o ícone para abrir o
              mapa completo.
            </p>
          </div>
          <Link
            to="/veiculos"
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary transition hover:bg-primary/15"
          >
            Ir para Veículos
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Status</th>
                <th>Motorista</th>
                <th>Caçamba</th>
                <th>Remetente</th>
                <th>Destinatário</th>
                <th className="text-right">Valor do frete</th>
                <th className="w-[70px] text-right">Mapa</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => {
                const active = selectedMapId === v.id;
                return (
                  <tr
                    key={v.id}
                    onClick={() => selectAndScroll(v.id)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      active && "bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)]",
                    )}
                  >
                    <td className="font-sans font-black text-foreground">{v.plate}</td>
                    <td>
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="font-medium">{driverName(v.driverId)}</td>
                    <td className="font-sans text-[12px] text-muted-foreground">
                      {trailerName(v)}
                    </td>
                    <td className="text-muted-foreground">{senderName(v.senderId)}</td>
                    <td className="text-muted-foreground">{recipientName(v.recipientId)}</td>
                    <td className="text-right font-sans text-[12px] font-semibold">
                      {fmtMoney(v.freightValue)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        title="Abrir no mapa completo"
                        onClick={(e) => {
                          e.stopPropagation();
                          focusOnMap(v.id);
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                      >
                        <MapPin className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredVehicles.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum veículo neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
