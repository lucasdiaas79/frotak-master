import { supabase } from "@/lib/supabase";
import type {
  BusinessPartner,
  BusinessPartnerRole,
  ChartAccount,
  CostCenter,
  FinancialAccess,
  FinancialAccount,
  FinancialDocumentDetails,
  FinancialDocumentDirection,
  FinancialDocumentsPage,
  FinancialDocumentsPageInput,
  FinancialDocumentInput,
  FinancialIntegrationJob,
  FinancialIntegrationProcessResult,
  FinancialIntegrationSettings,
  FinancialSettlement,
  SettlementInput,
} from "./types";

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasFinancialPermission(access: FinancialAccess | null, permission: string) {
  return Boolean(access?.isOwner || access?.permissions.includes(permission));
}

export async function getFinancialAccess(): Promise<FinancialAccess> {
  const { data, error } = await supabase.rpc("get_financial_access");
  fail("Não foi possível validar o acesso financeiro", error);
  return data as FinancialAccess;
}

export async function listFinancialDocuments(
  direction?: FinancialDocumentDirection,
  workspaceId?: string,
): Promise<FinancialDocumentDetails[]> {
  let query = supabase
    .from("financial_documents")
    .select(
      "*, business_partners!financial_documents_partner_id_fkey(trade_name), chart_of_accounts!financial_documents_chart_account_id_fkey(name), financial_installments!financial_installments_document_id_fkey(*), financial_allocations!financial_allocations_document_id_fkey(*), financial_settlements!financial_settlements_document_id_fkey(*)",
    )
    .order("created_at", { ascending: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  if (direction) query = query.eq("direction", direction);
  query = query.or("source_type.is.null,source_type.neq.settlement_adjustment");
  const { data, error } = await query;
  fail("Não foi possível carregar os títulos", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    direction: row.direction,
    partnerId: row.partner_id,
    documentType: row.document_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceEvent: row.source_event,
    description: row.description,
    originalAmount: Number(row.original_amount),
    competenceDate: row.competence_date,
    issueDate: row.issue_date,
    currency: row.currency,
    status: row.status,
    chartAccountId: row.chart_account_id,
    entryDate: row.entry_date ?? row.created_at?.slice(0, 10) ?? null,
    documentNumber: row.document_number,
    notes: row.notes,
    partnerName: row.business_partners?.trade_name ?? null,
    accountName: row.chart_of_accounts?.name ?? null,
    allocationCount: row.financial_allocations?.length ?? 0,
    costCenterId: row.financial_allocations?.[0]?.cost_center_id ?? null,
    vehicleId: row.financial_allocations?.[0]?.vehicle_id ?? null,
    driverId: row.financial_allocations?.[0]?.driver_id ?? null,
    freightId: row.financial_allocations?.[0]?.freight_id ?? null,
    productId: row.financial_allocations?.[0]?.product_id ?? null,
    installments: (row.financial_installments ?? [])
      .map((item: Record<string, unknown>) => ({
        id: String(item.id),
        documentId: String(item.document_id),
        installmentNumber: Number(item.installment_number),
        amount: Number(item.amount),
        dueDate: String(item.due_date),
        status: item.status as "open" | "partially_settled" | "settled" | "voided",
        settledAmount: Number(item.settled_amount),
        balance: Number(item.balance),
      }))
      .sort((a, b) => a.installmentNumber - b.installmentNumber),
    settlements: (row.financial_settlements ?? []).map(
      (item: Record<string, unknown>): FinancialSettlement => ({
        id: String(item.id),
        documentId: String(item.document_id),
        installmentId: String(item.installment_id),
        financialAccountId: String(item.financial_account_id),
        settlementType: item.settlement_type as "settlement" | "reversal",
        originalSettlementId: item.original_settlement_id
          ? String(item.original_settlement_id)
          : null,
        principalAmount: Number(item.principal_amount),
        interestAmount: Number(item.interest_amount),
        penaltyAmount: Number(item.penalty_amount),
        discountAmount: Number(item.discount_amount),
        netAmount: Number(item.net_amount),
        settledOn: String(item.settled_on),
        paymentMethod: String(item.payment_method),
        notes: item.notes ? String(item.notes) : null,
        reversalReason: item.reversal_reason ? String(item.reversal_reason) : null,
        createdAt: String(item.created_at),
      }),
    ),
  }));
}

