import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  if (!existsSync(path)) return {};
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

const env = {
  ...loadEnv(".env.local"),
  ...loadEnv("central-dias-main/.env.local"),
  ...process.env,
};
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const ownerEmail = env.FINANCIAL_TEST_EMAIL || "admin@central.com.br";
const ownerPassword = env.FINANCIAL_TEST_PASSWORD || "central123";

if (!url || !serviceKey || !anonKey) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY sao obrigatorios.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const owner = createClient(url, anonKey, { auth: { persistSession: false } });
const ids = {
  freights: [],
  jobs: [],
  documents: [],
  fuels: [],
  partners: [],
  vehicles: [],
};
const restore = {
  settings: null,
  partners: new Map(),
};
const result = {};
const completedAt = "2026-09-03T12:00:00Z";

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? [];
}

async function one(query, label) {
  const data = await rows(query, label);
  if (!data[0]) throw new Error(`${label}: registro nao encontrado`);
  return data[0];
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

async function documentsFor(sourceType, sourceId) {
  return rows(
    admin
      .from("financial_documents")
      .select("*, financial_installments!financial_installments_document_id_fkey(*)")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId),
    `documentos ${sourceType}`,
  );
}

async function insertCompletedFreight({
  tenantId,
  workspaceId,
  vehicleId,
  senderId,
  recipientId,
  productId,
  partnerId,
  paymentType,
  paymentTermDays,
  amount,
}) {
  const id = randomUUID();
  ids.freights.push(id);
  await rows(
    admin.from("freights").insert({
      id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      vehicle_id: vehicleId,
      sender_id: senderId,
      recipient_id: recipientId,
      product_id: productId,
      freight_value: amount,
      freight_payment_type: paymentType,
      billing_partner_id: partnerId,
      payment_term_days: paymentTermDays,
      lifecycle_status: "completed",
      source_kind: "native",
      completed_at: completedAt,
    }),
    "inserir frete concluido",
  );
  await rememberSource("freight", id);
  return id;
}

async function dueDateForFreight(freightId) {
  const docs = await documentsFor("freight", freightId);
  if (!docs[0]) return null;
  return docs[0].financial_installments?.[0]?.due_date ?? null;
}

