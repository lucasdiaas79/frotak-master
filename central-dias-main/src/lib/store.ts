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
import { supabase } from "./supabase";
import { getActiveTenantId, shouldUseLocalTenantData } from "./auth";
import { loadLocalFleetData, nextLocalId, saveLocalFleetData } from "./localFleetData";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dbId(id?: string) {
  return id && uuidLike.test(id) ? id : "";
}

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
  loadAll: () => Promise<void>;
  subscribeRealtime: () => () => void;
  upsertVehicle: (v: Vehicle) => Promise<Vehicle>;
  deleteVehicle: (id: string) => Promise<void>;
  upsertDriver: (d: Driver) => Promise<void>;
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
      trailerIds?: string[];
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
  const [vehicles, drivers, trailers, senders, recipients, products, events] = await Promise.all([
    vehicleService.listVehicles(),
    driverService.listDrivers(),
    trailerService.listTrailers(),
    partiesService.listSenders(),
    partiesService.listRecipients(),
    productsService.listProducts(),
    eventsService.listFleetEvents(),
  ]);
  return { vehicles, drivers, trailers, senders, recipients, products, events };
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

  loadAll: async () => {
    if (shouldUseLocalTenantData()) {
      set({ ...loadLocalFleetData(getActiveTenantId()), loading: false, error: undefined });
      return;
    }
    set({ loading: true, error: undefined });
    try {
      set({ ...(await loadFleetData()), loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Erro ao carregar dados da frota.",
      });
      throw error;
    }
  },

  subscribeRealtime: () => {
    if (shouldUseLocalTenantData()) return () => {};
    let reloadTimer: number | undefined;
    const reload = () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        void get().loadAll();
      }, 250);
    };
    const channel = supabase
      .channel("fleet-operational-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_trailers" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "trailers" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "senders" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "recipients" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_events" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_documents" }, reload)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manual_workflow_overrides" },
        reload,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_positions" }, reload)
      .subscribe((status) => set({ realtimeReady: status === "SUBSCRIBED" }));

    return () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      void supabase.removeChannel(channel);
      set({ realtimeReady: false });
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
        ? s.vehicles.map((x) => (x.id === saved.id ? saved : x))
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
      return;
    }
    const saved = await driverService.upsertDriver({ ...d, id: dbId(d.id) });
    set((s) => ({
      drivers: s.drivers.some((x) => x.id === saved.id)
        ? s.drivers.map((x) => (x.id === saved.id ? saved : x))
        : [...s.drivers, saved].sort((a, b) => a.name.localeCompare(b.name)),
    }));
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
      vehicles: s.vehicles.map((v) => (v.id === saved.id ? saved : v)),
    }));
    void get().loadAll();
  },

  archiveFreight: async (vehicleId, reason) => {
    if (shouldUseLocalTenantData()) {
      await get().setVehicleStatus(vehicleId, "disponivel-patio", "DISPONIVEL");
      return;
    }
    await vehicleService.archiveVehicleFreight(vehicleId, reason);
    await get().loadAll();
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
    });
    await get().loadAll();
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
