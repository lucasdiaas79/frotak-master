import assert from "node:assert/strict";
import test from "node:test";
import { createFleetStore, type FleetStoreDeps } from "@/modules/fleet-core/application/fleetStore";
import type {
  FleetChange,
  FleetChangeStatus,
  FleetRepository,
  FleetSnapshot,
} from "@/modules/fleet-core/application/ports";
import type { Driver, Vehicle } from "@/lib/types";

// O store usa timers e eventos do navegador na parte de tempo real.
const browser = {
  setTimeout: (fn: () => void) => {
    fn();
    return 1;
  },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
Object.assign(globalThis, {
  window: browser,
  document: { visibilityState: "visible", ...browser },
});

const vehicle = (id: string, plate: string, extra: Partial<Vehicle> = {}) =>
  ({ id, plate, lat: 1, lng: 2, city: "Salvador", state: "BA", ...extra }) as Vehicle;
const driver = (id: string, name: string) => ({ id, name }) as Driver;

function setup(overrides: { local?: boolean } = {}) {
  const calls: string[] = [];
  let vehicleLists = 0;
  const fleet = {
    listVehicles: async () => {
      vehicleLists += 1;
      return [vehicle("v1", "AAA1A11", { trailerIds: ["t9"] })];
    },
    listDrivers: async () => [driver("d1", "Bruno")],
    listTrailers: async () => [],
    listSenders: async () => [],
    listRecipients: async () => [],
    listProducts: async () => [],
    listFleetEvents: async () => [],
    upsertDriver: async (input: Driver) => {
      calls.push(`upsertDriver:${input.id}`);
      return input;
    },
    deleteDriver: async (id: string) => {
      calls.push(`deleteDriver:${id}`);
    },
  } as unknown as FleetRepository;

  let saved: FleetSnapshot | null = null;
  const snapshot: FleetSnapshot = {
    vehicles: [],
    drivers: [driver("local-1", "Local")],
    trailers: [],
    senders: [],
    recipients: [],
    products: [],
    events: [],
  };
  let emit: (change: FleetChange) => void = () => {};
  let status: (value: FleetChangeStatus) => void = () => {};
  let stopped = 0;

  const deps: FleetStoreDeps = {
    fleet,
    local: {
      load: () => snapshot,
      save: (_tenant, value) => {
        saved = value;
      },
      nextId: (prefix) => `${prefix}-novo`,
    },
    session: { activeTenantId: () => "t1", usesLocalData: () => Boolean(overrides.local) },
    changes: {
      watch: (_tenant, handlers) => {
        emit = handlers.onChange;
        status = handlers.onStatus;
        return () => {
          stopped += 1;
        };
      },
    },
  };

  return {
    store: createFleetStore(deps),
    calls,
    vehicleLists: () => vehicleLists,
    saved: () => saved as FleetSnapshot | null,
    emit: (change: FleetChange) => emit(change),
    status: (value: FleetChangeStatus) => status(value),
    stopped: () => stopped,
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("loadAll fills every domain from the repository", async () => {
  const { store } = setup();
  await store.getState().loadAll();
  assert.equal(store.getState().vehicles[0].id, "v1");
  assert.equal(store.getState().drivers[0].name, "Bruno");
  assert.equal(store.getState().loading, false);
});

test("realtime saved and deleted changes update the list, sorted by name", async () => {
  const { store, emit } = setup();
  await store.getState().loadAll();
  store.getState().subscribeRealtime();
  emit({
    type: "saved",
    domain: "drivers",
    id: "d0",
    eventType: "INSERT",
    toItem: () => driver("d0", "Ana"),
  });
  assert.deepEqual(
    store.getState().drivers.map((item) => item.name),
    ["Ana", "Bruno"],
  );
  emit({ type: "deleted", domain: "drivers", id: "d1", eventType: "DELETE" });
  assert.deepEqual(
    store.getState().drivers.map((item) => item.name),
    ["Ana"],
  );
});

test("a vehicle change receives the trailers the vehicle already has", async () => {
  const { store, emit } = setup();
  await store.getState().loadAll();
  store.getState().subscribeRealtime();
  let received: string[] | undefined;
  emit({
    type: "vehicleSaved",
    id: "v1",
    eventType: "UPDATE",
    toVehicle: (trailerIds) => {
      received = trailerIds;
      return vehicle("v1", "AAA1A11", { trailerIds, city: "Feira" });
    },
  });
  assert.deepEqual(received, ["t9"]);
  assert.equal(store.getState().vehicles[0].city, "Feira");
});

test("a change that cannot be converted reloads the domain instead of breaking", async () => {
  const { store, emit, vehicleLists } = setup();
  await store.getState().loadAll();
  store.getState().subscribeRealtime();
  const before = vehicleLists();
  emit({
    type: "vehicleSaved",
    id: "v1",
    eventType: "UPDATE",
    toVehicle: () => {
      throw new Error("linha invalida");
    },
  });
  await settle();
  assert.equal(vehicleLists(), before + 1);
});

test("a related table change only reloads the domain", async () => {
  const { store, emit, vehicleLists } = setup();
  await store.getState().loadAll();
  store.getState().subscribeRealtime();
  const before = vehicleLists();
  emit({ type: "stale", domain: "vehicles" });
  await settle();
  assert.equal(vehicleLists(), before + 1);
});

test("positions update only known vehicles and keep missing fields", async () => {
  const { store, emit } = setup();
  await store.getState().loadAll();
  store.getState().subscribeRealtime();
  emit({
    type: "position",
    vehicleId: "v1",
    eventType: "INSERT",
    lat: 9,
    recordedAt: "2026-11-04T10:00:00Z",
  });
  emit({ type: "position", vehicleId: "outro", eventType: "INSERT", lat: 50 });
  const [current] = store.getState().vehicles;
  assert.equal(current.lat, 9);
  assert.equal(current.lng, 2);
  assert.equal(current.city, "Salvador");
  assert.equal(current.lastPositionAt, "2026-11-04T10:00:00Z");
});

test("status reflects the channel and reconnecting reloads the domains", async () => {
  const { store, status, vehicleLists, stopped } = setup();
  await store.getState().loadAll();
  const stop = store.getState().subscribeRealtime();
  status({ ready: true, reconnected: false, lost: false });
  assert.equal(store.getState().realtimeReady, true);
  const before = vehicleLists();
  status({ ready: true, reconnected: true, lost: false });
  await settle();
  assert.equal(vehicleLists(), before + 1);
  stop();
  assert.equal(stopped(), 1);
  assert.equal(store.getState().realtimeReady, false);
});

test("local mode reads and writes the local copy, without calling the repository", async () => {
  const { store, calls, vehicleLists, saved } = setup({ local: true });
  await store.getState().loadAll();
  assert.equal(vehicleLists(), 0);
  assert.equal(store.getState().drivers[0].name, "Local");
  await store.getState().deleteDriver("local-1");
  assert.deepEqual(calls, []);
  assert.deepEqual(saved()?.drivers, []);
});

test("remote mode writes through the repository", async () => {
  const { store, calls } = setup();
  await store.getState().loadAll();
  const id = "11111111-1111-4111-8111-111111111111";
  await store.getState().upsertDriver(driver(id, "Bruno Silva"));
  await store.getState().deleteDriver(id);
  assert.deepEqual(calls, [`upsertDriver:${id}`, `deleteDriver:${id}`]);
});
