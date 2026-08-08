import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const CENTRAL_SLUG = "central-transportes";
const DEFAULT_OWNER_EMAIL = "samuel@casadamoeda.com.br";
const CLIENT_URL = "https://central-dias.vercel.app";

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
    // Optional in CI when env vars are already configured.
  }
}

function normalizePlate(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function readMigration(name) {
  return readFileSync(resolve(ROOT, "central-dias-main", "supabase", "migrations", name), "utf8");
}

function extractValuesBlock(sql, marker) {
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`Nao encontrei bloco: ${marker}`);
  const valuesStart = sql.indexOf(" values", start);
  if (valuesStart === -1) throw new Error(`Nao encontrei VALUES em: ${marker}`);
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

  throw new Error(`Bloco VALUES sem fim: ${marker}`);
}

function extractCteValuesBlock(sql, marker, nextInsert) {
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`Nao encontrei bloco: ${marker}`);
  const valuesStart = sql.indexOf(" values", start);
  if (valuesStart === -1) throw new Error(`Nao encontrei VALUES em: ${marker}`);
  const nextInsertStart = sql.indexOf(nextInsert, valuesStart);
  if (nextInsertStart === -1) throw new Error(`Nao encontrei fim do CTE: ${nextInsert}`);
  let block = sql.slice(valuesStart + " values".length, nextInsertStart).trim();
  block = block.replace(/\)\s*$/s, "").trim();
  return block;
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

function distinctBy(items, keyFn, preferLast = false) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (preferLast || !map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

async function upsertAuthOwner(supabase, ownerEmail) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === ownerEmail);
    if (found) return { user: found, created: false };
    if (data.users.length < 1000) break;
  }

  const password = process.env.CENTRAL_OWNER_PASSWORD;
  if (!password) {
    throw new Error(
      `Usuario ${ownerEmail} nao existe. Defina CENTRAL_OWNER_PASSWORD para cria-lo com senha temporaria.`,
    );
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Administrador Central Transportes",
      must_change_password: true,
    },
  });
  if (error || !data.user) throw error ?? new Error("Falha ao criar usuario da Central.");
  return { user: data.user, created: true };
}

async function ensureCentralTenant(supabase) {
  const { data: existingTenant, error: existingError } = await supabase
    .from("tenants")
    .select("id, slug, settings, workspaces(id)")
    .eq("slug", CENTRAL_SLUG)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existingTenant?.id) {
    await supabase
      .from("tenants")
      .update({
        trade_name: "Central Transportes",
        settings: {
          ...(existingTenant.settings ?? {}),
          clientUrl: CLIENT_URL,
          subscriptionPeriod: "Mensal",
          maxVehicles: 95,
        },
      })
      .eq("id", existingTenant.id);
    return existingTenant.id;
  }

  const ownerEmail = (process.env.CENTRAL_OWNER_EMAIL || DEFAULT_OWNER_EMAIL).trim().toLowerCase();
  const { user: ownerUser } = await upsertAuthOwner(supabase, ownerEmail);

  const { data: ownerProfile, error: ownerProfileError } = await supabase
    .from("profiles")
    .upsert({
      id: ownerUser.id,
      full_name: ownerUser.user_metadata?.full_name || "Administrador Central Transportes",
      email: ownerEmail,
      active: true,
    })
    .select("id")
    .single();
  if (ownerProfileError || !ownerProfile) throw ownerProfileError ?? new Error("Perfil nao criado.");

  const { data: actor, error: actorError } = await supabase
    .from("platform_users")
    .select("user_id, profiles!inner(email)")
    .eq("active", true)
    .in("platform_role", ["super_admin", "operations"])
    .limit(1)
    .maybeSingle();
  if (actorError) throw actorError;
  if (!actor?.user_id) throw new Error("Nenhum usuario master super_admin/operations encontrado.");

  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 1);

  const { data, error } = await supabase.rpc("provision_tenant", {
    p_owner_user_id: ownerUser.id,
    p_owner_full_name: "Administrador Central Transportes",
    p_legal_name: "Central Transportes e Servicos",
    p_trade_name: "Central Transportes",
    p_cnpj: null,
    p_tenant_slug: CENTRAL_SLUG,
    p_workspace_name: "Central Transportes",
    p_workspace_slug: CENTRAL_SLUG,
    p_plan_code: "BASIC",
    p_starts_at: now.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_subscription_period: "Mensal",
    p_max_vehicles: 95,
    p_enabled_module_codes: ["fleet_core", "frotak_tracking"],
    p_actor_user_id: actor.user_id,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id) throw new Error("Provisionamento da Central nao retornou tenant_id.");

  const { error: settingsError } = await supabase
    .from("tenants")
    .update({
      settings: {
        clientUrl: CLIENT_URL,
        subscriptionPeriod: "Mensal",
        maxVehicles: 95,
      },
    })
    .eq("id", row.tenant_id);
  if (settingsError) throw settingsError;

  return row.tenant_id;
}

