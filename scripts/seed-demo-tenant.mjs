import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DEMO_SLUG = "frotak-demo";
const DEMO_EMAIL = "demo@frotak.local";
const DEMO_PASSWORD = "FrotakDemo2026!";
const DEMO_TENANT_NAME = "Frotak Demo";
const DEMO_WORKSPACE_NAME = "Frotak Demo";

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch {
    // Env vars may already be provided by CI or the shell.
  }
}

function readMigration(name) {
  const candidates = [
    resolve(ROOT, "central-dias-main", "supabase", "migrations", name),
    resolve(ROOT, "supabase", "migrations", name),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      // Try the next known migration root.
    }
  }
  throw new Error(`Migration not found: ${name}`);
}

function extractValuesBlock(sql, marker) {
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`Block not found: ${marker}`);
  const valuesStart = sql.indexOf(" values", start);
  if (valuesStart === -1) throw new Error(`VALUES not found for: ${marker}`);
  let cursor = valuesStart + " values".length;
  while (/\s/.test(sql[cursor])) cursor += 1;

  let inString = false;
  let depth = 0;
  for (let i = cursor; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    if (char === "'" && inString && next === "'") {
      i += 1;
      continue;
    }
    if (char === "'") inString = !inString;
    if (!inString) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === ";" && depth === 0) return sql.slice(cursor, i).trim();
    }
  }
  throw new Error(`VALUES block without end: ${marker}`);
}

function extractCteValuesBlock(sql, marker, nextInsert) {
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`CTE block not found: ${marker}`);
  const valuesStart = sql.indexOf(" values", start);
  const nextInsertStart = sql.indexOf(nextInsert, valuesStart);
  if (valuesStart === -1 || nextInsertStart === -1) throw new Error(`Invalid CTE block: ${marker}`);
  return sql
    .slice(valuesStart + " values".length, nextInsertStart)
    .trim()
    .replace(/\)\s*$/s, "")
    .trim();
}

function parseSqlValues(block) {
  const rows = [];
  let currentRow = null;
  let currentValue = "";
  let inString = false;

  function pushValue() {
    const raw = currentValue.trim();
    if (/^null$/i.test(raw)) currentRow.push(null);
    else if (/^true$/i.test(raw)) currentRow.push(true);
    else if (/^false$/i.test(raw)) currentRow.push(false);
    else if (/^-?\d+(\.\d+)?$/.test(raw)) currentRow.push(Number(raw));
    else currentRow.push(raw);
    currentValue = "";
  }

  for (let i = 0; i < block.length; i += 1) {
    const char = block[i];
    const next = block[i + 1];
    if (char === "'" && inString && next === "'") {
      currentValue += "'";
      i += 1;
      continue;
    }
    if (char === "'") {
      inString = !inString;
      continue;
    }
    if (!inString && char === "(") {
      currentRow = [];
      currentValue = "";
      continue;
    }
    if (!inString && char === "," && currentRow) {
      pushValue();
      continue;
    }
    if (!inString && char === ")" && currentRow) {
      pushValue();
      rows.push(currentRow);
      currentRow = null;
      currentValue = "";
      continue;
    }
    if (currentRow) currentValue += char;
  }
  return rows;
}

function normalizePlate(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function distinctBy(items, keyFn, preferLast = false) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (preferLast || !map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function uuid() {
  return crypto.randomUUID();
}

function chunk(items, size = 500) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function insertRows(supabase, table, rows, options = {}) {
  if (!rows.length) return [];
  const inserted = [];
  for (const part of chunk(rows, options.chunkSize ?? 500)) {
    const { data, error } = await supabase.from(table).insert(part).select(options.select ?? "*");
    if (error) throw new Error(`Failed inserting ${table}: ${error.message}`);
    inserted.push(...(data ?? []));
  }
  return inserted;
}

async function upsertRows(supabase, table, rows, options) {
  if (!rows.length) return [];
  const inserted = [];
  for (const part of chunk(rows, options.chunkSize ?? 500)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(part, { onConflict: options.onConflict })
      .select(options.select ?? "*");
    if (error) throw new Error(`Failed upserting ${table}: ${error.message}`);
    inserted.push(...(data ?? []));
  }
  return inserted;
}

async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function ensureDemoUser(supabase) {
  const existing = await findAuthUserByEmail(supabase, DEMO_EMAIL);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        full_name: "Administrador Frotak Demo",
        demo: true,
      },
    });
    if (error || !data.user) throw error ?? new Error("Failed updating demo user.");
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: "Administrador Frotak Demo",
      demo: true,
    },
  });
  if (error || !data.user) throw error ?? new Error("Failed creating demo user.");
  return data.user;
}

