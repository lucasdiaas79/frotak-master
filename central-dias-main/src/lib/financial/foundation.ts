import { supabase } from "@/lib/supabase";
import type {
  BusinessPartner,
  BusinessPartnerRole,
  CanonicalFreight,
  ChartAccount,
  CostCenter,
  FinancialDocument,
} from "./types";

function requireData<T>(data: T | null, error: { message: string } | null, operation: string): T {
  if (error) throw new Error(`${operation}: ${error.message}`);
  if (data === null) throw new Error(`${operation}: resposta vazia`);
  return data;
}

export async function listCanonicalFreights(): Promise<CanonicalFreight[]> {
  const { data, error } = await supabase.from("freights").select("*").order("created_at");
  return requireData(data, error, "Não foi possível consultar os fretes canônicos").map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    vehicleId: row.vehicle_id,
    driverId: row.driver_id,
    primaryTrailerId: row.primary_trailer_id,
    trailerIds: row.trailer_ids ?? [],
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    productId: row.product_id,
    freightValue: row.freight_value === null ? null : Number(row.freight_value),
    freightPaymentType: row.freight_payment_type,
    billingPartnerId: row.billing_partner_id,
    paymentTermDays: row.payment_term_days === null ? null : Number(row.payment_term_days),
    currency: row.currency,
    lifecycleStatus: row.lifecycle_status,
    operationalStatus: row.operational_status,
    freightStage: row.freight_stage,
    sourceKind: row.source_kind,
    legacyHistoryId: row.legacy_history_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    requiresReview: row.requires_review,
    reviewReasons: row.review_reasons ?? [],
  }));
}

export async function listBusinessPartners(): Promise<BusinessPartner[]> {
  const [{ data: partners, error }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("business_partners").select("*").order("trade_name"),
    supabase.from("business_partner_roles").select("partner_id, role").eq("active", true),
  ]);
  const rows = requireData(partners, error, "Não foi possível consultar os parceiros");
  const roleRows = requireData(
    roles,
    rolesError,
    "Não foi possível consultar os papéis dos parceiros",
  );
  const rolesByPartner = new Map<string, BusinessPartnerRole[]>();
  for (const role of roleRows) {
    const current = rolesByPartner.get(role.partner_id) ?? [];
    current.push(role.role as BusinessPartnerRole);
    rolesByPartner.set(role.partner_id, current);
  }
  return rows.map((row) => ({
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
    roles: rolesByPartner.get(row.id) ?? [],
  }));
}

export async function listChartOfAccounts(): Promise<ChartAccount[]> {
  const { data, error } = await supabase.from("chart_of_accounts").select("*").order("code");
  return requireData(data, error, "Não foi possível consultar o plano de contas").map((row) => ({
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

export async function listCostCenters(): Promise<CostCenter[]> {
  const { data, error } = await supabase.from("cost_centers").select("*").order("code");
  return requireData(data, error, "Não foi possível consultar os centros de custo").map((row) => ({
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

export async function findFinancialDocumentBySource(
  sourceType: string,
  sourceId: string,
  sourceEvent: string,
): Promise<FinancialDocument | null> {
  const { data, error } = await supabase
    .from("financial_documents")
    .select("*")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("source_event", sourceEvent)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível consultar o documento financeiro: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    tenantId: data.tenant_id,
    workspaceId: data.workspace_id,
    direction: data.direction,
    partnerId: data.partner_id,
    documentType: data.document_type,
    sourceType: data.source_type,
    sourceId: data.source_id,
    sourceEvent: data.source_event,
    description: data.description,
    originalAmount: Number(data.original_amount),
    competenceDate: data.competence_date,
    issueDate: data.issue_date,
    currency: data.currency,
    status: data.status,
    chartAccountId: data.chart_account_id,
  };
}