function mapFinancialDocumentDetails(row: Record<string, any>): FinancialDocumentDetails {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? row.tenantId),
    workspaceId: String(row.workspace_id ?? row.workspaceId),
    direction: row.direction,
    partnerId: row.partner_id ?? row.partnerId ?? null,
    documentType: row.document_type ?? row.documentType,
    sourceType: row.source_type ?? row.sourceType ?? null,
    sourceId: row.source_id ?? row.sourceId ?? null,
    sourceEvent: row.source_event ?? row.sourceEvent ?? null,
    description: String(row.description),
    originalAmount: numberValue(row.original_amount ?? row.originalAmount),
    competenceDate: row.competence_date ?? row.competenceDate ?? null,
    issueDate: row.issue_date ?? row.issueDate ?? null,
    currency: row.currency,
    status: row.status,
    chartAccountId: row.chart_account_id ?? row.chartAccountId ?? null,
    entryDate: row.entry_date ?? row.entryDate ?? row.created_at?.slice?.(0, 10) ?? null,
    documentNumber: row.document_number ?? row.documentNumber ?? null,
    notes: row.notes ?? null,
    partnerName: row.business_partners?.trade_name ?? row.partner_name ?? row.partnerName ?? null,
    accountName: row.chart_of_accounts?.name ?? row.account_name ?? row.accountName ?? null,
    outstandingBalance:
      row.outstanding_balance !== undefined || row.outstandingBalance !== undefined
        ? numberValue(row.outstanding_balance ?? row.outstandingBalance)
        : undefined,
    allocationCount: Array.isArray(row.financial_allocations)
      ? row.financial_allocations.length
      : numberValue(row.allocation_count ?? row.allocationCount),
    costCenterId:
      row.financial_allocations?.[0]?.cost_center_id ?? row.cost_center_id ?? row.costCenterId ?? null,
    vehicleId: row.financial_allocations?.[0]?.vehicle_id ?? row.vehicle_id ?? row.vehicleId ?? null,
    driverId: row.financial_allocations?.[0]?.driver_id ?? row.driver_id ?? row.driverId ?? null,
    freightId: row.financial_allocations?.[0]?.freight_id ?? row.freight_id ?? row.freightId ?? null,
    productId: row.financial_allocations?.[0]?.product_id ?? row.product_id ?? row.productId ?? null,
    installments: (row.financial_installments ?? row.installments ?? [])
      .map((item: Record<string, unknown>) => ({
        id: String(item.id),
        documentId: String(item.document_id ?? item.documentId),
        installmentNumber: Number(item.installment_number ?? item.installmentNumber),
        amount: numberValue(item.amount),
        dueDate: String(item.due_date ?? item.dueDate),
        status: item.status as "open" | "partially_settled" | "settled" | "voided",
        settledAmount: numberValue(item.settled_amount ?? item.settledAmount),
        balance: numberValue(item.balance),
      }))
      .sort((a, b) => a.installmentNumber - b.installmentNumber),
    settlements: (row.financial_settlements ?? row.settlements ?? []).map(
      (item: Record<string, unknown>): FinancialSettlement => ({
        id: String(item.id),
        documentId: String(item.document_id ?? item.documentId),
        installmentId: String(item.installment_id ?? item.installmentId),
        financialAccountId: String(item.financial_account_id ?? item.financialAccountId),
        settlementType: item.settlement_type as "settlement" | "reversal",
        originalSettlementId: item.original_settlement_id ?? item.originalSettlementId
          ? String(item.original_settlement_id ?? item.originalSettlementId)
          : null,
        principalAmount: numberValue(item.principal_amount ?? item.principalAmount),
        interestAmount: numberValue(item.interest_amount ?? item.interestAmount),
        penaltyAmount: numberValue(item.penalty_amount ?? item.penaltyAmount),
        discountAmount: numberValue(item.discount_amount ?? item.discountAmount),
        netAmount: numberValue(item.net_amount ?? item.netAmount),
        settledOn: String(item.settled_on ?? item.settledOn),
        paymentMethod: String(item.payment_method ?? item.paymentMethod),
        notes: item.notes ? String(item.notes) : null,
        reversalReason: item.reversal_reason ?? item.reversalReason
          ? String(item.reversal_reason ?? item.reversalReason)
          : null,
        createdAt: String(item.created_at ?? item.createdAt),
      }),
    ),
  };
}

