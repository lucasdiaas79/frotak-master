import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ownerEmail = process.env.FINANCIAL_TEST_OWNER_EMAIL;
const ownerPassword = process.env.FINANCIAL_TEST_OWNER_PASSWORD;

if (!url || !serviceKey || !anonKey || !ownerEmail || !ownerPassword) {
  throw new Error("Missing Supabase or financial test environment variables.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const owner = createClient(url, anonKey, { auth: { persistSession: false } });
const runId = Date.now();
const created = { documents: [], settlements: [], account: null, users: [], memberships: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function documentState(id) {
  const { data, error } = await owner
    .from("financial_documents")
    .select("status, financial_installments!financial_installments_document_id_fkey(id, amount, settled_amount, balance, status)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function createTemporaryMember(workspaceId, roleCode) {
  const email = `finance.phase2.${roleCode.toLowerCase()}.${runId}@frotak.test`;
  const password = `Frotak-${runId}!`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) throw authError;
  const userId = authData.user.id;
  created.users.push(userId);

  const { data: membership, error: membershipError } = await admin
    .from("workspace_memberships")
    .insert({ workspace_id: workspaceId, user_id: userId, status: "active", is_owner: false })
    .select("id")
    .single();
  if (membershipError) throw membershipError;
  created.memberships.push(membership.id);

  const { data: role, error: roleError } = await admin
    .from("workspace_roles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("code", roleCode)
    .single();
  if (roleError) throw roleError;
  const { error: assignmentError } = await admin
    .from("membership_roles")
    .insert({ membership_id: membership.id, role_id: role.id, workspace_id: workspaceId });
  if (assignmentError) throw assignmentError;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  return client;
}

async function cleanup() {
  if (created.documents.length) {
    await admin.from("financial_audit_events").delete().in("financial_document_id", created.documents);
    await admin.from("financial_settlements").delete().in("document_id", created.documents);
    await admin.from("financial_allocations").delete().in("document_id", created.documents);
    await admin.from("financial_installments").delete().in("document_id", created.documents);
    await admin.from("financial_documents").delete().in("id", created.documents);
  }
  if (created.account) await admin.from("financial_accounts").delete().eq("id", created.account);
  if (created.memberships.length) {
    await admin.from("membership_roles").delete().in("membership_id", created.memberships);
    await admin.from("workspace_memberships").delete().in("id", created.memberships);
  }
  for (const userId of created.users) await admin.auth.admin.deleteUser(userId);
}

try {
  const { error: loginError } = await owner.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  if (loginError) throw loginError;
  const access = await rpc(owner, "get_financial_access", {});
  assert(access.isOwner && access.canView, "Owner does not have full financial access.");

  created.account = await rpc(owner, "save_financial_account", {
    p_payload: {
      workspaceId: access.workspaceId,
      name: `Conta teste Fase 2 ${runId}`,
      accountType: "checking",
      openingBalance: 1000,
      openingBalanceDate: "2026-09-01",
      active: true,
    },
  });

  const parcelDocument = await rpc(owner, "save_financial_document", {
    p_payload: {
      workspaceId: access.workspaceId,
      direction: "receivable",
      description: `Parcelamento teste ${runId}`,
      originalAmount: 12000,
      competenceDate: "2026-09-01",
      issueDate: "2026-09-01",
      status: "draft",
      installmentCount: 3,
      firstDueDate: "2026-09-10",
    },
  });
  created.documents.push(parcelDocument);
  const parcelState = await documentState(parcelDocument);
  assert(
    parcelState.financial_installments.length === 3 &&
      parcelState.financial_installments.every((item) => Number(item.amount) === 4000),
    "Installment generation failed.",
  );

  async function exercise(direction, firstAmount, remainder) {
    const id = await rpc(owner, "save_financial_document", {
      p_payload: {
        workspaceId: access.workspaceId,
        direction,
        description: `${direction} teste ${runId}`,
        originalAmount: firstAmount + remainder,
        competenceDate: "2026-09-01",
        issueDate: "2026-09-01",
        status: "posted",
        installmentCount: 1,
        firstDueDate: "2026-09-15",
      },
    });
    created.documents.push(id);
    let state = await documentState(id);
    const installmentId = state.financial_installments[0].id;
    const firstSettlement = await rpc(owner, "settle_financial_installment", {
      p_payload: {
        installmentId,
        financialAccountId: created.account,
        amount: firstAmount,
        interestAmount: 0,
        penaltyAmount: 0,
        discountAmount: 0,
        settledOn: "2026-09-02",
        paymentMethod: "pix",
      },
    });
    created.settlements.push(firstSettlement);
    state = await documentState(id);
    assert(state.status === "partially_settled", `${direction} partial settlement failed.`);

    const finalSettlement = await rpc(owner, "settle_financial_installment", {
      p_payload: {
        installmentId,
        financialAccountId: created.account,
        amount: remainder,
        interestAmount: 0,
        penaltyAmount: 0,
        discountAmount: 0,
        settledOn: "2026-09-03",
        paymentMethod: "bank_transfer",
      },
    });
    created.settlements.push(finalSettlement);
    state = await documentState(id);
    assert(state.status === "settled", `${direction} total settlement failed.`);

    const reversalId = await rpc(owner, "reverse_financial_settlement", {
      p_settlement_id: finalSettlement,
      p_reason: "Teste automatizado de estorno",
    });
    created.settlements.push(reversalId);
    state = await documentState(id);
    assert(state.status === "partially_settled", `${direction} reversal failed.`);
  }

  await exercise("receivable", 4000, 6000);
  await exercise("payable", 3000, 5000);

  const { data: ownerRows, error: ownerRowsError } = await owner
    .from("financial_documents")
    .select("tenant_id, workspace_id");
  if (ownerRowsError) throw ownerRowsError;
  assert(ownerRows.every((row) => row.workspace_id === access.workspaceId), "RLS leaked another workspace.");

  const financialUser = await createTemporaryMember(access.workspaceId, "FINANCIAL");
  const financialAccess = await rpc(financialUser, "get_financial_access", {});
  assert(financialAccess.canView && financialAccess.permissions.includes("financial.pay"), "FINANCIAL role is not authorized.");

  const viewer = await createTemporaryMember(access.workspaceId, "VIEWER");
  const viewerAccess = await rpc(viewer, "get_financial_access", {});
  assert(!viewerAccess.canView, "VIEWER unexpectedly has financial access.");
  const { data: viewerRows, error: viewerRowsError } = await viewer
    .from("financial_documents")
    .select("id");
  if (viewerRowsError) throw viewerRowsError;
  assert(viewerRows.length === 0, "Unauthorized user can read financial documents.");
  const { error: forbiddenError } = await viewer.rpc("save_financial_document", {
    p_payload: {
      workspaceId: access.workspaceId,
      direction: "payable",
      description: "Must be forbidden",
      originalAmount: 1,
      competenceDate: "2026-09-01",
      issueDate: "2026-09-01",
      status: "draft",
      installmentCount: 1,
      firstDueDate: "2026-09-01",
    },
  });
  assert(Boolean(forbiddenError), "Unauthorized user can create financial documents.");

  const { count: auditCount, error: auditError } = await admin
    .from("financial_audit_events")
    .select("id", { count: "exact", head: true })
    .in("financial_document_id", created.documents);
  if (auditError) throw auditError;
  assert((auditCount || 0) >= 10, "Financial audit events were not recorded.");

  console.log(JSON.stringify({
    owner: "PASS",
    accounts: "PASS",
    receivable: "PASS",
    payable: "PASS",
    installments: "PASS",
    partialSettlement: "PASS",
    totalSettlement: "PASS",
    reversal: "PASS",
    rls: "PASS",
    financialRole: "PASS",
    unauthorizedRole: "PASS",
    audit: "PASS",
  }, null, 2));
} finally {
  await cleanup();
}
