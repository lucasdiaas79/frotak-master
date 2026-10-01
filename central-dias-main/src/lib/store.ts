import { create } from "zustand";
import type {
  Driver,
  FleetEvent,
  Recipient,
  Product,
  Sender,
  Trailer,
  Vehicle,
  VehicleFreightStage,
  VehicleStatus,
} from "./types";
import * as vehicleService from "./services/vehicles";
import * as driverService from "./services/drivers";
import * as trailerService from "./services/trailers";
import * as partiesService from "./services/parties";
import * as productsService from "./services/products";
import * as eventsService from "./services/fleet-events";
import {
  driverFromRow,
  fleetEventFromRow,
  productFromRow,
  recipientFromRow,
  senderFromRow,
  trailerFromRow,
  vehicleFromRow,
} from "./services/mappers";
import { supabase } from "./supabase";
import { getActiveTenantId, shouldUseLocalTenantData } from "./auth";
import { loadLocalFleetData, nextLocalId, saveLocalFleetData } from "./localFleetData";
import { perfCount, perfStart } from "./performance";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dbId(id?: string) {
  return id && uuidLike.test(id) ? id : "";
}

export type FleetDomain =
  | "vehicles"
  | "drivers"
  | "trailers"
  | "senders"
  | "recipients"
  | "products"
  | "events";

type LoadOptions = { force?: boolean; silent?: boolean };

interface FleetState {
  vehicles: Vehicle[];
  drivers: Driver[];
  trailers: Trailer[];
  senders: Sender[];
  recipients: Recipient[];
  products: Product[];
  events: FleetEvent[];
  loading: boolean;
  error?: string;
  realtimeReady: boolean;
  loadAll: (options?: LoadOptions) => Promise<void>;
  refreshDomain: (domain: FleetDomain, options?: LoadOptions) => Promise<void>;
  subscribeRealtime: () => () => void;
  upsertVehicle: (v: Vehicle) => Promise<Vehicle>;
  deleteVehicle: (id: string) => Promise<void>;
  upsertDriver: (d: Driver) => Promise<Driver>;
  deleteDriver: (id: string) => Promise<void>;
  upsertTrailer: (t: Trailer) => Promise<void>;
  deleteTrailer: (id: string) => Promise<void>;
  setVehicleStatus: (
    id: string,
    status: VehicleStatus,
    freightStage?: VehicleFreightStage,
  ) => Promise<void>;
  archiveFreight: (vehicleId: string, reason?: string) => Promise<void>;
  link: (
    vehicleId: string,
    driverId?: string,
    trailerId?: string,
    extras?: {
      senderId?: string;
      recipientId?: string;
      productId?: string;
      freightValue?: number;
      freightPricingMode?: import("@/lib/types").FreightPricingMode;
      freightTonPrice?: number;
      trailerIds?: string[];
      freightPaymentType?: import("@/lib/types").FreightPaymentType;
      paymentTermDays?: number | null;
    },
  ) => Promise<void>;
  addSender: (s: Omit<Sender, "id"> & { id?: string }) => Promise<void>;
  updateSender: (s: Sender) => Promise<void>;
  deleteSender: (id: string) => Promise<void>;
  addRecipient: (r: Omit<Recipient, "id"> & { id?: string }) => Promise<void>;
  updateRecipient: (r: Recipient) => Promise<void>;
  deleteRecipient: (id: string) => Promise<void>;
  addProduct: (p: Omit<Product, "id"> & { id?: string }) => Promise<void>;
  updateProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
}

async function loadFleetData() {
  const timed = async <T>(domain: FleetDomain, request: Promise<T>) => {
    const finish = perfStart(`fleet:query:${domain}`);
    try {
      return await request;
    } finally {
      finish();
    }
  };
  const [vehicles, drivers, trailers, senders, recipients, products, events] = await Promise.all([
    timed("vehicles", vehicleService.listVehicles()),
    timed("drivers", driverService.listDrivers()),
    timed("trailers", trailerService.listTrailers()),
    timed("senders", partiesService.listSenders()),
    timed("recipients", partiesService.listRecipients()),
    timed("products", productsService.listProducts()),
    timed("events", eventsService.listFleetEvents()),
  ]);
  return { vehicles, drivers, trailers, senders, recipients, products, events };
}