async function clearCentralOperationalData(supabase, tenantId) {
  const tables = [
    "manual_workflow_overrides",
    "freight_documents",
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

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId);
    if (error) throw new Error(`Falha limpando ${table}: ${error.message}`);
  }
}

async function insertAndMap(supabase, table, rows, keyField) {
  if (rows.length === 0) return new Map();
  const { data, error } = await supabase.from(table).insert(rows).select("*");
  if (error) throw new Error(`Falha inserindo ${table}: ${error.message}`);
  return new Map((data ?? []).map((row) => [keyField(row), row]));
}

async function importCentralData(supabase, tenantId) {
  const fleetSql = readMigration("202606100002_reset_fleet_from_spreadsheet.sql");
  const trailersSql = readMigration("202606150001_refresh_trailers_from_final_fleet_sheet.sql");
  const vehicleMetaSql = readMigration("202606150004_refresh_vehicle_metadata_from_final_fleet_sheet.sql");
  const phonesSql = readMigration("202606150005_refresh_driver_phones_from_final_fleet_sheet.sql");
  const clientsSql = readMigration("202606160002_refresh_clients_from_sheet.sql");
  const catalogSql = readMigration("202606080001_refresh_commercial_catalogs.sql");

  const assignments = parseSqlValues(
    extractValuesBlock(fleetSql, "insert into official_fleet_assignments"),
  ).map(([rowNum, driverName, vehiclePlate, trailerText]) => ({
    rowNum,
    driverName,
    vehiclePlate,
    trailerText: trailerText || "",
    normalizedPlate: normalizePlate(vehiclePlate),
    isObservation: String(driverName).toUpperCase().startsWith("OBS:"),
  }));

  const chosenVehicles = distinctBy(
    assignments.filter((item) => item.normalizedPlate),
    (item) => item.normalizedPlate,
    true,
  );

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

  const driverRows = distinctBy(
    assignments.filter((item) => item.driverName && !item.isObservation),
    (item) => String(item.driverName).toUpperCase(),
  ).map((item) => {
    const phone = phoneMetadata.get(String(item.driverName).toUpperCase());
    return {
      tenant_id: tenantId,
      name: item.driverName,
      phone: phone?.phone ?? null,
      cnh: null,
      fleet_seq: phone?.fleetSeq ?? null,
      partner_role: "Motorista",
      active: true,
    };
  });

  const vehicleRows = chosenVehicles.map((item) => {
    const meta = vehicleMetadata.get(item.normalizedPlate);
    return {
      tenant_id: tenantId,
      plate: String(item.vehiclePlate).trim().toUpperCase(),
      type: "CAVALO TRATOR",
      fleet_kind: "CAVALO TRATOR",
      fleet_seq: meta?.fleetSeq ?? null,
      brand: meta?.brand ?? null,
      model: meta?.model ?? null,
      manufacture_year: meta?.manufactureYear ?? null,
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

  const trailerCatalogRows = parseSqlValues(
    extractValuesBlock(trailersSql, "insert into official_trailers_catalog"),
  ).map(
    ([
      fleetSeq,
      type,
      fleetKind,
      brand,
      model,
      manufactureYear,
      identifier,
      renavam,
      implementType,
      implementModel,
    ]) => ({
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
  const catalogTrailerIds = new Set(trailerCatalogRows.map((row) => row.identifier));
  for (const identifier of assignmentTrailerIds) {
    if (!catalogTrailerIds.has(identifier)) {
      trailerCatalogRows.push({
        tenant_id: tenantId,
        identifier,
        type: "IMPLEMENTO",
        fleet_kind: "IMPLEMENTO",
        brand: null,
        model: null,
        manufacture_year: null,
        renavam: null,
        implement_type: "BASCULANTE",
        implement_model: "CACAMBA",
      });
    }
  }

  const sourceClientsRows = parseSqlValues(
    extractCteValuesBlock(
      clientsSql,
      "with source_clients (name, city, state) as",
      "insert into public.senders",
    ),
  ).map(([name, city, state]) => ({
    tenant_id: tenantId,
    name,
    cnpj: null,
    city,
    state,
    active: true,
  }));

  const productRows = parseSqlValues(
    extractValuesBlock(catalogSql, "insert into public.products"),
  ).map(([name, active]) => ({
    tenant_id: tenantId,
    name,
    active,
  }));

  await clearCentralOperationalData(supabase, tenantId);

  const driversByName = await insertAndMap(
    supabase,
    "drivers",
    driverRows,
    (row) => String(row.name).toUpperCase(),
  );
  const vehiclesByPlate = await insertAndMap(
    supabase,
    "vehicles",
    vehicleRows,
    (row) => normalizePlate(row.plate),
  );
  const trailersByIdentifier = await insertAndMap(
    supabase,
    "trailers",
    trailerCatalogRows,
    (row) => normalizePlate(row.identifier),
  );
  await insertAndMap(supabase, "senders", sourceClientsRows, (row) => row.id);
  await insertAndMap(supabase, "recipients", sourceClientsRows, (row) => row.id);
  await insertAndMap(supabase, "products", productRows, (row) => row.id);

  const vehicleUpdates = [];
  const driverUpdates = [];
  const trailerUpdates = [];
  const vehicleTrailerRows = [];
  const fleetEventRows = [];

  for (const item of chosenVehicles) {
    const vehicle = vehiclesByPlate.get(item.normalizedPlate);
    if (!vehicle) continue;
    const driver = item.isObservation ? null : driversByName.get(String(item.driverName).toUpperCase());
    const matches = String(item.trailerText).match(/[A-Z]{3}-?[0-9A-Z]{4}/gi) ?? [];
    const trailerIds = matches
      .map((match) => trailersByIdentifier.get(normalizePlate(match)))
      .filter(Boolean);
    const firstTrailer = trailerIds[0] ?? null;

    vehicleUpdates.push({
      id: vehicle.id,
      tenant_id: tenantId,
      driver_id: driver?.id ?? null,
      trailer_id: firstTrailer?.id ?? null,
    });

    if (driver?.id) {
      driverUpdates.push({ id: driver.id, tenant_id: tenantId, vehicle_id: vehicle.id });
    }

    trailerIds.forEach((trailer, index) => {
      trailerUpdates.push({ id: trailer.id, tenant_id: tenantId, vehicle_id: vehicle.id });
      vehicleTrailerRows.push({
        tenant_id: tenantId,
        vehicle_id: vehicle.id,
        trailer_id: trailer.id,
        position: index + 1,
        active: true,
      });
    });

    fleetEventRows.push({
      tenant_id: tenantId,
      vehicle_id: vehicle.id,
      status: vehicle.status,
      freight_stage: vehicle.freight_stage,
      city: vehicle.city,
      state: vehicle.state,
      source: "Sistema",
      description: "Cadastro de frota importado da base historica da Central",
      event_type: "cadastro_frota_importado",
      action_origin: "seed",
      metadata: {
        source: "central-dias-main/supabase/migrations",
        spreadsheetRow: item.rowNum,
        driverName: item.driverName,
        trailerText: item.trailerText,
      },
    });
  }

  for (const update of vehicleUpdates) {
    const { error } = await supabase
      .from("vehicles")
      .update({ driver_id: update.driver_id, trailer_id: update.trailer_id })
      .eq("id", update.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
  }

  for (const update of driverUpdates) {
    const { error } = await supabase
      .from("drivers")
      .update({ vehicle_id: update.vehicle_id })
      .eq("id", update.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
  }

  for (const update of trailerUpdates) {
    const { error } = await supabase
      .from("trailers")
      .update({ vehicle_id: update.vehicle_id })
      .eq("id", update.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
  }

  if (vehicleTrailerRows.length) {
    const { error } = await supabase.from("vehicle_trailers").insert(vehicleTrailerRows);
    if (error) throw error;
  }

  if (fleetEventRows.length) {
    const { error } = await supabase.from("fleet_events").insert(fleetEventRows);
    if (error) throw error;
  }

  return {
    drivers: driverRows.length,
    vehicles: vehicleRows.length,
    trailers: trailerCatalogRows.length,
    senders: sourceClientsRows.length,
    recipients: sourceClientsRows.length,
    products: productRows.length,
    vehicleLinks: vehicleTrailerRows.length,
    events: fleetEventRows.length,
  };
}

async function main() {
  loadEnvFile(resolve(ROOT, ".env.local"));
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  }
  if (!url.includes("ujssyufhyvxfpfkwxdux")) {
    throw new Error("Interrompido: a URL carregada nao aponta para o Supabase novo xdux.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const tenantId = await ensureCentralTenant(supabase);
  const counts = await importCentralData(supabase, tenantId);

  console.info(
    JSON.stringify(
      {
        status: "ok",
        tenantSlug: CENTRAL_SLUG,
        tenantId: `${tenantId.slice(0, 4)}...${tenantId.slice(-4)}`,
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
