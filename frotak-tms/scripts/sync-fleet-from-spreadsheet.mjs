import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const source = JSON.parse(
  fs.readFileSync(".output/fleet-import.json", "utf8").replace(/^\uFEFF/, ""),
);

const clean = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
const plate = (value) =>
  clean(value)
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
const intValue = (value) => {
  const digits = clean(value).replace(/\D/g, "");
  return digits ? Number(digits) : null;
};

async function assertOk(label, result) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function fetchAll(table, select, order) {
  return assertOk(`select ${table}`, await supabase.from(table).select(select).order(order));
}

const desiredPlates = new Set(
  source.cavalos.map((vehicle) => plate(vehicle.plate)).filter(Boolean),
);
const desiredDriverNames = new Set(
  source.motoristas.map((driver) => clean(driver.name).toUpperCase()).filter(Boolean),
);

const [vehiclesBefore, driversBefore] = await Promise.all([
  fetchAll("vehicles", "id,plate,driver_id", "plate"),
  fetchAll("drivers", "id,name,vehicle_id", "name"),
]);

const extraVehicleIds = vehiclesBefore
  .filter((vehicle) => !desiredPlates.has(plate(vehicle.plate)))
  .map((vehicle) => vehicle.id);
const extraDriverIds = driversBefore
  .filter((driver) => !desiredDriverNames.has(clean(driver.name).toUpperCase()))
  .map((driver) => driver.id);

if (extraVehicleIds.length > 0) {
  await assertOk(
    "delete extra vehicles",
    await supabase.from("vehicles").delete().in("id", extraVehicleIds).select("id"),
  );
}

if (extraDriverIds.length > 0) {
  await assertOk(
    "delete extra drivers",
    await supabase.from("drivers").delete().in("id", extraDriverIds).select("id"),
  );
}

for (const vehicle of source.cavalos) {
  const vehiclePlate = plate(vehicle.plate);
  if (!vehiclePlate) continue;

  await assertOk(
    `sync vehicle ${vehiclePlate}`,
    await supabase
      .from("vehicles")
      .update({
        plate: vehiclePlate,
        type: clean(vehicle.tipo) || "CAVALO TRATOR",
        fleet_seq: intValue(vehicle.seq),
        fleet_kind: clean(vehicle.tipo) || "CAVALO TRATOR",
        brand: clean(vehicle.marca) || null,
        model: clean(vehicle.modelo) || null,
        manufacture_year: intValue(vehicle.ano),
        renavam: clean(vehicle.renavam) || null,
      })
      .eq("plate", vehiclePlate)
      .select("id"),
  );
}

for (const driver of source.motoristas) {
  const driverName = clean(driver.name).toUpperCase();
  if (!driverName) continue;

  await assertOk(
    `sync driver ${driverName}`,
    await supabase
      .from("drivers")
      .update({
        name: driverName,
        phone: clean(driver.phone) || null,
        active: true,
        fleet_seq: intValue(driver.seq),
        partner_role: clean(driver.role) || "Motorista",
      })
      .eq("name", driverName)
      .select("id"),
  );
}

const [vehiclesAfter, driversAfter] = await Promise.all([
  fetchAll("vehicles", "id,plate", "plate"),
  fetchAll("drivers", "id,name", "name"),
]);

const missingVehicles = [...desiredPlates].filter(
  (wantedPlate) => !vehiclesAfter.some((vehicle) => plate(vehicle.plate) === wantedPlate),
);
const missingDrivers = [...desiredDriverNames].filter(
  (wantedName) => !driversAfter.some((driver) => clean(driver.name).toUpperCase() === wantedName),
);

if (missingVehicles.length > 0 || missingDrivers.length > 0) {
  throw new Error(
    `Sync incomplete. Missing vehicles: ${missingVehicles.join(", ") || "-"}; missing drivers: ${
      missingDrivers.join(", ") || "-"
    }`,
  );
}

console.log(
  JSON.stringify(
    {
      spreadsheet: { vehicles: desiredPlates.size, drivers: desiredDriverNames.size },
      database: { vehicles: vehiclesAfter.length, drivers: driversAfter.length },
      removed: { vehicles: extraVehicleIds.length, drivers: extraDriverIds.length },
    },
    null,
    2,
  ),
);