const LOAD_ALL_TTL_MS = 120_000;
const DOMAIN_RECONCILIATION_TTL_MS = 60_000;
const STALE_CHECK_INTERVAL_MS = 30_000;
const FLEET_DOMAINS: FleetDomain[] = [
  "vehicles",
  "drivers",
  "trailers",
  "senders",
  "recipients",
  "products",
  "events",
];
type InFlightRequest = { promise: Promise<void>; pending: boolean };
let loadAllInFlight: (InFlightRequest & { tenantId: string }) | null = null;
let loadedTenantId = "";
const domainAuthoritativeAt = new Map<FleetDomain, number>();
const domainVersions = new Map<FleetDomain, number>();
const domainInFlight = new Map<string, InFlightRequest>();
let realtimeCleanup: (() => void) | null = null;
let realtimeSubscribers = 0;

function domainVersion(domain: FleetDomain) {
  return domainVersions.get(domain) ?? 0;
}

function markDomainChanged(domain: FleetDomain) {
  domainVersions.set(domain, domainVersion(domain) + 1);
}

function markDomainAuthoritative(domain: FleetDomain, loadedAt = Date.now()) {
  domainAuthoritativeAt.set(domain, loadedAt);
}

function resetSynchronizationClocks() {
  domainAuthoritativeAt.clear();
  domainVersions.clear();
}

function allDomainsFresh(now = Date.now()) {
  return FLEET_DOMAINS.every(
    (domain) => now - (domainAuthoritativeAt.get(domain) ?? 0) < LOAD_ALL_TTL_MS,
  );
}

function hasFleetData(state: FleetState) {
  return (
    state.vehicles.length > 0 ||
    state.drivers.length > 0 ||
    state.trailers.length > 0 ||
    state.senders.length > 0 ||
    state.recipients.length > 0 ||
    state.products.length > 0 ||
    state.events.length > 0
  );
}

function upsertById<T extends { id: string }>(
  items: T[],
  item: T,
  compare?: (a: T, b: T) => number,
) {
  const next = items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [...items, item];
  return compare ? next.sort(compare) : next;
}

async function loadFleetDomain(domain: FleetDomain) {
  const finish = perfStart(`fleet:query:${domain}`);
  try {
    switch (domain) {
      case "vehicles":
        return await vehicleService.listVehicles();
      case "drivers":
        return await driverService.listDrivers();
      case "trailers":
        return await trailerService.listTrailers();
      case "senders":
        return await partiesService.listSenders();
      case "recipients":
        return await partiesService.listRecipients();
      case "products":
        return await productsService.listProducts();
      case "events":
        return await eventsService.listFleetEvents();
    }
  } finally {
    finish();
  }
}

function persistLocalState(state: FleetState) {
  saveLocalFleetData(getActiveTenantId(), {
    vehicles: state.vehicles,
    drivers: state.drivers,
    trailers: state.trailers,
    senders: state.senders,
    recipients: state.recipients,
    products: state.products,
    events: state.events,
  });
}

const localInitialData = shouldUseLocalTenantData()
  ? loadLocalFleetData(getActiveTenantId())
  : {
      vehicles: [],
      drivers: [],
      trailers: [],
      senders: [],
      recipients: [],
      products: [],
      events: [],
    };

