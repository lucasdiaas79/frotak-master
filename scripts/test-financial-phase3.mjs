import { randomUUID } from "node:crypto";
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
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

const env = { ...loadEnv(), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const ownerEmail = env.FINANCIAL_TEST_EMAIL;
const ownerPassword = env.FINANCIAL_TEST_PASSWORD;

if (!url || !serviceKey || !anonKey || !ownerEmail || !ownerPassword) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, FINANCIAL_TEST_EMAIL e FINANCIAL_TEST_PASSWORD são obrigatórios.",
  );
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const owner = createClient(url, anonKey, { auth: { persistSession: false } });
const ids = {
  freights: [],
  fuels: [],
  expenses: [],
  jobs: [],
  documents: [],
  partners: [],
};
const result = {};

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? [];
}

async function one(query, label) {
  const data = await rows(query, label);
  if (!data[0]) throw new Error(`${label}: registro não encontrado`);
  return data[0];
}

async function sourceDocuments(sourceType, sourceId) {
  return rows(
    admin
      .from("financial_documents")
      .select("*")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId),
    `documentos ${sourceType}`,
  );
}

async function rememberSource(sourceType, sourceId) {
  const jobs = await rows(
    admin
      .from("financial_integration_jobs")
      .select("id, financial_document_id")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId),
    `jobs ${sourceType}`,
  );
  ids.jobs.push(...jobs.map((job) => job.id));
  ids.documents.push(...jobs.map((job) => job.financial_document_id).filter(Boolean));
}

async function cleanup() {
  ids.documents = [...new Set(ids.documents)];
  ids.jobs = [...new Set(ids.jobs)];
  if (ids.jobs.length) {
    await admin.from("financial_integration_events").delete().in("job_id", ids.jobs);
  }
  if (ids.documents.length) {
    await admin.from("financial_audit_events").delete().in("financial_document_id", ids.documents);
    await admin.from("financial_installments").delete().in("document_id", ids.documents);
    await admin.from("financial_allocations").delete().in("document_id", ids.documents);
  }
  if (ids.jobs.length) await admin.from("financial_integration_jobs").delete().in("id", ids.jobs);
  if (ids.documents.length) await admin.from("financial_documents").delete().in("id", ids.documents);
  if (ids.expenses.length) await admin.from("freight_expenses").delete().in("id", ids.expenses);
  if (ids.fuels.length) await admin.from("fuel_records").delete().in("id", ids.fuels);
  if (ids.freights.length) await admin.from("freights").delete().in("id", ids.freights);
  if (ids.partners.length) await admin.from("business_partners").delete().in("id", ids.partners);
}

