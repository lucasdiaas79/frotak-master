export type CurrencyCode = "BRL" | (string & {});

export type FreightLifecycleStatus = "planned" | "active" | "completed" | "cancelled";
export type FreightSourceKind = "active_vehicle" | "freight_history" | "native";

export interface CanonicalFreight {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  primaryTrailerId: string | null;
  trailerIds: string[];
  senderId: string | null;
  recipientId: string | null;
  productId: string | null;
  freightValue: number | null;
  currency: CurrencyCode;
  lifecycleStatus: FreightLifecycleStatus;
  operationalStatus: string | null;
  freightStage: string | null;
  sourceKind: FreightSourceKind;
  legacyHistoryId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  requiresReview: boolean;
  reviewReasons: string[];
}

export type BusinessPartnerRole = "customer" | "supplier" | "sender" | "recipient";

export interface BusinessPartner {
  id: string;
  tenantId: string;
  legalName: string | null;
  tradeName: string;
  taxId: string | null;
  taxIdType: "cpf" | "cnpj" | "other" | null;
  active: boolean;
  requiresReview: boolean;
  roles: BusinessPartnerRole[];
}

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "contra_revenue";

export type DreGroup =
  | "gross_revenue"
  | "revenue_deduction"
  | "variable_cost"
  | "operating_expense"
  | "depreciation_amortization"
  | "financial_result"
  | "income_tax"
  | "other_result";

export interface ChartAccount {
  id: string;
  tenantId: string;
  parentId: string | null;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: "debit" | "credit";
  dreGroup: DreGroup | null;
  isPostable: boolean;
  isSystem: boolean;
  active: boolean;
}

export interface CostCenter {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  parentId: string | null;
  code: string;
  name: string;
  active: boolean;
  isSystem: boolean;
}

export type FinancialDocumentDirection = "receivable" | "payable";
export type FinancialDocumentStatus =
  | "draft"
  | "posted"
  | "partially_settled"
  | "settled"
  | "voided";

export interface FinancialDocument {
  id: string;
  tenantId: string;
  workspaceId: string;
  direction: FinancialDocumentDirection;
  partnerId: string | null;
  documentType: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceEvent: string | null;
  description: string;
  originalAmount: number;
  competenceDate: string | null;
  issueDate: string | null;
  currency: CurrencyCode;
  status: FinancialDocumentStatus;
  chartAccountId: string | null;
}

export interface FinancialInstallment {
  id: string;
  documentId: string;
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: "open" | "partially_settled" | "settled" | "voided";
  settledAmount: number;
  balance: number;
}

export interface FinancialAllocation {
  id: string;
  documentId: string;
  freightId: string | null;
  vehicleId: string | null;
  businessPartnerId: string | null;
  costCenterId: string | null;
  productId: string | null;
  chartAccountId: string | null;
  amount: number;
  percentage: number | null;
}
