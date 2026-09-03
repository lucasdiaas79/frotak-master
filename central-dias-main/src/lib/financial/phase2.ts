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
  FinancialDocumentInput,
  FinancialSettlement,
  SettlementInput,
} from "./types";

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
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
): Promise<FinancialDocumentDetails[]> {
  let query = supabase
    .from("financial_documents")
    .select(
      "*, business_partners(trade_name), chart_of_accounts(name), financial_installments!financial_installments_document_id_fkey(*), financial_allocations!financial_allocations_document_id_fkey(*), financial_settlements!financial_settlements_document_id_fkey(*)",
    )
    .order("created_at", { ascending: false });
  if (direction) query = query.eq("direction", direction);
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
    documentNumber: row.document_number,
    notes: row.notes,
    partnerName: row.business_partners?.trade_name ?? null,
    accountName: row.chart_of_accounts?.name ?? null,
    costCenterId: row.financial_allocations?.[0]?.cost_center_id ?? null,
    vehicleId: row.financial_allocations?.[0]?.vehicle_id ?? null,
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

export async function listFinancialAccounts(): Promise<FinancialAccount[]> {
  const { data, error } = await supabase
    .from("financial_account_balances")
    .select("*")
    .order("name");
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

export async function listFinancialPartners(): Promise<BusinessPartner[]> {
  const [{ data, error }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("business_partners").select("*").eq("active", true).order("trade_name"),
    supabase.from("business_partner_roles").select("partner_id, role").eq("active", true),
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
    roles: byPartner.get(row.id) ?? [],
  }));
}

export async function saveBusinessPartner(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("save_business_partner", { p_payload: payload });
  fail("Não foi possível salvar o parceiro", error);
  return data as string;
}

export async function listFinancialChart(): Promise<ChartAccount[]> {
  const { data, error } = await supabase.from("chart_of_accounts").select("*").order("code");
  fail("Não foi possível carregar o plano de contas", error);
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

export async function listFinancialCostCenters(): Promise<CostCenter[]> {
  const { data, error } = await supabase.from("cost_centers").select("*").order("code");
  fail("Não foi possível carregar os centros de custo", error);
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
  fail("Não foi possível salvar o centro de custo", error);
  return data as string;
}