async function getActorUserId(supabase, fallbackUserId) {
  const { data, error } = await supabase
    .from("platform_users")
    .select("user_id")
    .eq("active", true)
    .in("platform_role", ["super_admin", "operations"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? fallbackUserId;
}

async function ensureDemoTenant(supabase, demoUser) {
  const { data: existing, error: existingError } = await supabase
    .from("tenants")
    .select("id, slug, settings, workspaces(id, slug)")
    .eq("slug", DEMO_SLUG)
    .maybeSingle();
  if (existingError) throw existingError;

  await upsertRows(
    supabase,
    "profiles",
    [
      {
        id: demoUser.id,
        full_name: "Administrador Frotak Demo",
        email: DEMO_EMAIL,
        active: true,
        must_change_password: false,
      },
    ],
    { onConflict: "id" },
  );

  if (existing?.id) {
    const workspaceId = existing.workspaces?.[0]?.id;
    if (!workspaceId) throw new Error("Existing demo tenant has no workspace.");
    return { tenantId: existing.id, workspaceId };
  }

  const actorUserId = await getActorUserId(supabase, demoUser.id);
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setUTCFullYear(endsAt.getUTCFullYear() + 1);

  const { data, error } = await supabase.rpc("provision_tenant", {
    p_owner_user_id: demoUser.id,
    p_owner_full_name: "Administrador Frotak Demo",
    p_legal_name: "Frotak Demo Transportes Ltda",
    p_trade_name: DEMO_TENANT_NAME,
    p_cnpj: null,
    p_tenant_slug: DEMO_SLUG,
    p_workspace_name: DEMO_WORKSPACE_NAME,
    p_workspace_slug: DEMO_SLUG,
    p_plan_code: "BASIC",
    p_starts_at: now.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_subscription_period: "Demo",
    p_max_vehicles: 150,
    p_enabled_module_codes: ["fleet_core", "financial", "frotak_tracking"],
    p_actor_user_id: actorUserId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id || !row?.workspace_id) throw new Error("Tenant provisioning returned no ids.");

  return { tenantId: row.tenant_id, workspaceId: row.workspace_id };
}

async function ensureDemoAccess(supabase, tenantId, workspaceId, userId) {
  const { data: modules, error: modulesError } = await supabase
    .from("modules")
    .select("id, code")
    .in("code", ["fleet_core", "financial", "frotak_tracking"]);
  if (modulesError) throw modulesError;

  await upsertRows(
    supabase,
    "workspace_modules",
    modules.map((module) => ({
      workspace_id: workspaceId,
      module_id: module.id,
      enabled: true,
      source: module.code === "fleet_core" ? "plan" : "addon",
      limits: module.code === "fleet_core" ? { max_vehicles: 150 } : {},
      configuration: {},
      starts_at: new Date().toISOString(),
      expires_at: null,
      created_by: userId,
    })),
    { onConflict: "workspace_id,module_id" },
  );

  const { data: ownerRole, error: roleError } = await supabase
    .from("workspace_roles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("code", "OWNER")
    .single();
  if (roleError) throw roleError;

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        status: "active",
        is_owner: true,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id" },
    )
    .select("id")
    .single();
  if (membershipError) throw membershipError;

  await upsertRows(
    supabase,
    "membership_roles",
    [{ membership_id: membership.id, role_id: ownerRole.id, workspace_id: workspaceId }],
    { onConflict: "membership_id,role_id" },
  );

  const { data: permissions, error: permissionsError } = await supabase
    .from("permissions")
    .select("id")
    .eq("active", true);
  if (permissionsError) throw permissionsError;

  await upsertRows(
    supabase,
    "role_permissions",
    permissions.map((permission) => ({ role_id: ownerRole.id, permission_id: permission.id })),
    { onConflict: "role_id,permission_id", chunkSize: 1000 },
  );

  await supabase.from("tenants").update({
    trade_name: DEMO_TENANT_NAME,
    status: "active",
    settings: {
      clientUrl: "https://central-dias.vercel.app",
      demo: true,
      maxVehicles: 150,
      seededMonths: 6,
    },
  }).eq("id", tenantId);
}

async function clearDemoData(supabase, tenantId) {
  const workspaceTables = [
    "payroll_audit_events",
    "payroll_items",
    "employee_advances",
    "payroll_entries",
    "payroll_periods",
    "employee_financial_profiles",
    "financial_settlements",
    "financial_allocations",
    "financial_installments",
  ];
  for (const table of workspaceTables) {
    const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId);
    if (error && error.code !== "42P01") throw new Error(`Failed clearing ${table}: ${error.message}`);
  }

  await supabase.from("financial_documents").update({ status: "draft" }).eq("tenant_id", tenantId);
  const { error: financialDocsError } = await supabase.from("financial_documents").delete().eq("tenant_id", tenantId);
  if (financialDocsError) throw new Error(`Failed clearing financial_documents: ${financialDocsError.message}`);

  const remainingTables = [
    "financial_recurring_rules",
    "financial_accounts",
    "legacy_partner_links",
    "business_partner_roles",
    "business_partners",
    "manual_workflow_overrides",
    "freight_documents",
    "freights",
    "freight_history",
    "fuel_records",
    "vehicle_positions",
    "fleet_events",
    "vehicle_trailers",
    "vehicles",
    "drivers",
    "trailers",
    "senders",
    "recipients",
    "products",
    "integration_sync_state",
  ];
  for (const table of remainingTables) {
    const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId);
    if (error && error.code !== "42P01") throw new Error(`Failed clearing ${table}: ${error.message}`);
  }
}

function buildFleetRows(tenantId) {
  const fleetSql = readMigration("202606100002_reset_fleet_from_spreadsheet.sql");
  const trailersSql = readMigration("202606150001_refresh_trailers_from_final_fleet_sheet.sql");
  const vehicleMetaSql = readMigration("202606150004_refresh_vehicle_metadata_from_final_fleet_sheet.sql");
  const phonesSql = readMigration("202606150005_refresh_driver_phones_from_final_fleet_sheet.sql");
  const clientsSql = readMigration("202606160002_refresh_clients_from_sheet.sql");
  const catalogSql = readMigration("202606080001_refresh_commercial_catalogs.sql");

  const assignments = parseSqlValues(extractValuesBlock(fleetSql, "insert into official_fleet_assignments")).map(
    ([rowNum, driverName, vehiclePlate, trailerText]) => ({
      rowNum,
      driverName,
      vehiclePlate,
      trailerText: trailerText || "",
      normalizedPlate: normalizePlate(vehiclePlate),
      isObservation: String(driverName).toUpperCase().startsWith("OBS:"),
    }),
  );
  const chosenVehicles = distinctBy(assignments.filter((item) => item.normalizedPlate), (item) => item.normalizedPlate, true);
  const vehicleMetadata = new Map(
    parseSqlValues(extractValuesBlock(vehicleMetaSql, "insert into official_vehicle_metadata")).map(
      ([fleetSeq, plate, brand, model, manufactureYear, renavam]) => [
        normalizePlate(plate),
        { fleetSeq, brand, model, manufactureYear, renavam },
      ],
    ),
  );
  const phoneMetadata = new Map(
    parseSqlValues(extractValuesBlock(phonesSql, "insert into official_driver_phones")).map(
      ([fleetSeq, normalizedName, phone]) => [String(normalizedName).toUpperCase(), { fleetSeq, phone }],
    ),
  );

  const drivers = distinctBy(
    assignments.filter((item) => item.driverName && !item.isObservation),
    (item) => String(item.driverName).toUpperCase(),
  ).map((item) => {
    const phone = phoneMetadata.get(String(item.driverName).toUpperCase());
    return {
      tenant_id: tenantId,
      name: item.driverName,
      phone: phone?.phone ?? null,
      cnh: `${90000000000 + (phone?.fleetSeq ?? item.rowNum)}`,
      fleet_seq: phone?.fleetSeq ?? null,
      partner_role: "Motorista",
      active: true,
    };
  });

  const vehicles = chosenVehicles.map((item) => {
    const meta = vehicleMetadata.get(item.normalizedPlate);
    return {
      tenant_id: tenantId,
      plate: String(item.vehiclePlate).trim().toUpperCase(),
      type: "CAVALO TRATOR",
      fleet_kind: "CAVALO TRATOR",
      fleet_seq: meta?.fleetSeq ?? null,
      brand: meta?.brand ?? "VOLVO",
      model: meta?.model ?? "FH 540",
      manufacture_year: meta?.manufactureYear ?? 2022,
      renavam: meta?.renavam ?? null,
      status: item.isObservation ? "manutencao" : "disponivel-patio",
      vehicle_situation: item.isObservation ? "manutencao" : "disponivel-patio",
      freight_stage: "DISPONIVEL",
      city: "Pedra Branca",
      state: "SE",
      lat: -10.6736,
      lng: -37.645,
    };
  });

  const trailers = parseSqlValues(extractValuesBlock(trailersSql, "insert into official_trailers_catalog")).map(
    ([fleetSeq, type, fleetKind, brand, model, manufactureYear, identifier, renavam, implementType, implementModel]) => ({
      tenant_id: tenantId,
      fleet_seq: fleetSeq,
      type,
      fleet_kind: fleetKind,
      brand,
      model,
      manufacture_year: manufactureYear,
      identifier: normalizePlate(identifier),
      renavam,
      implement_type: implementType,
      implement_model: implementModel,
    }),
  );

  const assignmentTrailerIds = new Set();
  for (const item of assignments) {
    const matches = String(item.trailerText).match(/[A-Z]{3}-?[0-9A-Z]{4}/gi) ?? [];
    for (const match of matches) assignmentTrailerIds.add(normalizePlate(match));
  }
  const catalogTrailerIds = new Set(trailers.map((row) => row.identifier));
  for (const identifier of assignmentTrailerIds) {
    if (!catalogTrailerIds.has(identifier)) {
      trailers.push({
        tenant_id: tenantId,
        identifier,
        type: "IMPLEMENTO",
        fleet_kind: "IMPLEMENTO",
        brand: "RANDON",
        model: "SR CA",
        manufacture_year: 2021,
        renavam: null,
        implement_type: "BASCULANTE",
        implement_model: "CACAMBA",
      });
    }
  }

  const clients = parseSqlValues(
    extractCteValuesBlock(clientsSql, "with source_clients (name, city, state) as", "insert into public.senders"),
  ).map(([name, city, state]) => ({ tenant_id: tenantId, name, cnpj: null, city, state, active: true }));

  const products = parseSqlValues(extractValuesBlock(catalogSql, "insert into public.products")).map(([name, active]) => ({
    tenant_id: tenantId,
    name,
    active,
  }));

  return { assignments, drivers, vehicles, trailers, clients, products };
}

async function seedFleet(supabase, tenantId, workspaceId) {
  const rows = buildFleetRows(tenantId);
  const drivers = await insertRows(supabase, "drivers", rows.drivers);
  const vehicles = await insertRows(supabase, "vehicles", rows.vehicles);
  const trailers = await insertRows(supabase, "trailers", rows.trailers);
  const senders = await insertRows(supabase, "senders", rows.clients);
  const recipients = await insertRows(supabase, "recipients", rows.clients);
  const products = await insertRows(supabase, "products", rows.products);

  const driversByName = new Map(drivers.map((row) => [String(row.name).toUpperCase(), row]));
  const vehiclesByPlate = new Map(vehicles.map((row) => [normalizePlate(row.plate), row]));
  const trailersByIdentifier = new Map(trailers.map((row) => [normalizePlate(row.identifier), row]));
  const stages = [
    ["rota-carregar", "em-rota", "EM_ROTA_CARREGAR", "Itabaiana", "SE"],
    ["parado-aguardando-carga", "parado", "AGUARDANDO_NOTA", "Aracaju", "SE"],
    ["aguardando-cte", "parado", "NOTA_APROVADA_AG_CTE", "Feira de Santana", "BA"],
    ["aguardando-confirmacao", "parado", "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA", "Juazeiro", "BA"],
    ["rota-descarregar", "em-rota", "EM_ROTA_ENTREGA", "Petrolina", "PE"],
    ["parado-descarregando", "parado", "ENTREGUE_AG_FINALIZACAO", "Maceio", "AL"],
    ["rota-retornando", "em-rota", "ENTREGA_FINALIZADA", "Propria", "SE"],
    ["disponivel-patio", "disponivel-patio", "DISPONIVEL", "Pedra Branca", "SE"],
  ];

  const vehicleUpdates = [];
  const driverUpdates = [];
  const trailerUpdates = [];
  const vehicleTrailerRows = [];
  const events = [];
  const positions = [];

  for (const item of rows.assignments) {
    const vehicle = vehiclesByPlate.get(item.normalizedPlate);
    if (!vehicle) continue;
    const driver = item.isObservation ? null : driversByName.get(String(item.driverName).toUpperCase());
    const trailerIds = (String(item.trailerText).match(/[A-Z]{3}-?[0-9A-Z]{4}/gi) ?? [])
      .map((match) => trailersByIdentifier.get(normalizePlate(match)))
      .filter(Boolean);
    const firstTrailer = trailerIds[0] ?? null;
    const stage = stages[(item.rowNum + vehicles.indexOf(vehicle)) % stages.length];

    vehicleUpdates.push({
      id: vehicle.id,
      driver_id: driver?.id ?? null,
      trailer_id: firstTrailer?.id ?? null,
      status: item.isObservation ? "manutencao" : stage[0],
      vehicle_situation: item.isObservation ? "manutencao" : stage[1],
      freight_stage: item.isObservation ? "DISPONIVEL" : stage[2],
      city: item.isObservation ? "Oficina Pedra Branca" : stage[3],
      state: stage[4],
      lat: -10.9 + ((item.rowNum % 24) * 0.18),
      lng: -37.8 + ((item.rowNum % 19) * 0.2),
      freight_value: item.isObservation ? null : 5200 + ((item.rowNum % 9) * 850),
    });
    if (driver?.id) driverUpdates.push({ id: driver.id, vehicle_id: vehicle.id });
    trailerIds.forEach((trailer, index) => {
      trailerUpdates.push({ id: trailer.id, vehicle_id: vehicle.id });
      vehicleTrailerRows.push({
        tenant_id: tenantId,
        vehicle_id: vehicle.id,
        trailer_id: trailer.id,
        position: index + 1,
        active: true,
      });
    });
    events.push({
      tenant_id: tenantId,
      vehicle_id: vehicle.id,
      status: item.isObservation ? "manutencao" : stage[0],
      freight_stage: item.isObservation ? "DISPONIVEL" : stage[2],
      city: item.isObservation ? "Oficina Pedra Branca" : stage[3],
      state: stage[4],
      source: "Sistema",
      description: "Evento demo: operacao simulada para apresentacao do tenant.",
      event_type: "demo_operacao",
      action_origin: "seed_demo",
      metadata: { demo: true, workspaceId },
      timestamp: addDays(new Date(), -(item.rowNum % 12)).toISOString(),
    });
    positions.push({
      tenant_id: tenantId,
      vehicle_id: vehicle.id,
      lat: -10.9 + ((item.rowNum % 24) * 0.18),
      lng: -37.8 + ((item.rowNum % 19) * 0.2),
      city: item.isObservation ? "Oficina Pedra Branca" : stage[3],
      state: stage[4],
      speed: item.isObservation ? 0 : 42 + (item.rowNum % 38),
      direction: (item.rowNum * 17) % 360,
      source: "demo",
      raw_payload: { demo: true, plate: vehicle.plate },
      recorded_at: addDays(new Date(), -(item.rowNum % 3)).toISOString(),
    });
  }

  for (const update of vehicleUpdates) {
    await supabase.from("vehicles").update(update).eq("id", update.id).eq("tenant_id", tenantId);
  }
  for (const update of driverUpdates) {
    await supabase.from("drivers").update({ vehicle_id: update.vehicle_id }).eq("id", update.id).eq("tenant_id", tenantId);
  }
  for (const update of trailerUpdates) {
    await supabase.from("trailers").update({ vehicle_id: update.vehicle_id }).eq("id", update.id).eq("tenant_id", tenantId);
  }
  const uniqueVehicleTrailerRows = distinctBy(
    vehicleTrailerRows,
    (row) => `${row.vehicle_id}:${row.trailer_id}`,
    true,
  );
  await insertRows(supabase, "vehicle_trailers", uniqueVehicleTrailerRows);
  await insertRows(supabase, "fleet_events", events);
  await insertRows(supabase, "vehicle_positions", positions);

  await upsertRows(
    supabase,
    "integration_sync_state",
    [{
      tenant_id: tenantId,
      integration: "sascar",
      scope: "positions",
      synced_at: new Date().toISOString(),
      metadata: { source: "demo", status: "healthy", syncedVehicles: positions.length },
    }],
    { onConflict: "tenant_id,integration,scope" },
  );

  return { drivers, vehicles, trailers, senders, recipients, products };
}

async function ensureFinanceCatalog(supabase, tenantId, workspaceId, userId) {
  const parents = await upsertRows(
    supabase,
    "chart_of_accounts",
    [
      ["3", "Receitas", "revenue", "credit", null, false],
      ["4", "Custos variaveis", "expense", "debit", null, false],
      ["5", "Despesas operacionais", "expense", "debit", null, false],
      ["6", "Depreciacao e amortizacao", "expense", "debit", null, false],
      ["7", "Resultado financeiro", "expense", "debit", null, false],
      ["8", "Impostos sobre resultado", "expense", "debit", null, false],
    ].map(([code, name, account_type, normal_balance, dre_group, is_postable]) => ({
      tenant_id: tenantId,
      code,
      name,
      account_type,
      normal_balance,
      dre_group,
      is_postable,
      is_system: true,
      active: true,
    })),
    { onConflict: "tenant_id,code" },
  );
  const parentByCode = new Map(parents.map((row) => [row.code, row]));
  const accounts = await upsertRows(
    supabase,
    "chart_of_accounts",
    [
      ["3.01", "3", "Receitas operacionais de fretes", "revenue", "credit", "gross_revenue"],
      ["3.02", "3", "Outras receitas", "revenue", "credit", "other_result"],
      ["3.09", "3", "Impostos e deducoes sobre receita", "contra_revenue", "debit", "revenue_deduction"],
      ["4.01", "4", "Combustivel", "expense", "debit", "variable_cost"],
      ["4.02", "4", "ARLA", "expense", "debit", "variable_cost"],
      ["4.03", "4", "Pedagio", "expense", "debit", "variable_cost"],
      ["4.04", "4", "Comissoes operacionais", "expense", "debit", "variable_cost"],
      ["5.01", "5", "Manutencao", "expense", "debit", "operating_expense"],
      ["5.02", "5", "Pneus", "expense", "debit", "operating_expense"],
      ["5.03", "5", "Salarios operacionais", "expense", "debit", "operating_expense"],
      ["5.04", "5", "Seguros", "expense", "debit", "operating_expense"],
      ["5.05", "5", "Despesas administrativas", "expense", "debit", "operating_expense"],
      ["5.06", "5", "Despesas comerciais", "expense", "debit", "operating_expense"],
      ["6.01", "6", "Depreciacao", "expense", "debit", "depreciation_amortization"],
      ["7.01", "7", "Despesas financeiras", "expense", "debit", "financial_result"],
      ["7.02", "7", "Financiamentos", "expense", "debit", "financial_result"],
      ["8.01", "8", "Impostos sobre resultado", "expense", "debit", "income_tax"],
    ].map(([code, parentCode, name, account_type, normal_balance, dre_group]) => ({
      tenant_id: tenantId,
      parent_id: parentByCode.get(parentCode)?.id,
      code,
      name,
      account_type,
      normal_balance,
      dre_group,
      is_postable: true,
      is_system: true,
      active: true,
    })),
    { onConflict: "tenant_id,code" },
  );

  const root = (await upsertRows(
    supabase,
    "cost_centers",
    [{ tenant_id: tenantId, workspace_id: workspaceId, code: "EMPRESA", name: "Empresa", is_system: true, active: true }],
    { onConflict: "tenant_id,code" },
  ))[0];
  const costCenters = await upsertRows(
    supabase,
    "cost_centers",
    [
      ["OPERACAO", "Operacao"],
      ["ADMINISTRATIVO", "Administrativo"],
      ["OFICINA", "Oficina"],
      ["COMERCIAL", "Comercial"],
    ].map(([code, name]) => ({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      parent_id: root.id,
      code,
      name,
      is_system: true,
      active: true,
    })),
    { onConflict: "tenant_id,code" },
  );

  const accountsRows = await upsertRows(
    supabase,
    "financial_accounts",
    [
      {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: "Banco Demo Principal",
        account_type: "checking",
        bank_name: "Banco Frotak",
        agency: "0001",
        account_number: "12345-6",
        opening_balance: 285000,
        opening_balance_date: isoDate(addDays(new Date(), -185)),
        active: true,
        created_by: userId,
      },
      {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: "Caixa Operacional Demo",
        account_type: "cash",
        bank_name: null,
        agency: null,
        account_number: "CX-01",
        opening_balance: 42000,
        opening_balance_date: isoDate(addDays(new Date(), -185)),
        active: true,
        created_by: userId,
      },
    ],
    { onConflict: "workspace_id,name" },
  );

  return {
    chart: new Map([...parents, ...accounts].map((row) => [row.code, row])),
    costCenters: new Map([root, ...costCenters].map((row) => [row.code, row])),
    financialAccounts: accountsRows,
  };
}

async function seedOperations(supabase, tenantId, workspaceId, fleet) {
  const freightRows = [];
  const historyRows = [];
  const vehicleUpdates = [];
  const activeVehicles = fleet.vehicles.filter((vehicle) => vehicle.vehicle_situation !== "manutencao").slice(0, 42);
  const completedVehicles = fleet.vehicles.filter((vehicle) => vehicle.vehicle_situation !== "manutencao").slice(0, 60);
  const stages = ["EM_ROTA_CARREGAR", "AGUARDANDO_NOTA", "NOTA_APROVADA_AG_CTE", "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA", "EM_ROTA_ENTREGA", "ENTREGUE_AG_FINALIZACAO"];

  activeVehicles.forEach((vehicle, index) => {
    const freightId = uuid();
    const sender = fleet.senders[index % fleet.senders.length];
    const recipient = fleet.recipients[(index + 7) % fleet.recipients.length];
    const product = fleet.products[index % fleet.products.length];
    const driver = fleet.drivers.find((row) => row.vehicle_id === vehicle.id) ?? fleet.drivers[index % fleet.drivers.length];
    const value = 5800 + ((index % 11) * 930);
    freightRows.push({
      id: freightId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      vehicle_id: vehicle.id,
      driver_id: driver?.id,
      primary_trailer_id: vehicle.trailer_id,
      trailer_ids: vehicle.trailer_id ? [vehicle.trailer_id] : [],
      sender_id: sender?.id,
      recipient_id: recipient?.id,
      product_id: product?.id,
      freight_value: value,
      lifecycle_status: "active",
      operational_status: vehicle.status,
      freight_stage: stages[index % stages.length],
      source_kind: "native",
      started_at: addDays(new Date(), -(index % 9)).toISOString(),
      snapshot: {
        demo: true,
        vehicle_plate: vehicle.plate,
        driver_name: driver?.name,
        sender_name: sender?.name,
        recipient_name: recipient?.name,
        product_name: product?.name,
      },
    });
    vehicleUpdates.push({
      id: vehicle.id,
      current_freight_id: freightId,
      sender_id: sender?.id,
      recipient_id: recipient?.id,
      product_id: product?.id,
      freight_value: value,
      freight_stage: stages[index % stages.length],
    });
  });

  for (let month = 0; month < 6; month += 1) {
    const monthDate = addDays(new Date(Date.UTC(2026, 8, 1)), -(month * 30));
    completedVehicles.forEach((vehicle, index) => {
      if ((index + month) % 3 === 0) return;
      const driver = fleet.drivers.find((row) => row.vehicle_id === vehicle.id) ?? fleet.drivers[index % fleet.drivers.length];
      const sender = fleet.senders[(index + month) % fleet.senders.length];
      const recipient = fleet.recipients[(index + month + 9) % fleet.recipients.length];
      const product = fleet.products[(index + month) % fleet.products.length];
      historyRows.push({
        tenant_id: tenantId,
        freight_id: uuid(),
        vehicle_id: vehicle.id,
        driver_id: driver?.id,
        trailer_id: vehicle.trailer_id,
        sender_id: sender?.id,
        recipient_id: recipient?.id,
        product_id: product?.id,
        vehicle_plate: vehicle.plate,
        driver_name: driver?.name,
        trailer_identifier: null,
        sender_name: sender?.name,
        sender_city: sender?.city,
        sender_state: sender?.state,
        recipient_name: recipient?.name,
        recipient_city: recipient?.city,
        recipient_state: recipient?.state,
        product_name: product?.name,
        freight_value: 4800 + ((index % 12) * 760) + month * 140,
        started_at: addDays(monthDate, index % 20).toISOString(),
        finished_at: addDays(monthDate, (index % 20) + 3).toISOString(),
        finish_reason: "Entrega concluida - demo",
        final_status: "disponivel-patio",
        final_freight_stage: "ENTREGA_FINALIZADA",
        events: [{ type: "demo", label: "Frete finalizado" }],
        stage_timeline: [{ stage: "ENTREGA_FINALIZADA", at: addDays(monthDate, (index % 20) + 3).toISOString() }],
        documents: [],
      });
    });
  }

  await insertRows(supabase, "freights", freightRows);
  for (const update of vehicleUpdates) {
    await supabase.from("vehicles").update(update).eq("id", update.id).eq("tenant_id", tenantId);
  }
  await insertRows(supabase, "freight_history", historyRows);
  return { activeFreights: freightRows, freightHistory: historyRows };
}

async function seedFuel(supabase, tenantId, fleet) {
  const rows = [];
  const stations = ["Posto Central BR", "Posto Rota Sul", "Posto Sergipe Diesel", "Posto Trevo Norte", "Posto Vale Verde"];
  const vehicles = fleet.vehicles.slice(0, 80);
  vehicles.forEach((vehicle, vehicleIndex) => {
    const driver = fleet.drivers.find((row) => row.vehicle_id === vehicle.id) ?? fleet.drivers[vehicleIndex % fleet.drivers.length];
    let odometer = 118000 + vehicleIndex * 2150;
    for (let month = 5; month >= 0; month -= 1) {
      for (let event = 0; event < 3; event += 1) {
        const date = addDays(new Date(Date.UTC(2026, 8, 1)), -(month * 30) + event * 8 + (vehicleIndex % 5));
        const liters = 240 + ((vehicleIndex + event) % 7) * 18;
        odometer += Math.round(liters * (2.05 + ((vehicleIndex % 10) * 0.08)));
        rows.push({
          tenant_id: tenantId,
          vehicle_id: vehicle.id,
          driver_id: driver?.id,
          vehicle_plate: vehicle.plate,
          driver_name: driver?.name,
          station: stations[(vehicleIndex + event + month) % stations.length],
          fuel_type: "diesel_s10",
          liters,
          amount: Number((liters * (5.86 + ((event + month) % 4) * 0.11)).toFixed(2)),
          odometer,
          notes: "Registro demo de abastecimento",
          recorded_at: date.toISOString(),
        });
      }
      const arlaDate = addDays(new Date(Date.UTC(2026, 8, 1)), -(month * 30) + 18 + (vehicleIndex % 4));
      rows.push({
        tenant_id: tenantId,
        vehicle_id: vehicle.id,
        driver_id: driver?.id,
        vehicle_plate: vehicle.plate,
        driver_name: driver?.name,
        station: stations[(vehicleIndex + month + 2) % stations.length],
        fuel_type: "arla",
        liters: 36 + (vehicleIndex % 5) * 4,
        amount: Number(((36 + (vehicleIndex % 5) * 4) * 4.15).toFixed(2)),
        odometer: odometer + 40,
        notes: "Registro demo de ARLA",
        recorded_at: arlaDate.toISOString(),
      });
    }
  });
  await insertRows(supabase, "fuel_records", rows);
  return rows;
}

async function seedFinancial(supabase, tenantId, workspaceId, userId, fleet, finance) {
  const supplierRows = [
    "Posto Central BR",
    "Posto Rota Sul",
    "Oficina Pesada Nordeste",
    "Pneus Forte Truck",
    "Seguradora Atlas",
    "Pedagios Integrados",
    "Administrativo Demo",
  ].map((name) => ({
    tenant_id: tenantId,
    trade_name: name,
    legal_name: `${name} Ltda`,
    active: true,
    metadata: { demo: true },
  }));
  const suppliers = await insertRows(supabase, "business_partners", supplierRows);
  await insertRows(
    supabase,
    "business_partner_roles",
    suppliers.map((partner) => ({ tenant_id: tenantId, partner_id: partner.id, role: "supplier", active: true })),
  );
  const { data: customers, error: customersError } = await supabase
    .from("business_partners")
    .select("id, trade_name")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .limit(60);
  if (customersError) throw customersError;

  const chart = finance.chart;
  const cost = finance.costCenters;
  const account = finance.financialAccounts[0];
  const documents = [];
  const allocations = [];
  const installments = [];
  const settlements = [];
  const today = new Date(Date.UTC(2026, 8, 4));

  function addDocument(input) {
    const id = uuid();
    const installmentId = uuid();
    const settled = input.settled === true;
    const partially = input.partial === true;
    const status = settled ? "settled" : partially ? "partially_settled" : "posted";
    documents.push({
      id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      direction: input.direction,
      partner_id: input.partnerId,
      document_type: input.documentType,
      source_type: "demo_seed",
      source_id: uuid(),
      source_event: input.sourceEvent,
      description: input.description,
      original_amount: input.amount,
      competence_date: input.competenceDate,
      issue_date: input.issueDate,
      currency: "BRL",
      status,
      chart_account_id: input.chartId,
      document_number: input.number,
      notes: "Lancamento ficticio para tenant demo.",
      created_by: userId,
      posted_by: userId,
      posted_at: new Date(input.issueDate).toISOString(),
    });
    installments.push({
      id: installmentId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      document_id: id,
      installment_number: 1,
      amount: input.amount,
      due_date: input.dueDate,
      status: settled ? "settled" : partially ? "partially_settled" : "open",
      settled_amount: settled ? input.amount : partially ? Number((input.amount * 0.45).toFixed(2)) : 0,
      settled_at: settled || partially ? new Date(input.settledOn ?? input.dueDate).toISOString() : null,
    });
    allocations.push({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      document_id: id,
      vehicle_id: input.vehicleId,
      business_partner_id: input.partnerId,
      cost_center_id: input.costCenterId,
      chart_account_id: input.chartId,
      amount: input.amount,
      percentage: 100,
      description: input.description,
    });
    if (settled || partially) {
      settlements.push({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        document_id: id,
        installment_id: installmentId,
        financial_account_id: account.id,
        settlement_type: "settlement",
        principal_amount: settled ? input.amount : Number((input.amount * 0.45).toFixed(2)),
        interest_amount: 0,
        penalty_amount: 0,
        discount_amount: 0,
        settled_on: input.settledOn ?? input.dueDate,
        payment_method: input.direction === "receivable" ? "pix" : "transfer",
        notes: "Baixa demo",
        created_by: userId,
      });
    }
  }

  for (let month = 5; month >= 0; month -= 1) {
    const base = addDays(today, -(month * 30));
    fleet.vehicles.slice(0, 55).forEach((vehicle, index) => {
      const customer = customers[(index + month) % customers.length];
      const competenceDate = isoDate(addDays(base, index % 22));
      const dueDate = isoDate(addDays(base, (index % 22) + 12));
      const amount = 5200 + ((index % 13) * 690) + month * 125;
      const settled = new Date(dueDate) < today && (index + month) % 5 !== 0;
      addDocument({
        direction: "receivable",
        partnerId: customer?.id,
        documentType: "freight_invoice",
        sourceEvent: "freight_receivable",
        description: `Frete demo ${vehicle.plate} - ${customer?.trade_name ?? "Cliente"}`,
        amount,
        competenceDate,
        issueDate: competenceDate,
        dueDate,
        settled,
        partial: !settled && (index + month) % 11 === 0,
        settledOn: settled ? isoDate(addDays(new Date(dueDate), -1 + (index % 3))) : undefined,
        chartId: chart.get("3.01")?.id,
        costCenterId: cost.get("OPERACAO")?.id,
        vehicleId: vehicle.id,
        number: `REC-DEMO-${month + 1}-${String(index + 1).padStart(3, "0")}`,
      });
    });

    const payableKinds = [
      ["Combustivel", "4.01", "OPERACAO", 14500],
      ["ARLA", "4.02", "OPERACAO", 2100],
      ["Pedagio", "4.03", "OPERACAO", 5800],
      ["Manutencao preventiva", "5.01", "OFICINA", 9800],
      ["Pneus", "5.02", "OFICINA", 7600],
      ["Seguro frota", "5.04", "ADMINISTRATIVO", 4300],
      ["Despesas administrativas", "5.05", "ADMINISTRATIVO", 3600],
      ["Tarifas bancarias", "7.01", "ADMINISTRATIVO", 950],
    ];
    payableKinds.forEach(([label, chartCode, centerCode, baseAmount], index) => {
      const supplier = suppliers[(index + month) % suppliers.length];
      const issueDate = isoDate(addDays(base, index * 3));
      const dueDate = isoDate(addDays(base, index * 3 + 10));
      const amount = Number((baseAmount + month * 300 + index * 125).toFixed(2));
      const settled = new Date(dueDate) < today && (index + month) % 4 !== 0;
      addDocument({
        direction: "payable",
        partnerId: supplier.id,
        documentType: "supplier_invoice",
        sourceEvent: "supplier_payable",
        description: `${label} demo - ${supplier.trade_name}`,
        amount,
        competenceDate: issueDate,
        issueDate,
        dueDate,
        settled,
        partial: !settled && (index + month) % 7 === 0,
        settledOn: settled ? isoDate(addDays(new Date(dueDate), index % 2)) : undefined,
        chartId: chart.get(chartCode)?.id,
        costCenterId: cost.get(centerCode)?.id,
        vehicleId: fleet.vehicles[(index + month) % fleet.vehicles.length]?.id,
        number: `PAG-DEMO-${month + 1}-${String(index + 1).padStart(3, "0")}`,
      });
    });
  }

  const insertedDocs = await insertRows(supabase, "financial_documents", documents);
  await insertRows(supabase, "financial_installments", installments);
  await insertRows(supabase, "financial_allocations", allocations);
  await insertRows(supabase, "financial_settlements", settlements);
  return { documents: insertedDocs, installments, settlements };
}

async function seedPayroll(supabase, tenantId, workspaceId, userId, fleet, finance) {
  const drivers = fleet.drivers.slice(0, 24);
  const profiles = await insertRows(
    supabase,
    "employee_financial_profiles",
    drivers.map((driver, index) => ({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      display_name: driver.name,
      driver_id: driver.id,
      job_title: index % 3 === 0 ? "Motorista carreteiro senior" : "Motorista carreteiro",
      base_salary: 3600 + (index % 6) * 280,
      default_cost_center_id: finance.costCenters.get("OPERACAO")?.id,
      default_chart_account_id: finance.chart.get("5.03")?.id,
      default_pay_day: 5,
      admission_date: isoDate(addDays(new Date(Date.UTC(2024, 0, 1)), index * 17)),
      active: true,
      notes: "Funcionario ficticio do tenant demo.",
      created_by: userId,
    })),
  );

  const periods = await insertRows(
    supabase,
    "payroll_periods",
    Array.from({ length: 6 }, (_, index) => {
      const month = new Date(Date.UTC(2026, 8 - index, 1));
      return {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        competence_month: isoDate(month),
        status: index < 5 ? "closed" : "draft",
        created_by: userId,
      };
    }),
  );

  const entries = [];
  const items = [];
  const docs = [];
  const installments = [];
  profiles.forEach((profile, profileIndex) => {
    periods.forEach((period, periodIndex) => {
      const gross = Number((profile.base_salary + 450 + (profileIndex % 5) * 120).toFixed(2));
      const deduction = Number((gross * 0.08).toFixed(2));
      const net = Number((gross - deduction).toFixed(2));
      const entryId = uuid();
      const docId = uuid();
      const dueDate = `${period.competence_month.slice(0, 7)}-05`;
      entries.push({
        id: entryId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        period_id: period.id,
        employee_profile_id: profile.id,
        employee_name_snapshot: profile.display_name,
        job_title_snapshot: profile.job_title,
        base_salary_snapshot: profile.base_salary,
        cost_center_id: profile.default_cost_center_id,
        chart_account_id: profile.default_chart_account_id,
        due_date: dueDate,
        status: periodIndex < 5 ? "posted" : "calculated",
        gross_amount: gross,
        deduction_amount: deduction,
        net_amount: net,
        financial_document_id: periodIndex < 5 ? docId : null,
        approved_by: userId,
        approved_at: new Date(dueDate).toISOString(),
        posted_by: periodIndex < 5 ? userId : null,
        posted_at: periodIndex < 5 ? new Date(dueDate).toISOString() : null,
        created_by: userId,
      });
      items.push(
        {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          payroll_entry_id: entryId,
          item_type: "SALARY_BASE",
          direction: "earning",
          description: "Salario base demo",
          amount: profile.base_salary,
          created_by: userId,
        },
        {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          payroll_entry_id: entryId,
          item_type: "COMMISSION",
          direction: "earning",
          description: "Comissao operacional demo",
          amount: Number((gross - profile.base_salary).toFixed(2)),
          created_by: userId,
        },
        {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          payroll_entry_id: entryId,
          item_type: "DISCOUNT",
          direction: "deduction",
          description: "Desconto demonstrativo",
          amount: deduction,
          created_by: userId,
        },
      );
      if (periodIndex < 5) {
        docs.push({
          id: docId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          direction: "payable",
          document_type: "payroll",
          source_type: "payroll",
          source_id: entryId,
          source_event: "posted",
          description: `Folha demo - ${profile.display_name}`,
          original_amount: net,
          competence_date: period.competence_month,
          issue_date: dueDate,
          currency: "BRL",
          status: "posted",
          chart_account_id: profile.default_chart_account_id,
          document_number: `FOLHA-DEMO-${period.competence_month.slice(0, 7)}-${profileIndex + 1}`,
          notes: "Folha ficticia para tenant demo.",
          created_by: userId,
          posted_by: userId,
          posted_at: new Date(dueDate).toISOString(),
        });
        installments.push({
          tenant_id: tenantId,
          workspace_id: workspaceId,
          document_id: docId,
          installment_number: 1,
          amount: net,
          due_date: dueDate,
          status: "open",
          settled_amount: 0,
        });
      }
    });
  });

  await insertRows(supabase, "financial_documents", docs);
  await insertRows(supabase, "payroll_entries", entries);
  await insertRows(supabase, "payroll_items", items);
  await insertRows(supabase, "financial_installments", installments);
  await insertRows(
    supabase,
    "financial_allocations",
    docs.map((doc) => ({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      document_id: doc.id,
      cost_center_id: finance.costCenters.get("OPERACAO")?.id,
      chart_account_id: finance.chart.get("5.03")?.id,
      amount: doc.original_amount,
      percentage: 100,
      description: doc.description,
    })),
  );

  return { employeeProfiles: profiles, payrollPeriods: periods, payrollEntries: entries };
}

async function countTable(supabase, table, tenantId) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Failed counting ${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  loadEnvFile(resolve(ROOT, ".env.local"));
  loadEnvFile(resolve(ROOT, "central-dias-main", ".env.local"));

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  if (!url.includes("ujssyufhyvxfpfkwxdux")) {
    throw new Error("Refusing to run: configured Supabase URL is not the expected project.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const demoUser = await ensureDemoUser(supabase);
  const { tenantId, workspaceId } = await ensureDemoTenant(supabase, demoUser);
  await ensureDemoAccess(supabase, tenantId, workspaceId, demoUser.id);
  await clearDemoData(supabase, tenantId);
  const fleet = await seedFleet(supabase, tenantId, workspaceId);
  const operations = await seedOperations(supabase, tenantId, workspaceId, fleet);
  const fuel = await seedFuel(supabase, tenantId, fleet);
  const finance = await ensureFinanceCatalog(supabase, tenantId, workspaceId, demoUser.id);
  const financial = await seedFinancial(supabase, tenantId, workspaceId, demoUser.id, fleet, finance);
  const payroll = await seedPayroll(supabase, tenantId, workspaceId, demoUser.id, fleet, finance);

  const counts = {};
  for (const table of [
    "drivers",
    "vehicles",
    "trailers",
    "freights",
    "freight_history",
    "fuel_records",
    "financial_documents",
    "financial_installments",
    "financial_settlements",
    "employee_financial_profiles",
    "payroll_entries",
  ]) {
    counts[table] = await countTable(supabase, table, tenantId);
  }

  console.info(
    JSON.stringify(
      {
        status: "ok",
        tenantSlug: DEMO_SLUG,
        tenantId,
        workspaceId,
        login: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        seeded: {
          fleet: {
            drivers: fleet.drivers.length,
            vehicles: fleet.vehicles.length,
            trailers: fleet.trailers.length,
          },
          kanban: {
            activeFreights: operations.activeFreights.length,
            completedFreightHistory: operations.freightHistory.length,
          },
          fuelRecords: fuel.length,
          financialDocuments: financial.documents.length,
          financialInstallments: financial.installments.length,
          financialSettlements: financial.settlements.length,
          employeeProfiles: payroll.employeeProfiles.length,
          payrollPeriods: payroll.payrollPeriods.length,
          payrollEntries: payroll.payrollEntries.length,
        },
        counts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