export const useFleet = create<FleetState>((set, get) => ({
  vehicles: localInitialData.vehicles,
  drivers: localInitialData.drivers,
  trailers: localInitialData.trailers,
  senders: localInitialData.senders,
  recipients: localInitialData.recipients,
  products: localInitialData.products,
  events: localInitialData.events,
  loading: false,
  realtimeReady: false,

  loadAll: async (options = {}) => {
    if (shouldUseLocalTenantData()) {
      set({ ...loadLocalFleetData(getActiveTenantId()), loading: false, error: undefined });
      return;
    }

    const tenantId = getActiveTenantId();
    const tenantChanged = loadedTenantId !== tenantId;
    const cacheFresh = !tenantChanged && allDomainsFresh();
    if (!options.force && cacheFresh && hasFleetData(get())) return;
    if (loadAllInFlight?.tenantId === tenantId) {
      perfCount("fleet:loadAll:deduplicated");
      if (options.force) loadAllInFlight.pending = true;
      return loadAllInFlight.promise;
    }
    if (loadAllInFlight) {
      await loadAllInFlight.promise.catch(() => undefined);
      return get().loadAll(options);
    }

    perfCount("fleet:loadAll");
    const finish = perfStart("fleet:loadAll", { tenantChanged });
    if (tenantChanged) {
      resetSynchronizationClocks();
      set({
        vehicles: [],
        drivers: [],
        trailers: [],
        senders: [],
        recipients: [],
        products: [],
        events: [],
      });
    }
    const shouldBlock = !options.silent && !hasFleetData(get());
    if (shouldBlock) set({ loading: true, error: undefined });

    const startedVersions = new Map(FLEET_DOMAINS.map((domain) => [domain, domainVersion(domain)]));
    const changedDuringLoad = new Set<FleetDomain>();
    const requestState: InFlightRequest & { tenantId: string } = {
      tenantId,
      pending: false,
      promise: Promise.resolve(),
    };
    const request = (async () => {
      try {
        const data = await loadFleetData();
        if (getActiveTenantId() !== tenantId) return;
        loadedTenantId = tenantId;
        const loadedAt = Date.now();
        const accepted: Partial<Pick<FleetState, FleetDomain>> = {};
        for (const domain of FLEET_DOMAINS) {
          if (domainVersion(domain) !== startedVersions.get(domain)) {
            changedDuringLoad.add(domain);
            continue;
          }
          accepted[domain] = data[domain] as never;
          markDomainAuthoritative(domain, loadedAt);
        }
        set({ ...accepted, loading: false, error: undefined });
      } catch (error) {
        if (getActiveTenantId() === tenantId) {
          set({
            loading: false,
            error: error instanceof Error ? error.message : "Erro ao carregar dados da frota.",
          });
        }
        throw error;
      } finally {
        finish();
        if (loadAllInFlight?.promise === request) {
          const shouldRepeat = loadAllInFlight.pending;
          loadAllInFlight = null;
          if (shouldRepeat && getActiveTenantId() === tenantId) {
            void get().loadAll({ force: true, silent: true });
          }
          changedDuringLoad.forEach((domain) => {
            void get().refreshDomain(domain, { force: true, silent: true });
          });
        }
      }
    })();
    requestState.promise = request;
    loadAllInFlight = requestState;
    return request;
  },

  refreshDomain: async (domain, options = {}) => {
    if (shouldUseLocalTenantData()) {
      await get().loadAll(options);
      return;
    }
    const tenantId = getActiveTenantId();
    const requestKey = `${tenantId}:${domain}`;
    const existing = domainInFlight.get(requestKey);
    if (existing) {
      perfCount(`fleet:refresh:${domain}:deduplicated`);
      existing.pending = true;
      return existing.promise;
    }

    const startedVersion = domainVersion(domain);
    const requestState: InFlightRequest = { pending: false, promise: Promise.resolve() };
    const request = (async () => {
      try {
        const data = await loadFleetDomain(domain);
        if (getActiveTenantId() !== tenantId) return;
        if (domainVersion(domain) !== startedVersion) {
          requestState.pending = true;
          return;
        }
        set({ [domain]: data, error: undefined } as Pick<FleetState, FleetDomain | "error">);
        markDomainAuthoritative(domain);
      } catch (error) {
        if (getActiveTenantId() === tenantId) {
          set({ error: error instanceof Error ? error.message : `Erro ao atualizar ${domain}.` });
        }
        throw error;
      } finally {
        domainInFlight.delete(requestKey);
        if (requestState.pending && getActiveTenantId() === tenantId) {
          void get().refreshDomain(domain, { force: true, silent: true });
        }
      }
    })();
    requestState.promise = request;
    domainInFlight.set(requestKey, requestState);
    return request;
  },

  subscribeRealtime: () => {
    if (shouldUseLocalTenantData()) return () => {};
    realtimeSubscribers += 1;
    if (realtimeCleanup) {
      return () => {
        realtimeSubscribers = Math.max(0, realtimeSubscribers - 1);
        if (realtimeSubscribers === 0) realtimeCleanup?.();
      };
    }

    const tenantId = getActiveTenantId();
    const refreshTimers = new Map<FleetDomain, number>();
    const scheduleRefresh = (domain: FleetDomain) => {
      const current = refreshTimers.get(domain);
      if (current) window.clearTimeout(current);
      refreshTimers.set(
        domain,
        window.setTimeout(() => {
          refreshTimers.delete(domain);
          perfCount("realtime:refetch", { domain });
          void get().refreshDomain(domain, { force: true, silent: true });
        }, 250),
      );
    };
    const isCurrentTenant = (row: Record<string, unknown>) =>
      !row.tenant_id || row.tenant_id === tenantId;
    const onRow =
      (
        domain: FleetDomain,
        mapper: (row: Record<string, unknown>) => Vehicle | Driver | Trailer | Sender | Product,
        compare?: (a: never, b: never) => number,
      ) =>
      (payload: { eventType: string; new: unknown; old: unknown }) => {
        perfCount("realtime:event", { domain, event: payload.eventType });
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<
          string,
          unknown
        >;
        if (!row?.id || !isCurrentTenant(row)) return;
        markDomainChanged(domain);
        if (payload.eventType === "DELETE") {
          set((state) => ({
            [domain]: (state[domain] as Array<{ id: string }>).filter((item) => item.id !== row.id),
          }));
          return;
        }
        try {
          const item = mapper(row) as { id: string };
          set((state) => ({
            [domain]: upsertById(
              state[domain] as Array<{ id: string }>,
              item,
              compare as ((a: { id: string }, b: { id: string }) => number) | undefined,
            ),
          }));
        } catch {
          scheduleRefresh(domain);
        }
      };
    const onVehicle = (payload: { eventType: string; new: unknown; old: unknown }) => {
      perfCount("realtime:event", { domain: "vehicles", event: payload.eventType });
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<
        string,
        unknown
      >;
      if (!row?.id || !isCurrentTenant(row)) return;
      markDomainChanged("vehicles");
      if (payload.eventType === "DELETE") {
        set((state) => ({ vehicles: state.vehicles.filter((item) => item.id !== row.id) }));
        return;
      }
      const existing = get().vehicles.find((item) => item.id === row.id);
      try {
        const mapped = vehicleFromRow({
          ...(row as Parameters<typeof vehicleFromRow>[0]),
          vehicle_trailers: existing?.trailerIds?.map((trailerId, position) => ({
            trailer_id: trailerId,
            position,
            active: true,
          })),
        });
        set((state) => ({
          vehicles: upsertById(state.vehicles, mapped, (a, b) => a.plate.localeCompare(b.plate)),
        }));
      } catch {
        scheduleRefresh("vehicles");
      }
    };
    const onPosition = (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (payload.eventType === "DELETE") return;
      const row = payload.new as Record<string, unknown>;
      perfCount("realtime:event", { domain: "positions", event: payload.eventType });
      if (
        !row?.vehicle_id ||
        !isCurrentTenant(row) ||
        !get().vehicles.some((vehicle) => vehicle.id === row.vehicle_id)
      ) {
        return;
      }
      markDomainChanged("vehicles");
      set((state) => ({
        vehicles: state.vehicles.map((vehicle) =>
          vehicle.id === row.vehicle_id
            ? {
                ...vehicle,
                lat: Number(row.lat ?? vehicle.lat),
                lng: Number(row.lng ?? vehicle.lng),
                city: typeof row.city === "string" ? row.city : vehicle.city,
                state: typeof row.state === "string" ? row.state : vehicle.state,
                lastPositionAt:
                  typeof row.recorded_at === "string" ? row.recorded_at : vehicle.lastPositionAt,
                updatedAt:
                  typeof row.recorded_at === "string" ? row.recorded_at : vehicle.updatedAt,
              }
            : vehicle,
        ),
      }));
    };
    const onEvent = (payload: { eventType: string; new: unknown; old: unknown }) => {
      perfCount("realtime:event", { domain: "events", event: payload.eventType });
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<
        string,
        unknown
      >;
      if (!row?.id || !isCurrentTenant(row)) return;
      markDomainChanged("events");
      if (payload.eventType === "DELETE") {
        set((state) => ({ events: state.events.filter((item) => item.id !== row.id) }));
        return;
      }
      try {
        const item = fleetEventFromRow(row as Parameters<typeof fleetEventFromRow>[0]);
        set((state) => ({
          events: upsertById(state.events, item, (a, b) =>
            b.timestamp.localeCompare(a.timestamp),
          ).slice(0, 250),
        }));
      } catch {
        scheduleRefresh("events");
      }
    };
    const reconcileDomains = (force = false) => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      for (const domain of FLEET_DOMAINS) {
        if (
          force ||
          now - (domainAuthoritativeAt.get(domain) ?? 0) >= DOMAIN_RECONCILIATION_TTL_MS
        ) {
          scheduleRefresh(domain);
        }
      }
    };
    const reconcileStaleDomains = () => reconcileDomains(false);
    const filter = `tenant_id=eq.${tenantId}`;
    let subscribedOnce = false;
    const channel = supabase
      .channel(`fleet-operational-data:${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles", filter },
        onVehicle,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_trailers", filter },
        () => scheduleRefresh("vehicles"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers", filter },
        onRow(
          "drivers",
          (row) => driverFromRow(row as Parameters<typeof driverFromRow>[0]),
          (a, b) => (a as Driver).name.localeCompare((b as Driver).name),
        ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trailers", filter },
        onRow(
          "trailers",
          (row) => trailerFromRow(row as Parameters<typeof trailerFromRow>[0]),
          compareTrailers as never,
        ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "senders", filter },
        onRow(
          "senders",
          (row) => senderFromRow(row as Parameters<typeof senderFromRow>[0]),
          (a, b) => (a as Sender).name.localeCompare((b as Sender).name),
        ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipients", filter },
        onRow(
          "recipients",
          (row) => recipientFromRow(row as Parameters<typeof recipientFromRow>[0]),
          (a, b) => (a as Recipient).name.localeCompare((b as Recipient).name),
        ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter },
        onRow(
          "products",
          (row) => productFromRow(row as Parameters<typeof productFromRow>[0]),
          (a, b) => (a as Product).name.localeCompare((b as Product).name),
        ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fleet_events", filter },
        onEvent,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "freight_documents", filter },
        () => scheduleRefresh("vehicles"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "freights", filter }, () =>
        scheduleRefresh("vehicles"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manual_workflow_overrides", filter },
        () => scheduleRefresh("vehicles"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_positions", filter },
        onPosition,
      )
      .subscribe((status) => {
        const ready = status === "SUBSCRIBED";
        set({ realtimeReady: ready });
        if (ready) {
          if (subscribedOnce) reconcileDomains(true);
          subscribedOnce = true;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reconcileDomains();
        }
      });

    window.addEventListener("focus", reconcileStaleDomains);
    window.addEventListener("pageshow", reconcileStaleDomains);
    document.addEventListener("visibilitychange", reconcileStaleDomains);
    const staleTimer = window.setInterval(reconcileStaleDomains, STALE_CHECK_INTERVAL_MS);

    realtimeCleanup = () => {
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
      refreshTimers.clear();
      window.clearInterval(staleTimer);
      window.removeEventListener("focus", reconcileStaleDomains);
      window.removeEventListener("pageshow", reconcileStaleDomains);
      document.removeEventListener("visibilitychange", reconcileStaleDomains);
      void supabase.removeChannel(channel);
      set({ realtimeReady: false });
      realtimeCleanup = null;
    };
    return () => {
      realtimeSubscribers = Math.max(0, realtimeSubscribers - 1);
      if (realtimeSubscribers === 0) realtimeCleanup?.();
    };
  },

  upsertVehicle: async (v) => {
    if (shouldUseLocalTenantData()) {
      const saved: Vehicle = {
        ...v,
        id: v.id || nextLocalId("vehicle"),
        workflowVersion: v.workflowVersion ?? 0,
        workflowFlags: v.workflowFlags ?? { pendingDocuments: [] },
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const next = {
          ...s,
          vehicles: s.vehicles.some((x) => x.id === saved.id)
            ? s.vehicles.map((x) => (x.id === saved.id ? saved : x))
            : [...s.vehicles, saved].sort((a, b) => a.plate.localeCompare(b.plate)),
        };
        persistLocalState(next);
        return next;
      });
      return saved;
    }
    const saved = await vehicleService.upsertVehicle({ ...v, id: dbId(v.id) });
    set((s) => ({
      vehicles: s.vehicles.some((x) => x.id === saved.id)
        ? s.vehicles.map((x) =>
            x.id === saved.id
              ? {
                  ...saved,
                  trailerId: saved.trailerId ?? x.trailerId,
                  trailerIds: saved.trailerIds?.length ? saved.trailerIds : x.trailerIds,
                }
              : x,
          )
        : [...s.vehicles, saved].sort((a, b) => a.plate.localeCompare(b.plate)),
    }));
    return saved;
  },

  deleteVehicle: async (id) => {
    if (shouldUseLocalTenantData()) {
      set((s) => {
        const next = {
          ...s,
          vehicles: s.vehicles.filter((v) => v.id !== id),
          drivers: s.drivers.map((d) => (d.vehicleId === id ? { ...d, vehicleId: undefined } : d)),
          trailers: s.trailers.map((t) =>
            t.vehicleId === id ? { ...t, vehicleId: undefined } : t,
          ),
        };
        persistLocalState(next);
        return next;
      });
      return;
    }
    await vehicleService.deleteVehicle(id);
    set((s) => ({
      vehicles: s.vehicles.filter((v) => v.id !== id),
      drivers: s.drivers.map((d) => (d.vehicleId === id ? { ...d, vehicleId: undefined } : d)),
      trailers: s.trailers.map((t) => (t.vehicleId === id ? { ...t, vehicleId: undefined } : t)),
    }));
  },

  upsertDriver: async (d) => {
    if (shouldUseLocalTenantData()) {
      const saved: Driver = { ...d, id: d.id || nextLocalId("driver") };
      set((s) => {
        const next = {
          ...s,
          drivers: s.drivers.some((x) => x.id === saved.id)
            ? s.drivers.map((x) => (x.id === saved.id ? saved : x))
            : [...s.drivers, saved].sort((a, b) => a.name.localeCompare(b.name)),
        };
        persistLocalState(next);
        return next;
      });
      return saved;
    }
    const saved = await driverService.upsertDriver({ ...d, id: dbId(d.id) });
    set((s) => ({
      drivers: s.drivers.some((x) => x.id === saved.id)
        ? s.drivers.map((x) => (x.id === saved.id ? saved : x))
        : [...s.drivers, saved].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return saved;
  },

  deleteDriver: async (id) => {
    if (shouldUseLocalTenantData()) {
      set((s) => {
        const next = { ...s, drivers: s.drivers.filter((d) => d.id !== id) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    await driverService.deleteDriver(id);
    set((s) => ({ drivers: s.drivers.filter((d) => d.id !== id) }));
  },

  upsertTrailer: async (t) => {
    if (shouldUseLocalTenantData()) {
      const saved: Trailer = { ...t, id: t.id || nextLocalId("trailer") };
      set((s) => {
        const next = {
          ...s,
          trailers: s.trailers.some((x) => x.id === saved.id)
            ? s.trailers.map((x) => (x.id === saved.id ? saved : x))
            : [...s.trailers, saved].sort(compareTrailers),
        };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await trailerService.upsertTrailer({ ...t, id: dbId(t.id) });
    set((s) => ({
      trailers: s.trailers.some((x) => x.id === saved.id)
        ? s.trailers.map((x) => (x.id === saved.id ? saved : x))
        : [...s.trailers, saved].sort(compareTrailers),
    }));
  },

  deleteTrailer: async (id) => {
    if (shouldUseLocalTenantData()) {
      set((s) => {
        const next = { ...s, trailers: s.trailers.filter((t) => t.id !== id) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    await trailerService.deleteTrailer(id);
    set((s) => ({ trailers: s.trailers.filter((t) => t.id !== id) }));
  },

  setVehicleStatus: async (id, status, freightStage) => {
    if (shouldUseLocalTenantData()) {
      const timestamp = new Date().toISOString();
      set((s) => {
        const vehicle = s.vehicles.find((item) => item.id === id);
        if (!vehicle) return s;
        const saved = {
          ...vehicle,
          status,
          freightStage: freightStage ?? vehicle.freightStage,
          situation: status.startsWith("rota")
            ? "em-rota"
            : status === "parado-quebrado"
              ? "quebrado"
              : status === "manutencao" || status === "disponivel-oficina"
                ? "manutencao"
                : status === "disponivel-patio"
                  ? "disponivel-patio"
                  : "parado",
          updatedAt: timestamp,
        } as Vehicle;
        const next = {
          ...s,
          vehicles: s.vehicles.map((v) => (v.id === saved.id ? saved : v)),
          events: [
            {
              id: nextLocalId("event"),
              vehicleId: saved.id,
              status: saved.status,
              freightStage: saved.freightStage,
              city: saved.city,
              state: saved.state,
              source: "Operador",
              description: "Status atualizado manualmente",
              timestamp,
            },
            ...s.events,
          ],
        };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await vehicleService.updateVehicleStatus(
      id,
      status,
      "Operador",
      undefined,
      freightStage,
    );
    set((s) => ({
      vehicles: s.vehicles.map((v) =>
        v.id === saved.id
          ? {
              ...saved,
              trailerId: saved.trailerId ?? v.trailerId,
              trailerIds: saved.trailerIds?.length ? saved.trailerIds : v.trailerIds,
            }
          : v,
      ),
    }));
    void get().refreshDomain("events", { force: true, silent: true });
  },

  archiveFreight: async (vehicleId, reason) => {
    if (shouldUseLocalTenantData()) {
      await get().setVehicleStatus(vehicleId, "disponivel-patio", "DISPONIVEL");
      return;
    }
    await vehicleService.archiveVehicleFreight(vehicleId, reason);
    await get().loadAll({ force: true, silent: true });
  },

  link: async (vehicleId, driverId, trailerId, extras) => {
    if (shouldUseLocalTenantData()) {
      set((s) => {
        const trailerIds = extras?.trailerIds ?? (trailerId ? [trailerId] : []);
        const next = {
          ...s,
          vehicles: s.vehicles.map((vehicle) =>
            vehicle.id === vehicleId
              ? {
                  ...vehicle,
                  driverId,
                  trailerId: trailerIds[0] ?? trailerId,
                  trailerIds,
                  senderId: extras?.senderId,
                  recipientId: extras?.recipientId,
                  productId: extras?.productId,
                  freightValue: extras?.freightValue,
                  freightPricingMode: extras?.freightPricingMode ?? "fixed",
                  freightTonPrice: extras?.freightTonPrice,
                  unloadedTons: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : vehicle,
          ),
          drivers: s.drivers.map((driver) =>
            driver.id === driverId
              ? { ...driver, vehicleId }
              : driver.vehicleId === vehicleId
                ? { ...driver, vehicleId: undefined }
                : driver,
          ),
          trailers: s.trailers.map((trailer) =>
            trailerIds.includes(trailer.id)
              ? { ...trailer, vehicleId }
              : trailer.vehicleId === vehicleId
                ? { ...trailer, vehicleId: undefined }
                : trailer,
          ),
        };
        persistLocalState(next);
        return next;
      });
      return;
    }
    await vehicleService.linkVehicle({
      vehicleId,
      driverId,
      trailerId,
      trailerIds: extras?.trailerIds ?? (trailerId ? [trailerId] : undefined),
      senderId: extras?.senderId,
      recipientId: extras?.recipientId,
      productId: extras?.productId,
      freightValue: extras?.freightValue,
      freightPricingMode: extras?.freightPricingMode ?? "fixed",
      freightTonPrice: extras?.freightTonPrice,
      freightPaymentType: extras?.freightPaymentType,
      paymentTermDays: extras?.paymentTermDays ?? null,
    });
    await get().loadAll({ force: true, silent: true });
  },

  addSender: async (s) => {
    if (shouldUseLocalTenantData()) {
      const saved: Sender = { ...s, id: s.id || nextLocalId("sender") };
      set((st) => {
        const next = {
          ...st,
          senders: [...st.senders.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await partiesService.upsertSender({ ...s, id: dbId(s.id) } as Sender);
    set((st) => ({
      senders: [...st.senders.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  },

  updateSender: async (s) => {
    if (shouldUseLocalTenantData()) {
      set((st) => {
        const next = { ...st, senders: st.senders.map((x) => (x.id === s.id ? s : x)) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await partiesService.upsertSender(s);
    set((st) => ({ senders: st.senders.map((x) => (x.id === saved.id ? saved : x)) }));
  },

  deleteSender: async (id) => {
    if (shouldUseLocalTenantData()) {
      set((st) => {
        const next = { ...st, senders: st.senders.filter((s) => s.id !== id) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    await partiesService.deleteSender(id);
    set((st) => ({ senders: st.senders.filter((s) => s.id !== id) }));
  },

  addRecipient: async (r) => {
    if (shouldUseLocalTenantData()) {
      const saved: Recipient = { ...r, id: r.id || nextLocalId("recipient") };
      set((st) => {
        const next = {
          ...st,
          recipients: [...st.recipients.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await partiesService.upsertRecipient({ ...r, id: dbId(r.id) } as Recipient);
    set((st) => ({
      recipients: [...st.recipients.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  },

  updateRecipient: async (r) => {
    if (shouldUseLocalTenantData()) {
      set((st) => {
        const next = { ...st, recipients: st.recipients.map((x) => (x.id === r.id ? r : x)) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await partiesService.upsertRecipient(r);
    set((st) => ({ recipients: st.recipients.map((x) => (x.id === saved.id ? saved : x)) }));
  },

  deleteRecipient: async (id) => {
    if (shouldUseLocalTenantData()) {
      set((st) => {
        const next = { ...st, recipients: st.recipients.filter((r) => r.id !== id) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    await partiesService.deleteRecipient(id);
    set((st) => ({ recipients: st.recipients.filter((r) => r.id !== id) }));
  },

  addProduct: async (p) => {
    if (shouldUseLocalTenantData()) {
      const saved: Product = { ...p, id: p.id || nextLocalId("product") };
      set((st) => {
        const next = {
          ...st,
          products: [...st.products.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await productsService.upsertProduct({ ...p, id: dbId(p.id) } as Product);
    set((st) => ({
      products: [...st.products.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  },

  updateProduct: async (p) => {
    if (shouldUseLocalTenantData()) {
      set((st) => {
        const next = { ...st, products: st.products.map((x) => (x.id === p.id ? p : x)) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    const saved = await productsService.upsertProduct(p);
    set((st) => ({ products: st.products.map((x) => (x.id === saved.id ? saved : x)) }));
  },

  deleteProduct: async (id) => {
    if (shouldUseLocalTenantData()) {
      set((st) => {
        const next = { ...st, products: st.products.filter((p) => p.id !== id) };
        persistLocalState(next);
        return next;
      });
      return;
    }
    await productsService.deleteProduct(id);
    set((st) => ({ products: st.products.filter((p) => p.id !== id) }));
  },
}));

function compareTrailers(a: Trailer, b: Trailer) {
  const aSeq = a.fleetSeq ?? Number.MAX_SAFE_INTEGER;
  const bSeq = b.fleetSeq ?? Number.MAX_SAFE_INTEGER;
  if (aSeq !== bSeq) return aSeq - bSeq;
  return a.identifier.localeCompare(b.identifier);
}
