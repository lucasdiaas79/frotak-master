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

for (const vehicle of source.cavalos) {
  const vehiclePlate = plate(vehicle.plate);
  if (!vehiclePlate) continue;

  await assertOk(
    `update vehicle ${vehiclePlate}`,
    await supabase
      .from("vehicles")
      .update({
        type: clean(vehicle.tipo) || "CAVALO TRATOR",
        fleet_seq: intValue(vehicle.seq),
        fleet_kind: clean(vehicle.tipo) || null,
        brand: clean(vehicle.marca) || null,
        model: clean(vehicle.modelo) || null,
        manufacture_year: intValue(vehicle.ano),
        renavam: clean(vehicle.renavam) || null,
      })
      .eq("plate", vehiclePlate)
      .select("id"),
  );
}

for (const trailer of source.carretas) {
  const identifier = plate(trailer.plate);
  if (!identifier) continue;

  await assertOk(
    `update trailer ${identifier}`,
    await supabase
      .from("trailers")
      .update({
        type: clean(trailer.tipo) || "IMPLEMENTO",
        fleet_seq: intValue(trailer.seq),
        fleet_kind: clean(trailer.tipo) || null,
        brand: clean(trailer.marca) || null,
        model: clean(trailer.modelo) || null,
        manufacture_year: intValue(trailer.ano),
        renavam: clean(trailer.renavam) || null,
        implement_type: clean(trailer.implementType ?? trailer.tipoImplemento) || null,
        implement_model: clean(trailer.implementModel ?? trailer.modeloImplemento) || null,
      })
      .eq("identifier", identifier)
      .select("id"),
  );
}

for (const driver of source.motoristas) {
  const name = clean(driver.name).toUpperCase();
  if (!name) continue;

  await assertOk(
    `update driver ${name}`,
    await supabase
      .from("drivers")
      .update({
        fleet_seq: intValue(driver.seq),
        partner_role: clean(driver.role) || null,
      })
      .eq("name", name)
      .select("id"),
  );
}

console.log("Spreadsheet metadata imported.");
