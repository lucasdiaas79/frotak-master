import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, MapPin, Maximize2, RefreshCw, Search, Truck, X } from "lucide-react";
import { FleetMap } from "@/components/FleetMap";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import {
  getSascarSyncState,
  mapSascarSyncStateRow,
  type SascarSyncState,
  syncSascarPositions,
} from "@/lib/integrations/sascar";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { useFleet } from "@/lib/store";
import { ALL_STATUSES, STATUS_HEX, VEHICLE_STATUS_LABEL, statusGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

type MapaSearch = { focus?: string };

function formatSascarSyncTime(iso?: string | null) {
  if (!iso) return "Aguardando atualização";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function getSascarSyncLabel(source?: SascarSyncState["source"]) {
  if (source === "cron") return "Automática";
  if (source === "manual") return "Manual";
  return "Sascar";
}

function showSascarSyncToast(state: SascarSyncState) {
  toast.success("Posições Sascar sincronizadas.", {
    description: `${state.syncedVehicles ?? 0} veículos atualizados · ${
      state.packetsApplied ?? 0
    } pacotes aplicados.`,
  });
}

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa da Frota - Central Transportes" },
      { name: "description", content: "Monitoramento geográfico da frota em tempo real." },
    ],
  }),
  ssr: false,
  validateSearch: (search: Record<string, unknown>): MapaSearch => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
  component: MapaPage,
});