export async function listFinancialDocumentsPage(
  input: FinancialDocumentsPageInput,
): Promise<FinancialDocumentsPage> {
  const { data, error } = await supabase.rpc("list_financial_documents_page", {
    p_payload: input,
  });
  fail("Nao foi possivel carregar os titulos", error);
  const page = (data ?? {}) as Record<string, any>;
  const summary = (page.summary ?? {}) as Record<string, unknown>;
  const payablePressure = (summary.payablePressure ?? {}) as Record<string, Record<string, unknown>>;
  return {
    rows: ((page.rows ?? []) as Array<Record<string, any>>).map(mapFinancialDocumentDetails),
    page: numberValue(page.page) || input.page,
    pageSize: numberValue(page.pageSize) || input.pageSize,
    total: numberValue(page.total),
    summary: {
      openBalance: numberValue(summary.openBalance),
      overdue: numberValue(summary.overdue),
      overdueCount: numberValue(summary.overdueCount),
      settledPeriod: numberValue(summary.settledPeriod),
      upcoming: numberValue(summary.upcoming),
      upcomingCount: numberValue(summary.upcomingCount),
      payablePressure: {
        overdue: {
          amount: numberValue(payablePressure.overdue?.amount),
          count: numberValue(payablePressure.overdue?.count),
        },
        week: {
          amount: numberValue(payablePressure.week?.amount),
          count: numberValue(payablePressure.week?.count),
        },
        halfMonth: {
          amount: numberValue(payablePressure.halfMonth?.amount),
          count: numberValue(payablePressure.halfMonth?.count),
        },
        month: {
          amount: numberValue(payablePressure.month?.amount),
          count: numberValue(payablePressure.month?.count),
        },
        later: {
          amount: numberValue(payablePressure.later?.amount),
          count: numberValue(payablePressure.later?.count),
        },
      },
    },
  };
}

export async function getFinancialDocumentDetails(id: string): Promise<FinancialDocumentDetails> {
  const { data, error } = await supabase
    .from("financial_documents")
    .select(
      "*, business_partners!financial_documents_partner_id_fkey(trade_name), chart_of_accounts!financial_documents_chart_account_id_fkey(name), financial_installments!financial_installments_document_id_fkey(*), financial_allocations!financial_allocations_document_id_fkey(*), financial_settlements!financial_settlements_document_id_fkey(*)",
    )
    .eq("id", id)
    .single();
  fail("Nao foi possivel carregar o detalhe do titulo", error);
  return mapFinancialDocumentDetails(data as Record<string, any>);
}

export async function saveFinancialDocument(input: FinancialDocumentInput) {
  const { data, error } = await supabase.rpc("save_financial_document", { p_payload: input });
  fail("Não foi possível salvar o título", error);
  return data as string;
}

export async function voidFinancialDocument(id: string, reason: string) {
  const { error } = await supabase.rpc("void_financial_document", {
    p_document_id: id,
    p_reason: reason,
  });
  fail("Não foi possível cancelar o título", error);
}

export async function settleInstallment(input: SettlementInput) {
  const { data, error } = await supabase.rpc("settle_financial_installment", {
    p_payload: input,
  });
  fail("Não foi possível registrar a baixa", error);
  return data as string;
}

export async function reverseSettlement(id: string, reason: string) {
  const { data, error } = await supabase.rpc("reverse_financial_settlement", {
    p_settlement_id: id,
    p_reason: reason,
  });
  fail("Não foi possível estornar a baixa", error);
  return data as string;
}

export async function listFinancialAccounts(workspaceId?: string): Promise<FinancialAccount[]> {
  let query = supabase
    .from("financial_account_balances")
    .select("*")
    .order("name");
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  fail("Não foi possível carregar bancos e caixas", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    name: row.name,
    accountType: row.account_type,
    bankName: row.bank_name,
    agency: row.agency,
    accountNumber: row.account_number,
    openingBalance: Number(row.opening_balance),
    openingBalanceDate: row.opening_balance_date,
    currentBalance: Number(row.current_balance),
    active: row.active,
  }));
}

export async function saveFinancialAccount(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_financial_account", { p_payload: payload });
  fail("Não foi possível salvar a conta", error);
  return data as string;
}

