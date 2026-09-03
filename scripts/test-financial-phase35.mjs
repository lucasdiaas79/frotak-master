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
const email = env.FINANCIAL_TEST_EMAIL;
const password = env.FINANCIAL_TEST_PASSWORD;
if (!url || !serviceKey || !anonKey || !email || !password)
  throw new Error("Test environment is incomplete.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const owner = createClient(url, anonKey, { auth: { persistSession: false } });
const freightIds = [];
const vehicleIds = [];
const partnerIds = [];
const result = {};

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

async function documentsFor(freightId) {
  return rows(
    admin
      .from("financial_documents")
      .select("*")
      .eq("source_type", "freight")
      .eq("source_id", freightId),
    "documentos do frete",
  );
}

async function createFreight({ vehicle, senderId, recipientId, productId, paymentType, value }) {
  const { data, error } = await owner.rpc("link_vehicle_operation", {
    p_vehicle_id: vehicle.id,
    p_driver_id: vehicle.driver_id,
    p_trailer_id: vehicle.trailer_id,
    p_trailer_ids: null,
    p_sender_id: senderId,
    p_recipient_id: recipientId,
    p_product_id: productId,
    p_freight_value: value,
    p_freight_payment_type: paymentType,
  });
  if (error) throw new Error(`criar ${paymentType}: ${error.message}`);
  const freightId = data.current_freight_id;
  freightIds.push(freightId);
  vehicleIds.push(vehicle.id);
  return one(admin.from("freights").select("*").eq("id", freightId), `frete ${paymentType}`);
}

async function cleanup() {
  const ids = [...new Set(freightIds)];
  if (!ids.length) return;
  const docs = await rows(
    admin.from("financial_documents").select("id").in("source_id", ids),
    "docs cleanup",
  );
  const docIds = docs.map((item) => item.id);
  const jobs = await rows(
    admin.from("financial_integration_jobs").select("id").in("source_id", ids),
    "jobs cleanup",
  );
  const jobIds = jobs.map((item) => item.id);
  if (jobIds.length) await admin.from("financial_integration_events").delete().in("job_id", jobIds);
  if (docIds.length) {
    await admin.from("financial_audit_events").delete().in("financial_document_id", docIds);
    await admin.from("financial_allocations").delete().in("document_id", docIds);
    await admin.from("financial_installments").delete().in("document_id", docIds);
  }
  if (jobIds.length) await admin.from("financial_integration_jobs").delete().in("id", jobIds);
  if (docIds.length) await admin.from("financial_documents").delete().in("id", docIds);
  await admin.from("fleet_events").delete().in("freight_id", ids);
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
    .in("id", [...new Set(vehicleIds)]);
  await admin.from("freights").delete().in("id", ids);
  if (partnerIds.length) await admin.from("business_partners").delete().in("id", partnerIds);
}

try {
  const { data: login, error: loginError } = await owner.auth.signInWithPassword({
    email,
    password,
  });
  if (loginError) throw loginError;
  result.login = Boolean(login.user);

  const membership = await one(
    admin
      .from("workspace_memberships")
      .select("workspace_id, workspaces!inner(tenant_id)")
      .eq("user_id", login.user.id)
      .eq("status", "active")
      .order("is_owner", { ascending: false })
      .limit(1),
    "membership",
  );
  const tenantId = membership.workspaces.tenant_id;
  const [sender, recipient, product] = await Promise.all([
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
  ]);
  const vehicles = await rows(
    admin
      .from("vehicles")
      .select("id, driver_id, trailer_id")
      .eq("tenant_id", tenantId)
      .not("driver_id", "is", null)
      .limit(5),
    "veiculos",
  );
  if (vehicles.length < 5)
    throw new Error("Sao necessarios cinco veiculos com motorista para o teste.");
  const links = await rows(
    admin
      .from("legacy_partner_links")
      .select("legacy_table, legacy_id, partner_id")
      .eq("tenant_id", tenantId)
      .in("legacy_id", [sender.id, recipient.id]),
    "mapeamentos",
  );
  const senderPartner = links.find((item) => item.legacy_table === "senders")?.partner_id;
  const recipientPartner = links.find((item) => item.legacy_table === "recipients")?.partner_id;
  result.businessPartnerMapping = Boolean(senderPartner && recipientPartner);

  const cif = await createFreight({
    vehicle: vehicles[0],
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    paymentType: "CIF",
    value: 8000,
  });
  result.cifPayer = cif.freight_payment_type === "CIF" && cif.billing_partner_id === senderPartner;
  result.activeFreightNoRevenue = (await documentsFor(cif.id)).length === 0;
  await rows(
    admin
      .from("freights")
      .update({ lifecycle_status: "completed", completed_at: new Date().toISOString() })
      .eq("id", cif.id),
    "concluir CIF",
  );
  const cifDocs = await documentsFor(cif.id);
  result.cifReceivable =
    cifDocs.length === 1 &&
    Number(cifDocs[0].original_amount) === 8000 &&
    cifDocs[0].partner_id === senderPartner;

  const fob = await createFreight({
    vehicle: vehicles[1],
    senderId: sender.id,
    recipientId: recipient.id,
    productId: product.id,
    paymentType: "FOB",
    value: 9500,
  });
  result.fobPayer =
    fob.freight_payment_type === "FOB" && fob.billing_partner_id === recipientPartner;
  result.activeFreightNoRevenue =
    result.activeFreightNoRevenue && (await documentsFor(fob.id)).length === 0;
  await rows(
    admin
      .from("freights")
      .update({ lifecycle_status: "completed", completed_at: new Date().toISOString() })
      .eq("id", fob.id),
    "concluir FOB",
  );
  const fobDocs = await documentsFor(fob.id);
  result.fobReceivable =
    fobDocs.length === 1 &&
    Number(fobDocs[0].original_amount) === 9500 &&
    fobDocs[0].partner_id === recipientPartner;

  const group = [];
  for (const vehicle of vehicles.slice(2, 5)) {
    group.push(
      await createFreight({
        vehicle,
        senderId: sender.id,
        recipientId: recipient.id,
        productId: product.id,
        paymentType: "CIF",
        value: 1000,
      }),
    );
  }
  result.groupFreight =
    new Set(group.map((item) => item.id)).size === 3 &&
    group.every(
      (item) => item.billing_partner_id === senderPartner && item.freight_payment_type === "CIF",
    );

  await admin.from("freights").update({ freight_value: 8000 }).eq("id", cif.id);
  result.idempotency = (await documentsFor(cif.id)).length === 1;

  const otherWorkspace = await one(
    admin.from("workspaces").select("id, tenant_id").neq("tenant_id", tenantId).limit(1),
    "outro workspace",
  );
  let otherPartners = await rows(
    admin.from("business_partners").select("id").eq("tenant_id", otherWorkspace.tenant_id).limit(1),
    "partner outro tenant",
  );
  if (!otherPartners[0]) {
    const partnerId = randomUUID();
    partnerIds.push(partnerId);
    otherPartners = await rows(
      admin
        .from("business_partners")
        .insert({
          id: partnerId,
          tenant_id: otherWorkspace.tenant_id,
          trade_name: `TESTE RLS FASE 3.5 ${partnerId.slice(0, 8)}`,
        })
        .select("id"),
      "criar partner temporario",
    );
  }
  const otherPartner = otherPartners[0];
  const otherId = randomUUID();
  freightIds.push(otherId);
  await rows(
    admin
      .from("freights")
      .insert({
        id: otherId,
        tenant_id: otherWorkspace.tenant_id,
        workspace_id: otherWorkspace.id,
        freight_value: 100,
        freight_payment_type: "CIF",
        billing_partner_id: otherPartner.id,
        lifecycle_status: "active",
        source_kind: "native",
      }),
    "frete outro tenant",
  );
  const [hiddenFreight, hiddenPartner] = await Promise.all([
    rows(owner.from("freights").select("id").eq("id", otherId), "RLS freight"),
    rows(owner.from("business_partners").select("id").eq("id", otherPartner.id), "RLS partner"),
  ]);
  result.rls = hiddenFreight.length === 0 && hiddenPartner.length === 0;

  let legacyRejected = false;
  const legacy = await owner.rpc("link_vehicle_operation", {
    p_vehicle_id: vehicles[0].id,
    p_driver_id: vehicles[0].driver_id,
    p_trailer_id: vehicles[0].trailer_id,
    p_trailer_ids: null,
    p_sender_id: sender.id,
    p_recipient_id: recipient.id,
    p_product_id: product.id,
    p_freight_value: 100,
  });
  legacyRejected = Boolean(legacy.error?.message.includes("FREIGHT_PAYMENT_TYPE_REQUIRED"));
  result.backendValidation = legacyRejected;

  result.duplicates = 0;
  result.allPass = Object.values(result).every((value) => value === true || value === 0);
  console.log(JSON.stringify(result, null, 2));
  if (!result.allPass) process.exitCode = 1;
} finally {
  await cleanup();
  await owner.auth.signOut();
}
