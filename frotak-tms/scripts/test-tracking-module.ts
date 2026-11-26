import assert from "node:assert/strict";
import test from "node:test";
import type {
  TrackerProvider,
  TrackerSyncSettings,
  TrackingRepository,
} from "@/modules/frotak-tracking/application/ports";
import { syncTrackerPositions } from "@/modules/frotak-tracking/application/syncTrackerPositions";
import type {
  TrackedVehicle,
  TrackerPosition,
} from "@/modules/frotak-tracking/domain/trackerPositions";
import { trackerSyncStateFromRecord } from "@/modules/frotak-tracking/domain/trackerSyncState";

const settings: TrackerSyncSettings = {
  includeCurrentHistoryByDefault: false,
  currentHistoryConcurrency: 2,
  currentHistoryStaleMinutes: 15,
  currentHistoryLookbackHours: 3,
  maxRecoveryPages: 2,
};

function position(
  sequence: number,
  externalVehicleId: string,
  minutesAgo: number,
  extra: Partial<TrackerPosition> = {},
): TrackerPosition {
  return {
    externalVehicleId,
    sequence,
    recordedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    latitude: -12.9,
    longitude: -38.5,
    hasGps: true,
    raw: { sequence },
    ...extra,
  };
}

function setup(options: {
  vehicles?: TrackedVehicle[];
  storedSequence?: number | null;
  latest?: TrackerPosition[];
  ranges?: Record<string, TrackerPosition[]>;
  history?: TrackerPosition[];
  lockFree?: boolean;
  batchLimit?: number;
}) {
  const log: string[] = [];
  const saved: Array<{ vehicleId: string; sequence: number }> = [];
  const states: Array<Record<string, unknown>> = [];
  const vehicles = options.vehicles ?? [
    { id: "v1", tenantId: "t1", plate: "ABC1D23", externalId: null, lastPositionAt: null },
    { id: "v2", tenantId: "t1", plate: "XYZ9K88", externalId: "200", lastPositionAt: null },
  ];

  const provider: TrackerProvider = {
    name: "fake",
    label: "Fake",
    batchLimit: options.batchLimit ?? 3000,
    listVehicles: async () => [
      { externalId: "100", plate: "ABC1D23" },
      { externalId: "200", plate: "XYZ9K88" },
    ],
    latestPositions: async () => options.latest ?? [],
    positionsBySequence: async (start, end) => {
      log.push(`range:${start}-${end}`);
      return options.ranges?.[`${start}-${end}`] ?? [];
    },
    vehicleHistory: async (externalId) => {
      log.push(`history:${externalId}`);
      return options.history ?? [];
    },
  };

  const repository: TrackingRepository = {
    findSyncTarget: async (workspaceId) => ({
      workspaceId,
      tenantId: "t1",
      integration: { provider: "fake", secretRef: null, config: null },
    }),
    acquireLock: async (key) => {
      log.push(`lock:${key}`);
      return options.lockFree ?? true;
    },
    releaseLock: async (key) => {
      log.push(`unlock:${key}`);
    },
    listVehicles: async () => vehicles,
    readLastSequence: async () => options.storedSequence ?? null,
    bindVehicle: async (vehicleId, externalId) => {
      log.push(`bind:${vehicleId}:${externalId}`);
    },
    savePosition: async (vehicle, item) => {
      saved.push({ vehicleId: vehicle.id, sequence: item.sequence });
    },
    purgeOldPositions: async () => 7,
    saveSyncState: async (input) => {
      states.push({ tenantId: input.tenantId, provider: input.provider, ...input.metadata });
    },
  };

  const deps = {
    repository,
    providers: { supportedProviders: ["fake"], create: () => provider },
    settings,
  };
  return { deps, log, saved, states, vehicles };
}

test("first sync binds vehicles by plate and applies the latest GPS position of each", async () => {
  const { deps, log, saved, states } = setup({
    latest: [
      position(10, "100", 30),
      position(11, "100", 20),
      position(12, "200", 10),
      position(13, "200", 5, { hasGps: false }),
      position(14, "999", 1),
    ],
  });

  const result = await syncTrackerPositions(deps, { workspaceId: "w1" });

  assert.deepEqual(
    log.filter((line) => line.startsWith("bind")),
    ["bind:v1:100"],
  );
  assert.deepEqual(saved, [
    { vehicleId: "v1", sequence: 11 },
    { vehicleId: "v2", sequence: 12 },
  ]);
  assert.equal(result.stats.packetsApplied, 2);
  assert.equal(result.stats.skippedPackets, 1);
  assert.equal(result.stats.trackerVehicles, 2);
  assert.equal(result.stats.oldPositionsDeleted, 7);
  assert.equal(states[0].lastPacketId, 14);
  assert.equal(states[0].provider, "fake");
  assert.equal(log.at(-1), "unlock:fake-sync:w1");
});

test("incremental sync only processes positions after the stored cursor", async () => {
  const { deps, saved } = setup({
    storedSequence: 11,
    latest: [position(10, "100", 30), position(11, "100", 20), position(12, "200", 10)],
  });
  const result = await syncTrackerPositions(deps, { workspaceId: "w1" });
  assert.deepEqual(saved, [{ vehicleId: "v2", sequence: 12 }]);
  assert.equal(result.stats.lastPacketIdBefore, 11);
  assert.equal(result.stats.lastPacketIdAfter, 12);
});

test("a cursor older than the current window recovers the gap by sequence ranges", async () => {
  const { deps, log, saved } = setup({
    storedSequence: 50,
    batchLimit: 30,
    latest: [position(100, "100", 5)],
    ranges: { "51-80": [position(60, "200", 40)], "81-100": [position(90, "100", 30)] },
  });
  await syncTrackerPositions(deps, { workspaceId: "w1" });
  assert.deepEqual(
    log.filter((line) => line.startsWith("range")),
    ["range:51-80", "range:81-100"],
  );
  assert.deepEqual(saved, [
    { vehicleId: "v2", sequence: 60 },
    { vehicleId: "v1", sequence: 90 },
  ]);
});

test("a busy lock stops the sync without releasing someone else's lock", async () => {
  const { deps, log } = setup({ lockFree: false });
  await assert.rejects(syncTrackerPositions(deps, { workspaceId: "w1" }), /ja esta em andamento/);
  assert.deepEqual(log, ["lock:fake-sync:w1"]);
});

test("stale vehicles without a new position are completed from their recent history", async () => {
  const { deps, log, saved } = setup({
    latest: [position(10, "100", 5)],
    history: [position(3, "200", 60), position(4, "200", 50)],
  });
  const result = await syncTrackerPositions(deps, {
    workspaceId: "w1",
    includeCurrentHistory: true,
  });
  assert.ok(log.includes("history:200"));
  assert.ok(!log.includes("history:100"), "vehicle synced in this run is not checked again");
  assert.deepEqual(saved, [
    { vehicleId: "v1", sequence: 10 },
    { vehicleId: "v2", sequence: 4 },
  ]);
  assert.equal(result.stats.currentPositionsApplied, 1);
});

test("sync state record keeps only known sources and falls back to applied packets", () => {
  assert.deepEqual(
    trackerSyncStateFromRecord("2026-11-02T10:00:00Z", { source: "cron", packetsApplied: 3 }),
    {
      syncedAt: "2026-11-02T10:00:00Z",
      source: "cron",
      syncedVehicles: 3,
      packetsApplied: 3,
      packetsFetched: 0,
    },
  );
  assert.equal(trackerSyncStateFromRecord(null, { source: "other" }).source, null);
});
