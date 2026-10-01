import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator);
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value.replace(/\\n/g, "\n")];
      }),
  );
}

const envSources = [
  process.env,
  readEnvFile(path.resolve("..", ".env.local")),
  readEnvFile(path.resolve(".env.local")),
  readEnvFile(path.resolve(".env.vercel.local")),
  readEnvFile(path.resolve(".env.example")),
];
function envValue(...names) {
  for (const source of envSources) {
    for (const name of names) {
      const value = source[name]?.trim();
      if (value && value !== "[SENSITIVE]" && !value.includes("your-")) return value;
    }
  }
  return undefined;
}
const supabaseUrl = envValue("VITE_SUPABASE_URL", "SUPABASE_URL");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = envValue("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Supabase production audit variables are not available.");
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const openApiResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
  headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
});
if (!openApiResponse.ok) {
  throw new Error(`OpenAPI audit failed with HTTP ${openApiResponse.status}.`);
}
const openApi = await openApiResponse.json();
const serializedPaths = Object.fromEntries(
  Object.entries(openApi.paths ?? {}).map(([key, value]) => [key, JSON.stringify(value)]),
);
const definitions = openApi.definitions ?? openApi.components?.schemas ?? {};

const rpcChecks = {
  get_driver_app_context: [],
  driver_app_advance_stage: ["p_vehicle_id", "p_target_stage", "p_unloaded_tons", "p_odometer"],
  driver_app_complete_return: ["p_vehicle_id", "p_odometer"],
  driver_app_register_fuel_document: ["p_station", "p_odometer"],
};
const rpcContracts = Object.fromEntries(
  Object.entries(rpcChecks).map(([rpc, parameters]) => {
    const definition = serializedPaths[`/rpc/${rpc}`] ?? "";
    return [
      rpc,
      {
        exposed: Boolean(definition),
        parameters: Object.fromEntries(
          parameters.map((parameter) => [parameter, definition.includes(parameter)]),
        ),
      },
    ];
  }),
);

const columnChecks = {
  driver_trip_cycles: ["start_odometer", "end_odometer"],
  fuel_records: ["freight_id", "trip_cycle_id"],
  freight_expenses: ["payment_source", "trip_cycle_id"],
};
const schemaContracts = Object.fromEntries(
  Object.entries(columnChecks).map(([table, columns]) => {
    const properties = definitions[table]?.properties ?? {};
    return [table, Object.fromEntries(columns.map((column) => [column, column in properties]))];
  }),
);

const evidence = {
  projectRef: new URL(supabaseUrl).hostname.split(".")[0],
  rpcContracts,
  schemaContracts,
  realtimeSubscriptions: {},
  demoDriver: { attempted: false },
};

async function checkRealtimeSubscription(table) {
  return await new Promise((resolve) => {
    let settled = false;
    let timeout;
    const finish = async (status) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      await service.removeChannel(channel);
      resolve(status);
    };
    const channel = service
      .channel(`readonly-audit:${table}:${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => undefined)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void finish("subscribed");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          void finish(status.toLowerCase());
        }
      });
    timeout = setTimeout(() => void finish("timeout"), 6_000);
  });
}

const realtimeTables = [
  "vehicles",
  "freights",
  "driver_trip_cycles",
  "freight_documents",
  "fuel_records",
  "freight_expenses",
  "freight_cash_entries",
  "driver_trip_daily_allowances",
  "financial_documents",
  "financial_integration_jobs",
];
evidence.realtimeSubscriptions = Object.fromEntries(
  await Promise.all(
    realtimeTables.map(async (table) => [table, await checkRealtimeSubscription(table)]),
  ),
);

const demoPassword = envValue("FROTAK_DEMO_DRIVER_PASSWORD", "FROTAK_DEMO_PASSWORD");
if (demoPassword) {
  evidence.demoDriver.attempted = true;
  const { data: demoTenants, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .or("trade_name.ilike.%demo%,legal_name.ilike.%demo%,slug.ilike.%demo%")
    .limit(1);
  if (tenantError) throw tenantError;
  const demoTenantId = demoTenants?.[0]?.id;
  if (!demoTenantId) {
    evidence.demoDriver.result = "demo_tenant_not_found";
  } else {
    const { data: drivers, error: driverError } = await service
      .from("drivers")
      .select("id, tenant_id, vehicle_id, phone, auth_user_id")
      .eq("tenant_id", demoTenantId)
      .eq("active", true)
      .not("auth_user_id", "is", null)
      .not("phone", "is", null)
      .limit(5);
    if (driverError) throw driverError;
    let authenticatedClient = null;
    let authenticatedDriver = null;
    for (const driver of drivers ?? []) {
      const digits = String(driver.phone ?? "").replace(/\D/g, "");
      const normalized = digits.startsWith("55") ? digits : `55${digits}`;
      const candidate = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await candidate.auth.signInWithPassword({
        email: `${normalized}@driver.frotak.local`,
        password: demoPassword,
      });
      if (!error && data.session) {
        authenticatedClient = candidate;
        authenticatedDriver = driver;
        break;
      }
    }

    if (!authenticatedClient || !authenticatedDriver) {
      evidence.demoDriver.result = "authorized_demo_login_unavailable";
    } else {
      const contextResult = await authenticatedClient.rpc("get_driver_app_context");
      const ownVehicleResult = authenticatedDriver.vehicle_id
        ? await authenticatedClient
            .from("vehicles")
            .select("id")
            .eq("id", authenticatedDriver.vehicle_id)
            .limit(1)
        : { data: [], error: null };
      const { data: foreignVehicles, error: foreignLookupError } = await service
        .from("vehicles")
        .select("id")
        .neq("tenant_id", demoTenantId)
        .limit(1);
      if (foreignLookupError) throw foreignLookupError;
      const foreignVehicleId = foreignVehicles?.[0]?.id;
      const foreignVehicleResult = foreignVehicleId
        ? await authenticatedClient.from("vehicles").select("id").eq("id", foreignVehicleId)
        : { data: [], error: null };

      evidence.demoDriver = {
        attempted: true,
        result: "authenticated",
        contextRpc: contextResult.error ? (contextResult.error.code ?? "error") : "ok",
        ownVehicleDirectRead: ownVehicleResult.error
          ? (ownVehicleResult.error.code ?? "error")
          : ownVehicleResult.data?.length === 1,
        foreignVehicleDenied:
          !foreignVehicleResult.error && (foreignVehicleResult.data?.length ?? 0) === 0,
      };
      await authenticatedClient.auth.signOut();
    }
  }
}

console.log(JSON.stringify(evidence, null, 2));