try {
  const { data: login, error: loginError } = await owner.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  if (loginError) throw loginError;
  const membership = await one(
    admin
      .from("workspace_memberships")
      .select("workspace_id, workspaces!inner(tenant_id)")
      .eq("user_id", login.user.id)
      .eq("status", "active")
      .order("is_owner", { ascending: false })
      .limit(1),
    "membership owner",
  );
  const workspaceId = membership.workspace_id;
  const tenantId = membership.workspaces.tenant_id;
  const vehicle = await one(
    admin.from("vehicles").select("id, plate").eq("tenant_id", tenantId).limit(1),
    "veículo",
  );
  const otherWorkspace = await one(
    admin
      .from("workspaces")
      .select("id, tenant_id")
      .neq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(1),
    "workspace de outro tenant",
  );
  const completedId = randomUUID();
  ids.freights.push(completedId);
  await rows(
    admin.from("freights").insert({
      id: completedId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      vehicle_id: vehicle.id,
      freight_value: 1234.56,
      lifecycle_status: "completed",
      source_kind: "native",
      completed_at: new Date().toISOString(),
    }),
    "inserir frete concluído",
  );
  let documents = await sourceDocuments("freight", completedId);
  result.freightToReceivable = documents.length === 1 && documents[0].direction === "receivable";
  await admin.from("freights").update({ freight_value: 1234.56 }).eq("id", completedId);
  documents = await sourceDocuments("freight", completedId);
  result.freightIdempotency = documents.length === 1;
  await rememberSource("freight", completedId);

  const noValueId = randomUUID();
  ids.freights.push(noValueId);
  await rows(
    admin.from("freights").insert({
      id: noValueId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      vehicle_id: vehicle.id,
      lifecycle_status: "completed",
      source_kind: "native",
      completed_at: new Date().toISOString(),
    }),
    "inserir frete sem valor",
  );
  const noValueJob = await one(
    admin
      .from("financial_integration_jobs")
      .select("*")
      .eq("source_type", "freight")
      .eq("source_id", noValueId),
    "job sem valor",
  );
  result.missingValueNeedsReview =
    noValueJob.status === "needs_review" &&
    noValueJob.review_reasons.includes("missing_freight_value") &&
    (await sourceDocuments("freight", noValueId)).length === 0;
  await rememberSource("freight", noValueId);

  const fuelId = randomUUID();
  ids.fuels.push(fuelId);
  await rows(
    admin.from("fuel_records").insert({
      id: fuelId,
      tenant_id: tenantId,
      vehicle_id: vehicle.id,
      vehicle_plate: vehicle.plate,
      station: `POSTO TESTE FASE 3 ${fuelId.slice(0, 8)}`,
      fuel_type: "diesel_s10",
      liters: 100,
      amount: 550,
      odometer: 1000,
    }),
    "inserir abastecimento",
  );
  const fuelDocsBefore = await sourceDocuments("fuel_record", fuelId);
  if (fuelDocsBefore[0]?.partner_id) ids.partners.push(fuelDocsBefore[0].partner_id);
  result.fuelToExpense =
    fuelDocsBefore.length === 1 && fuelDocsBefore[0].direction === "payable";
  const fuelAllocationBefore = await one(
    admin
      .from("financial_allocations")
      .select("*")
      .eq("document_id", fuelDocsBefore[0].id),
    "alocação de combustível",
  );
  result.fuelWithoutFreightVehicleAllocation =
    fuelAllocationBefore.vehicle_id === vehicle.id && fuelAllocationBefore.freight_id === null;

  const linkedExpenseId = randomUUID();
  ids.expenses.push(linkedExpenseId);
  await rows(
    admin.from("freight_expenses").insert({
      id: linkedExpenseId,
      tenant_id: tenantId,
      freight_id: completedId,
      vehicle_id: vehicle.id,
      fuel_record_id: fuelId,
      category: "diesel_s10",
      description: "Combustível teste Fase 3",
      amount: 550,
      source: "system",
    }),
    "inserir despesa ligada ao combustível",
  );
  const fuelDocsAfter = await sourceDocuments("fuel_record", fuelId);
  const linkedExpenseDocs = await sourceDocuments("freight_expense", linkedExpenseId);
  const fuelAllocationAfter = await one(
    admin
      .from("financial_allocations")
      .select("*")
      .eq("document_id", fuelDocsAfter[0].id),
    "alocação ligada ao frete",
  );
  result.fuelFreightAllocation = fuelAllocationAfter.freight_id === completedId;
  result.linkedExpenseNoDuplicate =
    fuelDocsAfter.length === 1 && linkedExpenseDocs.length === 0;
  await rememberSource("fuel_record", fuelId);
  await rememberSource("freight_expense", linkedExpenseId);

  const commonExpenseId = randomUUID();
  ids.expenses.push(commonExpenseId);
  await rows(
    admin.from("freight_expenses").insert({
      id: commonExpenseId,
      tenant_id: tenantId,
      freight_id: completedId,
      vehicle_id: vehicle.id,
      category: "pedagio",
      description: "Pedágio teste Fase 3",
      amount: 42.5,
      source: "system",
    }),
    "inserir despesa comum",
  );
  const commonDocs = await sourceDocuments("freight_expense", commonExpenseId);
  result.commonExpense = commonDocs.length === 1 && commonDocs[0].direction === "payable";
  await rememberSource("freight_expense", commonExpenseId);

  const retryId = randomUUID();
  ids.freights.push(retryId);
  await rows(
    admin.from("freights").insert({
      id: retryId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      vehicle_id: vehicle.id,
      lifecycle_status: "completed",
      source_kind: "native",
      completed_at: new Date().toISOString(),
    }),
    "inserir frete para retry",
  );
  await admin.from("freights").update({ freight_value: 780 }).eq("id", retryId);
  const retryDocs = await sourceDocuments("freight", retryId);
  result.retry = retryDocs.length === 1;
  await rememberSource("freight", retryId);

  const failureId = randomUUID();
  ids.freights.push(failureId);
  await rows(
    admin.from("freights").insert({
      id: failureId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      vehicle_id: vehicle.id,
      freight_value: 900,
      lifecycle_status: "active",
      source_kind: "native",
    }),
    "inserir operação válida para falha financeira",
  );
  await rows(
    admin.from("financial_integration_jobs").insert({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      source_type: "freight",
      source_id: failureId,
      source_event: "completion_revenue",
    }),
    "enfileirar falha financeira controlada",
  );
  const failureJobBefore = await one(
    admin
      .from("financial_integration_jobs")
      .select("id")
      .eq("source_type", "freight")
      .eq("source_id", failureId),
    "job para falha controlada",
  );
  await owner.rpc("process_financial_integrations", {
    p_limit: 1,
    p_job_id: failureJobBefore.id,
  });
  const failureFreight = await one(
    admin.from("freights").select("id").eq("id", failureId),
    "operação preservada",
  );
  const failureJob = await one(
    admin
      .from("financial_integration_jobs")
      .select("status")
      .eq("source_type", "freight")
      .eq("source_id", failureId),
    "job com falha",
  );
  result.financialFailureDoesNotBlockOperation =
    failureFreight.id === failureId && failureJob.status === "failed";
  await rememberSource("freight", failureId);

  const otherFreightId = randomUUID();
  ids.freights.push(otherFreightId);
  await rows(
    admin.from("freights").insert({
      id: otherFreightId,
      tenant_id: otherWorkspace.tenant_id,
      workspace_id: otherWorkspace.id,
      freight_value: 100,
      lifecycle_status: "completed",
      source_kind: "native",
      completed_at: new Date().toISOString(),
    }),
    "inserir fato de outro tenant",
  );
  const otherJob = await one(
    admin
      .from("financial_integration_jobs")
      .select("id")
      .eq("source_type", "freight")
      .eq("source_id", otherFreightId),
    "job de outro tenant",
  );
  const ownerVisibility = await rows(
    owner.from("financial_integration_jobs").select("id").eq("id", otherJob.id),
    "RLS entre tenants",
  );
  result.tenantIsolation = ownerVisibility.length === 0;
  await rememberSource("freight", otherFreightId);

  const allPass = Object.values(result).every(Boolean);
  console.log(JSON.stringify({ ...result, allPass }, null, 2));
  if (!allPass) process.exitCode = 1;
} finally {
  await cleanup();
  await owner.auth.signOut();
}