export async function listFinancialPartners(tenantId?: string): Promise<BusinessPartner[]> {
  let partnersQuery = supabase
    .from("business_partners")
    .select("*")
    .eq("active", true)
    .order("trade_name");
  let rolesQuery = supabase
    .from("business_partner_roles")
    .select("partner_id, role")
    .eq("active", true);
  if (tenantId) {
    partnersQuery = partnersQuery.eq("tenant_id", tenantId);
    rolesQuery = rolesQuery.eq("tenant_id", tenantId);
  }
  const [{ data, error }, { data: roles, error: rolesError }] = await Promise.all([
    partnersQuery,
    rolesQuery,
  ]);
  fail("Não foi possível carregar os parceiros", error);
  fail("Não foi possível carregar os papéis dos parceiros", rolesError);
  const byPartner = new Map<string, BusinessPartnerRole[]>();
  for (const role of roles ?? []) {
    byPartner.set(role.partner_id, [
      ...(byPartner.get(role.partner_id) ?? []),
      role.role as BusinessPartnerRole,
    ]);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    taxId: row.tax_id,
    taxIdType: row.tax_id_type,
    active: row.active,
    requiresReview: row.requires_review,
    defaultReceivableDueDays:
      row.default_receivable_due_days === null ? null : Number(row.default_receivable_due_days),
    defaultPayableDueDays:
      row.default_payable_due_days === null ? null : Number(row.default_payable_due_days),
    roles: byPartner.get(row.id) ?? [],
  }));
}

export async function saveBusinessPartner(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_business_partner", { p_payload: payload });
  fail("Não foi possível salvar o parceiro", error);
  return data as string;
}

export async function listFinancialChart(tenantId?: string): Promise<ChartAccount[]> {
  let query = supabase.from("chart_of_accounts").select("*").order("code");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  fail("Não foi possível carregar os gerenciais", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    parentId: row.parent_id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    normalBalance: row.normal_balance,
    dreGroup: row.dre_group,
    isPostable: row.is_postable,
    isSystem: row.is_system,
    active: row.active,
  }));
}

export async function saveChartAccount(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_chart_account", { p_payload: payload });
  fail("Não foi possível salvar a conta contábil", error);
  return data as string;
}

export async function listFinancialCostCenters(workspaceId?: string): Promise<CostCenter[]> {
  let query = supabase.from("cost_centers").select("*").order("code");
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  fail("Não foi possível carregar as apropriações", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    code: row.code,
    name: row.name,
    active: row.active,
    isSystem: row.is_system,
  }));
}

export async function saveCostCenter(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_cost_center", { p_payload: payload });
  fail("Não foi possível salvar a apropriação", error);
  return data as string;
}

export async function listFinancialIntegrationJobs(): Promise<FinancialIntegrationJob[]> {
  const { data, error } = await supabase
    .from("financial_integration_jobs")
    .select("*")
    .order("detected_at", { ascending: false });
  fail("Não foi possível carregar as integrações financeiras", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceEvent: row.source_event,
    status: row.status,
    financialDocumentId: row.financial_document_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    reviewReasons: row.review_reasons ?? [],
    lastError: row.last_error,
    detectedAt: row.detected_at,
    processedAt: row.processed_at,
  }));
}

export async function getFinancialIntegrationSettings(
  workspaceId: string,
): Promise<FinancialIntegrationSettings> {
  const { data, error } = await supabase
    .from("financial_integration_settings")
    .select("workspace_id, default_receivable_due_days, default_payable_due_days")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  fail("Não foi possível carregar a política de vencimento", error);
  return {
    workspaceId,
    defaultReceivableDueDays: data?.default_receivable_due_days ?? null,
    defaultPayableDueDays: data?.default_payable_due_days ?? null,
  };
}

export async function saveFinancialIntegrationSettings(
  settings: FinancialIntegrationSettings,
): Promise<void> {
  const { error } = await supabase.rpc("save_financial_integration_settings", {
    p_workspace_id: settings.workspaceId,
    p_default_receivable_due_days: settings.defaultReceivableDueDays,
    p_default_payable_due_days: settings.defaultPayableDueDays,
  });
  fail("Não foi possível salvar a política de vencimento", error);
}

export async function processFinancialIntegrations(
  jobId?: string,
): Promise<FinancialIntegrationProcessResult> {
  const { data, error } = await supabase.rpc("process_financial_integrations", {
    p_limit: jobId ? 1 : 200,
    p_job_id: jobId ?? null,
  });
  fail("Não foi possível processar as integrações financeiras", error);
  return data as FinancialIntegrationProcessResult;
}
