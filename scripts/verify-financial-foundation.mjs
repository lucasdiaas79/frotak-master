import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
      }),
  );
}

const env = { ...readEnv(".env.local"), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) throw new Error("Supabase server environment is not configured");

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rows(table, columns = "*") {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

const [
  freights,
  history,
  vehicles,
  partners,
  partnerRoles,
  accounts,
  costCenters,
  documents,
  installments,
  allocations,
  journalEntries,
  journalLines,
  fuels,
] = await Promise.all([
  rows("freights", "id,lifecycle_status,source_kind,requires_review,review_reasons"),
  rows("freight_history", "freight_id"),
  rows("vehicles", "current_freight_id"),
  rows("business_partners", "id,requires_review"),
  rows("business_partner_roles", "id"),
  rows("chart_of_accounts", "id,tenant_id,dre_group"),
  rows("cost_centers", "id,tenant_id"),
  rows("financial_documents", "id"),
  rows("financial_installments", "id"),
  rows("financial_allocations", "id"),
  rows("journal_entries", "id"),
  rows("journal_lines", "id"),
  rows("fuel_records", "id"),
]);

const activeIds = new Set(vehicles.map((row) => row.current_freight_id).filter(Boolean));
const historyIds = new Set(history.map((row) => row.freight_id).filter(Boolean));
const canonicalIds = new Set(freights.map((row) => row.id));
const missingActive = [...activeIds].filter((id) => !canonicalIds.has(id));
const missingHistory = [...historyIds].filter((id) => !canonicalIds.has(id));
const dreGroups = new Set(accounts.map((row) => row.dre_group).filter(Boolean));

const report = {
  freights: {
    total: freights.length,
    active: freights.filter((row) => row.lifecycle_status === "active").length,
    historical: freights.filter((row) => row.source_kind === "freight_history").length,
    requiresReview: freights.filter((row) => row.requires_review).length,
    missingActiveUuids: missingActive.length,
    missingHistoricalUuids: missingHistory.length,
  },
  businessPartners: partners.length,
  businessPartnerRoles: partnerRoles.length,
  partnersForReview: partners.filter((row) => row.requires_review).length,
  chartOfAccounts: accounts.length,
  dreGroups: dreGroups.size,
  costCenters: costCenters.length,
  financialDocuments: documents.length,
  installments: installments.length,
  allocations: allocations.length,
  journalEntries: journalEntries.length,
  journalLines: journalLines.length,
  legacyFuelRecordsPendingReconciliation: fuels.length,
};

if (missingActive.length || missingHistory.length) {
  throw new Error(`Canonical freight UUID validation failed: ${JSON.stringify(report.freights)}`);
}
if (documents.length || installments.length || allocations.length || journalEntries.length) {
  throw new Error("Phase 1 generated financial facts unexpectedly");
}
if (dreGroups.size < 8) throw new Error("DRE groups are incomplete");

console.log(JSON.stringify(report, null, 2));

if (env.VERIFY_OWNER_EMAIL && env.VERIFY_OWNER_PASSWORD && env.VITE_SUPABASE_ANON_KEY) {
  const ownerClient = createClient(url, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: loginError } = await ownerClient.auth.signInWithPassword({
    email: env.VERIFY_OWNER_EMAIL,
    password: env.VERIFY_OWNER_PASSWORD,
  });
  if (loginError || !sessionData.user)
    throw new Error(`Owner login failed: ${loginError?.message}`);

  async function ownerRows(table, columns) {
    const { data, error } = await ownerClient.from(table).select(columns);
    if (error) throw new Error(`Owner RLS check ${table}: ${error.message}`);
    return data ?? [];
  }

  const [memberships, ownerFreights, ownerPartners, ownerAccounts, ownerCenters] =
    await Promise.all([
      ownerRows("workspace_memberships", "workspace_id,workspaces(tenant_id)"),
      ownerRows("freights", "tenant_id"),
      ownerRows("business_partners", "tenant_id"),
      ownerRows("chart_of_accounts", "tenant_id"),
      ownerRows("cost_centers", "tenant_id"),
    ]);
  const allowedTenantIds = new Set(
    memberships.map((row) => row.workspaces?.tenant_id).filter(Boolean),
  );
  const visibleTenantIds = new Set(
    [...ownerFreights, ...ownerPartners, ...ownerAccounts, ...ownerCenters].map(
      (row) => row.tenant_id,
    ),
  );
  const leakedTenantIds = [...visibleTenantIds].filter((id) => !allowedTenantIds.has(id));
  if (!allowedTenantIds.size || leakedTenantIds.length) {
    throw new Error(`Owner RLS isolation failed; leaked tenants: ${leakedTenantIds.length}`);
  }
  console.log(
    JSON.stringify(
      {
        ownerRls: "PASS",
        allowedTenants: allowedTenantIds.size,
        visibleTenants: visibleTenantIds.size,
        visibleFreights: ownerFreights.length,
      },
      null,
      2,
    ),
  );
  await ownerClient.auth.signOut();
}
