import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env.local") {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^[\'"]|[\'"]$/g, ""),
        ];
      }),
  );
}

const env = { ...loadEnv(), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase server environment is required.");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const tables = [
  "freights",
  "freight_history",
  "freight_expenses",
  "fuel_records",
  "freight_documents",
  "financial_documents",
  "financial_installments",
  "financial_allocations",
  "financial_settlements",
  "journal_entries",
  "journal_lines",
  "financial_integration_jobs",
  "financial_integration_events",
  "financial_audit_events",
];

const counts = {};
for (const table of tables) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  counts[table] = count ?? 0;
}

const { count: activeVehicleFreights, error: vehicleError } = await supabase
  .from("vehicles")
  .select("*", { count: "exact", head: true })
  .not("current_freight_id", "is", null);
if (vehicleError) throw vehicleError;

const { count: reviewJobs, error: reviewError } = await supabase
  .from("financial_integration_jobs")
  .select("*", { count: "exact", head: true })
  .eq("status", "needs_review");
if (reviewError) throw reviewError;

const [
  { count: senders },
  { count: senderLinks },
  { count: recipients },
  { count: recipientLinks },
] = await Promise.all([
  supabase.from("senders").select("*", { count: "exact", head: true }),
  supabase
    .from("legacy_partner_links")
    .select("*", { count: "exact", head: true })
    .eq("legacy_table", "senders"),
  supabase.from("recipients").select("*", { count: "exact", head: true }),
  supabase
    .from("legacy_partner_links")
    .select("*", { count: "exact", head: true })
    .eq("legacy_table", "recipients"),
]);

console.log(
  JSON.stringify(
    {
      ...counts,
      needs_review: reviewJobs ?? 0,
      vehicles_with_active_freight: activeVehicleFreights ?? 0,
      senders: senders ?? 0,
      sender_partner_links: senderLinks ?? 0,
      recipients: recipients ?? 0,
      recipient_partner_links: recipientLinks ?? 0,
    },
    null,
    2,
  ),
);
