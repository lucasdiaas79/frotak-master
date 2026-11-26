import assert from "node:assert/strict";
import test from "node:test";
import { getAssetAssignmentMode } from "@/modules/driver-app/application/getAssetAssignmentMode";
import { grantDriverAppAccess } from "@/modules/driver-app/application/grantDriverAppAccess";
import type {
  DriverAccessRepository,
  DriverIdentityProvider,
} from "@/modules/driver-app/application/ports";
import { normalizeAssetAssignmentMode } from "@/modules/driver-app/domain/assetAssignmentMode";
import { buildDriverLogin, type DriverRecord } from "@/modules/driver-app/domain/driverAccess";

const driver: DriverRecord = {
  id: "driver-1",
  tenantId: "tenant-1",
  name: "Joao",
  phone: "(71) 99999-0000",
  authUserId: null,
};

function fakes(
  overrides: { ownedWorkspace?: string | null; moduleOn?: boolean; existing?: string | null } = {},
) {
  const calls: string[] = [];
  const identity: DriverIdentityProvider = {
    resolveUserId: async (token) => (token === "valid" ? "owner-1" : null),
    findLogin: async () => overrides.existing ?? null,
    createLogin: async (login) => {
      calls.push(`create:${login.email}`);
      return "new-user";
    },
    resetLogin: async (userId) => {
      calls.push(`reset:${userId}`);
    },
  };
  const drivers: DriverAccessRepository = {
    findDriver: async (id) => (id === driver.id ? driver : null),
    findOwnedWorkspace: async () =>
      overrides.ownedWorkspace === undefined ? "workspace-1" : overrides.ownedWorkspace,
    hasDriverAppModule: async () => overrides.moduleOn ?? true,
    saveDriverProfile: async (userId) => {
      calls.push(`profile:${userId}`);
    },
    linkDriverLogin: async (driverId, userId) => {
      calls.push(`link:${driverId}:${userId}`);
    },
    recordAccessGranted: async (input) => {
      calls.push(`audit:${input.actorUserId}`);
    },
  };
  return { deps: { identity, drivers }, calls };
}

test("asset assignment mode reads both setting spellings and defaults to fixed vehicle", () => {
  assert.equal(
    normalizeAssetAssignmentMode({ driverApp: { assetAssignmentMode: "manual_per_freight" } }),
    "manual_per_freight",
  );
  assert.equal(
    normalizeAssetAssignmentMode({ driver_app: { asset_assignment_mode: "manual_per_freight" } }),
    "manual_per_freight",
  );
  assert.equal(normalizeAssetAssignmentMode(null), "fixed_vehicle");
  assert.equal(
    normalizeAssetAssignmentMode({ driverApp: { assetAssignmentMode: "x" } }),
    "fixed_vehicle",
  );
});

test("driver login derives e-mail from the phone and rejects short numbers", () => {
  const login = buildDriverLogin(driver, "");
  assert.equal(login.phone, "+5571999990000");
  assert.equal(login.email, "5571999990000@driver.frotak.local");
  assert.throws(() => buildDriverLogin({ ...driver, phone: null }, "123"), /Telefone invalido/);
});

test("grant creates a login, links the driver and records the audit", async () => {
  const { deps, calls } = fakes();
  const result = await grantDriverAppAccess(deps, {
    accessToken: "valid",
    driverId: "driver-1",
    phone: "",
  });
  assert.deepEqual(result, { driverId: "driver-1", authUserId: "new-user" });
  assert.deepEqual(calls, [
    "create:5571999990000@driver.frotak.local",
    "profile:new-user",
    "link:driver-1:new-user",
    "audit:owner-1",
  ]);
});

test("grant resets an existing login instead of creating another", async () => {
  const { deps, calls } = fakes({ existing: "old-user" });
  await grantDriverAppAccess(deps, { accessToken: "valid", driverId: "driver-1", phone: "" });
  assert.equal(calls[0], "reset:old-user");
});

test("grant refuses anonymous users, non-owners and tenants without the module", async () => {
  await assert.rejects(
    grantDriverAppAccess(fakes().deps, { accessToken: "nope", driverId: "driver-1", phone: "" }),
    /nao autenticado/,
  );
  await assert.rejects(
    grantDriverAppAccess(fakes({ ownedWorkspace: null }).deps, {
      accessToken: "valid",
      driverId: "driver-1",
      phone: "",
    }),
    /Apenas o owner/,
  );
  await assert.rejects(
    grantDriverAppAccess(fakes({ moduleOn: false }).deps, {
      accessToken: "valid",
      driverId: "driver-1",
      phone: "",
    }),
    /App Motorista nao esta liberado/,
  );
});

test("unreadable tenant settings fall back to the fixed vehicle mode", async () => {
  const mode = await getAssetAssignmentMode(
    {
      getTenantSettings: async () => {
        throw new Error("offline");
      },
    },
    "tenant-1",
  );
  assert.equal(mode, "fixed_vehicle");
});