async function cleanup() {
  ids.documents = [...new Set(ids.documents)];
  ids.jobs = [...new Set(ids.jobs)];
  if (ids.jobs.length)
    await admin.from("financial_integration_events").delete().in("job_id", ids.jobs);
  if (ids.documents.length) {
    await admin.from("financial_audit_events").delete().in("financial_document_id", ids.documents);
    await admin.from("financial_settlements").delete().in("document_id", ids.documents);
    await admin.from("financial_installments").delete().in("document_id", ids.documents);
    await admin.from("financial_allocations").delete().in("document_id", ids.documents);
  }
  if (ids.jobs.length) await admin.from("financial_integration_jobs").delete().in("id", ids.jobs);
  if (ids.documents.length)
    await admin.from("financial_documents").delete().in("id", ids.documents);
  if (ids.fuels.length) await admin.from("fuel_records").delete().in("id", ids.fuels);
  if (ids.freights.length) await admin.from("freights").delete().in("id", ids.freights);
  if (ids.vehicles.length) {
    await admin
      .from("vehicles")
      .update({
        current_freight_id: null,
        sender_id: null,
        recipient_id: null,
        product_id: null,
        freight_value: null,
        status: "disponivel-patio",
        vehicle_situation: "disponivel-patio",
        freight_stage: "DISPONIVEL",
      })
      .in("id", [...new Set(ids.vehicles)]);
  }
  for (const [partnerId, values] of restore.partners) {
    await admin.from("business_partners").update(values).eq("id", partnerId);
  }
  if (restore.settings) {
    await admin
      .from("financial_integration_settings")
      .update(restore.settings.values)
      .eq("workspace_id", restore.settings.workspaceId);
  }
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
  const [sender, recipient, product, vehicle] = await Promise.all([
    one(
      admin.from("senders").select("id").eq("tenant_id", tenantId).eq("active", true).limit(1),
      "sender",
    ),
    one(
      admin.from("recipients").select("id").eq("tenant_id", tenantId).eq("active", true).limit(1),
      "recipient",
    ),
    one(
      admin.from("products").select("id").eq("tenant_id", tenantId).eq("active", true).limit(1),
      "product",
    ),
    one(
      admin
        .from("vehicles")
        .select("id, driver_id, trailer_id, plate")
        .eq("tenant_id", tenantId)
        .not("driver_id", "is", null)
        .limit(1),
      "vehicle",
    ),
  ]);

  const links = await rows(
    admin
      .from("legacy_partner_links")
      .select("legacy_table, legacy_id, partner_id")
      .eq("tenant_id", tenantId)
      .in("legacy_id", [sender.id, recipient.id]),
    "legacy links",
  );
  const senderPartnerId = links.find((item) => item.legacy_table === "senders")?.partner_id;
  const recipientPartnerId = links.find((item) => item.legacy_table === "recipients")?.partner_id;
  if (!senderPartnerId || !recipientPartnerId)
    throw new Error("mapeamento financeiro CIF/FOB ausente");

  const partnersToRestore = await rows(
    admin
      .from("business_partners")
      .select("id, default_receivable_due_days, default_payable_due_days")
      .in("id", [senderPartnerId, recipientPartnerId]),
    "partners restore",
  );
  for (const partner of partnersToRestore) {
    restore.partners.set(partner.id, {
      default_receivable_due_days: partner.default_receivable_due_days,
      default_payable_due_days: partner.default_payable_due_days,
    });
  }
  const existingSettings = await rows(
    admin
      .from("financial_integration_settings")
      .select("workspace_id, default_receivable_due_days, default_payable_due_days")
      .eq("workspace_id", workspaceId)
      .limit(1),
    "settings restore",
  );
  if (existingSettings[0]) {
    restore.settings = {
      workspaceId,
      values: {
        default_receivable_due_days: existingSettings[0].default_receivable_due_days,
        default_payable_due_days: existingSettings[0].default_payable_due_days,
      },
    };
  }

  await admin
    .from("business_partners")
    .update({ default_receivable_due_days: 30, default_payable_due_days: null })
    .eq("id", senderPartnerId);
  await admin
    .from("business_partners")
    .update({ default_receivable_due_days: 45, default_payable_due_days: null })
    .eq("id", recipientPartnerId);
  await admin.from("financial_integration_settings").upsert({
    tenant_id: tenantId,
    workspace_id: workspaceId,
    default_receivable_due_days: null,
    default_payable_due_days: 14,
    active: true,
  });

  const partnerCif = await insertCompletedFreight({
    tenantId,
    workspaceId,
    vehicleId: vehicle.id,
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    partnerId: senderPartnerId,
    paymentType: "CIF",
    paymentTermDays: null,
    amount: 1010,
  });
  result.partnerCifDue = (await dueDateForFreight(partnerCif)) === "2026-10-03";

  const partnerFob = await insertCompletedFreight({
    tenantId,
    workspaceId,
    vehicleId: vehicle.id,
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    partnerId: recipientPartnerId,
    paymentType: "FOB",
    paymentTermDays: null,
    amount: 2020,
  });
  result.partnerFobDue = (await dueDateForFreight(partnerFob)) === "2026-10-18";

  const overrideFreight = await insertCompletedFreight({
    tenantId,
    workspaceId,
    vehicleId: vehicle.id,
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    partnerId: senderPartnerId,
    paymentType: "CIF",
    paymentTermDays: 7,
    amount: 3030,
  });
  result.freightSpecificDue = (await dueDateForFreight(overrideFreight)) === "2026-09-10";

  await admin
    .from("business_partners")
    .update({ default_receivable_due_days: null })
    .eq("id", senderPartnerId);
  await admin
    .from("financial_integration_settings")
    .update({ default_receivable_due_days: 15 })
    .eq("workspace_id", workspaceId);
  const tenantDefaultFreight = await insertCompletedFreight({
    tenantId,
    workspaceId,
    vehicleId: vehicle.id,
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    partnerId: senderPartnerId,
    paymentType: "CIF",
    paymentTermDays: null,
    amount: 4040,
  });
  result.tenantDefaultDue = (await dueDateForFreight(tenantDefaultFreight)) === "2026-09-18";

  await admin
    .from("financial_integration_settings")
    .update({ default_receivable_due_days: null })
    .eq("workspace_id", workspaceId);
  const missingTermFreight = await insertCompletedFreight({
    tenantId,
    workspaceId,
    vehicleId: vehicle.id,
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    partnerId: senderPartnerId,
    paymentType: "CIF",
    paymentTermDays: null,
    amount: 5050,
  });
  const missingTermJob = await one(
    admin
      .from("financial_integration_jobs")
      .select("status, review_reasons")
      .eq("source_type", "freight")
      .eq("source_id", missingTermFreight),
    "job prazo ausente",
  );
  result.missingTermNeedsReview =
    missingTermJob.status === "needs_review" &&
    missingTermJob.review_reasons.includes("payment_terms_missing");

  const cashFreight = await insertCompletedFreight({
    tenantId,
    workspaceId,
    vehicleId: vehicle.id,
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    partnerId: recipientPartnerId,
    paymentType: "FOB",
    paymentTermDays: 0,
    amount: 6060,
  });
  const cashDocs = await documentsFor("freight", cashFreight);
  result.cashDueOpen =
    cashDocs[0]?.financial_installments?.[0]?.due_date === "2026-09-03" &&
    cashDocs[0]?.financial_installments?.[0]?.status === "open";

  const stationName = `POSTO FASE 36 ${randomUUID().slice(0, 8)}`;
  const stationPartnerId = randomUUID();
  ids.partners.push(stationPartnerId);
  await rows(
    admin.from("business_partners").insert({
      id: stationPartnerId,
      tenant_id: tenantId,
      trade_name: stationName,
      default_payable_due_days: 7,
      active: true,
    }),
    "criar fornecedor posto",
  );
  await rows(
    admin.from("business_partner_roles").insert({
      tenant_id: tenantId,
      partner_id: stationPartnerId,
      role: "supplier",
      active: true,
    }),
    "criar role fornecedor",
  );
  const fuelId = randomUUID();
  ids.fuels.push(fuelId);
  await rows(
    admin.from("fuel_records").insert({
      id: fuelId,
      tenant_id: tenantId,
      vehicle_id: vehicle.id,
      vehicle_plate: vehicle.plate,
      station: stationName,
      fuel_type: "diesel_s10",
      liters: 100,
      amount: 550,
      odometer: 1000,
      recorded_at: completedAt,
    }),
    "criar abastecimento",
  );
  await rememberSource("fuel_record", fuelId);
  const fuelDocs = await documentsFor("fuel_record", fuelId);
  result.fuelSupplierDue =
    fuelDocs[0]?.direction === "payable" &&
    fuelDocs[0]?.partner_id === stationPartnerId &&
    fuelDocs[0]?.financial_installments?.[0]?.due_date === "2026-09-10";

  const auditCount = await rows(
    admin
      .from("financial_audit_events")
      .select("id")
      .in("financial_document_id", ids.documents)
      .limit(20),
    "auditoria",
  );
  result.auditLogs = auditCount.length > 0;

  result.noDuplicateDocuments =
    (await documentsFor("freight", partnerCif)).length === 1 &&
    (await documentsFor("freight", partnerFob)).length === 1;

  const otherWorkspace = (
    await rows(
      admin.from("workspaces").select("tenant_id").neq("tenant_id", tenantId).limit(1),
      "workspace outro tenant",
    )
  )[0];
  if (otherWorkspace?.tenant_id) {
    const { data: crossTenantPartners, error: crossTenantError } = await owner
      .from("business_partners")
      .select("id")
      .eq("tenant_id", otherWorkspace.tenant_id)
      .limit(1);
    result.rlsIsolation = !crossTenantError && (crossTenantPartners ?? []).length === 0;
  } else {
    result.rlsIsolation = true;
  }

  console.table(result);
  if (Object.values(result).some((value) => value !== true)) {
    throw new Error("Fase 3.6 falhou em pelo menos uma validacao.");
  }
} finally {
  await cleanup();
}