function MapaPage() {
  const { vehicles, drivers, senders, recipients, products, loadAll } = useFleet();
  const { focus } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [stateF, setStateF] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedMap, setExpandedMap] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sascarSyncState, setSascarSyncState] = useState<SascarSyncState>({
    syncedAt: null,
    source: null,
  });
  const syncInFlightRef = useRef(false);
  const lastRealtimeSyncAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (focus) setSelectedId(focus);
  }, [focus]);

  useEffect(() => {
    let cancelled = false;

    void getSascarSyncState()
      .then((state) => {
        if (cancelled) return;
        setSascarSyncState(state);
        lastRealtimeSyncAtRef.current = state.syncedAt;
      })
      .catch((error) => {
        console.error("Falha ao carregar estado da sincronização Sascar.", error);
      });

    if (!hasSupabaseConfig()) {
      return () => {
        cancelled = true;
      };
    }

    const channel = supabase
      .channel("sascar-sync-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "integration_sync_state",
          filter: "key=eq.sascar_positions",
        },
        (payload) => {
          const state = mapSascarSyncStateRow(
            payload.new as { synced_at: string | null; metadata: Record<string, unknown> | null },
          );
          if (!state.syncedAt || state.syncedAt === lastRealtimeSyncAtRef.current) return;

          lastRealtimeSyncAtRef.current = state.syncedAt;
          setSascarSyncState(state);
          void loadAll();

          if (state.source === "cron") {
            showSascarSyncToast(state);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const filtered = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        if (search && !vehicle.plate.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusF !== "all" && vehicle.status !== statusF) return false;
        if (stateF !== "all" && vehicle.state !== stateF) return false;
        return true;
      }),
    [vehicles, search, statusF, stateF],
  );

  const stateOptions = useMemo(
    () =>
      Array.from(new Set(vehicles.map((vehicle) => vehicle.state).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [vehicles],
  );

  const counts = useMemo(
    () => ({
      op: vehicles.filter((vehicle) => statusGroup(vehicle.status) === "operacao").length,
      parado: vehicles.filter((vehicle) => statusGroup(vehicle.status) === "parado").length,
      manut: vehicles.filter((vehicle) => statusGroup(vehicle.status) === "manutencao").length,
    }),
    [vehicles],
  );

  useEffect(() => {
    if (selectedId && !filtered.some((vehicle) => vehicle.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  const selected = vehicles.find((vehicle) => vehicle.id === selectedId) ?? null;
  const driverName = (id?: string) => drivers.find((driver) => driver.id === id)?.name ?? "-";
  const senderName = (id?: string) => senders.find((sender) => sender.id === id)?.name ?? "-";
  const recipientName = (id?: string) =>
    recipients.find((recipient) => recipient.id === id)?.name ?? "-";
  const productName = (id?: string) => products.find((product) => product.id === id)?.name ?? "-";
  const getTooltipHtml = (vehicle: (typeof vehicles)[number]) =>
    buildMapTooltip({
      plate: vehicle.plate,
      cargoType: productName(vehicle.productId),
      route: `${senderName(vehicle.senderId)} - ${recipientName(vehicle.recipientId)}`,
      status: VEHICLE_STATUS_LABEL[vehicle.status],
    });

  async function handleSyncSascar() {
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setSyncing(true);
    try {
      const result = await syncSascarPositions({ quantity: 3000, forceFull: false });
      await loadAll();
      const syncedAt = new Date().toISOString();
      const state: SascarSyncState = {
        syncedAt,
        source: result.stats.source,
        syncedVehicles: result.stats.syncedVehicles,
        packetsApplied: result.stats.packetsApplied,
        packetsFetched: result.stats.packetsFetched,
      };
      lastRealtimeSyncAtRef.current = syncedAt;
      setSascarSyncState(state);
      showSascarSyncToast(state);
    } catch (error) {
      toast.error("Falha ao sincronizar Sascar.", {
        description: error instanceof Error ? error.message : "Erro inesperado.",
      });
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 px-3 pb-4 md:h-[calc(100vh-7rem)] md:px-0">
      <PageHeader
        title="Mapa da Frota"
        subtitle={`${filtered.length} veículos visíveis · monitoramento geográfico`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11.5px] font-bold text-primary">
              <MapPin className="size-3.5" />
              {filtered.length} no mapa
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSyncSascar}
              disabled={syncing}
              className="h-8 rounded-full px-3"
            >
              {syncing ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Sincronizar Sascar
            </Button>
          </div>
        }
        className="mx-0 mt-3 md:mt-0"
      />

      <section className="grid min-h-0 flex-1 gap-4 md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="premium-card flex max-h-[48dvh] min-h-[320px] flex-col overflow-hidden md:max-h-none md:min-h-0">
          <div className="grid grid-cols-3 border-b border-border/80 bg-surface/35">
            <Counter label="Em rota" value={counts.op} color="bg-success" />
            <Counter label="Parados" value={counts.parado} color="bg-warning" />
            <Counter label="Manut." value={counts.manut} color="bg-maintenance" />
          </div>

          <div className="space-y-3 border-b border-border/80 p-4">
            <div>
              <div className="label-tiny mb-2">Busca e filtros</div>
              <div className="field-shell flex h-10 items-center gap-2 px-3">
                <Search className="size-4 shrink-0 text-primary" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar placa..."
                  className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>

            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="h-10 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {ALL_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {VEHICLE_STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stateF} onValueChange={setStateF}>
              <SelectTrigger className="h-10 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {stateOptions.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {filtered.map((vehicle) => {
              const active = selectedId === vehicle.id;
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => setSelectedId(vehicle.id)}
                  className={cn(
                    "group mb-2 flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-all",
                    active
                      ? "border-primary/40 bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)]"
                      : "border-border bg-surface/45 hover:border-primary/25 hover:bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-sans text-[15px] font-black text-foreground">
                        {vehicle.plate}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                        <MapPin className="size-3.5 text-primary" />
                        <span className="truncate">
                          {vehicle.city}/{vehicle.state}
                        </span>
                      </div>
                    </div>
                    <span className="font-sans text-[10.5px] text-muted-foreground">
                      {formatRelative(vehicle.updatedAt)}
                    </span>
                  </div>
                  <StatusBadge status={vehicle.status} />
                  <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <Truck className="size-3.5" />
                    <span className="truncate">{driverName(vehicle.driverId)}</span>
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                Nenhum veículo encontrado para os filtros atuais.
              </div>
            )}
          </div>
        </aside>

        <div className="premium-card relative h-[58dvh] min-h-[420px] overflow-hidden md:h-auto md:min-h-0">
          <FleetMap
            vehicles={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            getTooltipHtml={getTooltipHtml}
            className="absolute inset-0"
          />
          <div className="absolute right-3 top-3 z-[1001] flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-2">
            <div className="inline-flex h-9 items-center rounded-2xl border border-border/80 bg-surface/90 px-3 text-[11px] font-bold text-muted-foreground shadow-sm backdrop-blur">
              {getSascarSyncLabel(sascarSyncState.source)}:{" "}
              {formatSascarSyncTime(sascarSyncState.syncedAt)}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpandedMap(true)}
              className="h-9 rounded-2xl bg-surface/90 px-3 text-[11.5px]"
            >
              <Maximize2 className="size-3.5" />
              Tela cheia
            </Button>
          </div>

          {selected && (
            <div className="glass-card absolute inset-x-3 top-14 z-[1000] max-h-[45%] overflow-hidden rounded-2xl sm:left-auto sm:w-[min(300px,calc(100%-1.5rem))]">
              <div className="flex items-center justify-between border-b border-border/80 bg-surface/45 px-3 py-2.5">
                <span className="font-sans text-[13.5px] font-black">{selected.plate}</span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="inline-flex size-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="max-h-[34dvh] space-y-3 overflow-y-auto p-3 text-[12.5px]">
                <Detail label="Status">
                  <StatusBadge status={selected.status} full />
                </Detail>
                <Detail label="Motorista">{driverName(selected.driverId)}</Detail>
                <Detail label="Localizacao">
                  {selected.city}/{selected.state}
                </Detail>
                <Detail label="Atualizado">
                  <span className="font-sans text-[11.5px] text-muted-foreground">
                    {formatRelative(selected.updatedAt)}
                  </span>
                </Detail>
              </div>
            </div>
          )}

          <div className="glass-card absolute inset-x-3 bottom-3 z-[1000] max-w-[min(360px,calc(100%-1.5rem))] rounded-2xl px-3 py-3 text-[11px] sm:inset-x-auto sm:left-3">
            <div className="label-tiny mb-2">Legenda</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(
                [
                  "rota-carregar",
                  "parado-aguardando-carga",
                  "aguardando-cte",
                  "aguardando-confirmacao",
                  "parado-quebrado",
                  "manutencao",
                ] as const
              ).map((status) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-2 ring-white/80"
                    style={{ background: STATUS_HEX[status] }}
                  />
                  <span className="truncate text-foreground">{VEHICLE_STATUS_LABEL[status]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={expandedMap}
        onOpenChange={setExpandedMap}
        title="Mapa da Frota"
        description={`${filtered.length} veículos visíveis`}
        size="screen"
      >
        <div className="relative h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-surface-2">
          <FleetMap
            vehicles={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            getTooltipHtml={getTooltipHtml}
            className="absolute inset-0"
          />
        </div>
      </Modal>
    </div>
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

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border-r border-border/80 px-3 py-3 last:border-r-0">
      <div className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${color}`} />
        <span className="label-tiny truncate">{label}</span>
      </div>
      <div className="mt-2 font-sans text-[22px] font-black leading-none tabular">{value}</div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-tiny mb-1">{label}</div>
      <div className="font-semibold">{children}</div>
    </div>
  );
}
