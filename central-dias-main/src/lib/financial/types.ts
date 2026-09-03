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
  freightPaymentType: "CIF" | "FOB" | null;
  billingPartnerId: string | null;
  paymentTermDays: number | null;
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
  defaultReceivableDueDays: number | null;
  defaultPayableDueDays: number | null;
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

export interface FinancialAccess {
  workspaceId: string;
  tenantId: string;
  isOwner: boolean;
  permissions: string[];
  canView: boolean;
}

export interface FinancialAccount {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  accountType: "checking" | "savings" | "cash" | "wallet" | "other";
  bankName: string | null;
  agency: string | null;
  accountNumber: string | null;
  openingBalance: number;
  openingBalanceDate: string;
  currentBalance: number;
  active: boolean;
}

export interface FinancialSettlement {
  id: string;
  documentId: string;
  installmentId: string;
  financialAccountId: string;
  settlementType: "settlement" | "reversal";
  originalSettlementId: string | null;
  principalAmount: number;
  interestAmount: number;
  penaltyAmount: number;
  discountAmount: number;
  netAmount: number;
  settledOn: string;
  paymentMethod: string;
  notes: string | null;
  reversalReason: string | null;
  createdAt: string;
}

export interface FinancialDocumentDetails extends FinancialDocument {
  documentNumber: string | null;
  notes: string | null;
  partnerName: string | null;
  accountName: string | null;
  costCenterId: string | null;
  vehicleId: string | null;
  freightId: string | null;
  productId: string | null;
  installments: FinancialInstallment[];
  settlements: FinancialSettlement[];
}

export interface FinancialDocumentInput {
  id?: string;
  workspaceId: string;
  direction: FinancialDocumentDirection;
  partnerId?: string;
  documentType?: string;
  documentNumber?: string;
  description: string;
  originalAmount: number;
  competenceDate: string;
  issueDate: string;
  chartAccountId?: string;
  costCenterId?: string;
  vehicleId?: string;
  freightId?: string;
  productId?: string;
  notes?: string;
  status: "draft" | "posted";
  installmentCount: number;
  firstDueDate: string;
  installments?: Array<{ amount: number; dueDate: string }>;
}

export interface SettlementInput {
  installmentId: string;
  financialAccountId: string;
  amount: number;
  interestAmount: number;
  penaltyAmount: number;
  discountAmount: number;
  settledOn: string;
  paymentMethod: string;
  notes?: string;
}

export type FinancialIntegrationStatus = "pending" | "processed" | "failed" | "needs_review";

export interface FinancialIntegrationJob {
  id: string;
  sourceType: "freight" | "fuel_record" | "freight_expense";
  sourceId: string;
  sourceEvent: string;
  status: FinancialIntegrationStatus;
  financialDocumentId: string | null;
  attempts: number;
  maxAttempts: number;
  reviewReasons: string[];
  lastError: string | null;
  detectedAt: string;
  processedAt: string | null;
}

export interface FinancialIntegrationSettings {
  workspaceId: string;
  defaultReceivableDueDays: number | null;
  defaultPayableDueDays: number | null;
}

export interface FinancialIntegrationProcessResult {
  processed: number;
  needsReview: number;
  failed: number;
}

export type FinancialRecurringKind = "salary" | "recurring_expense" | "fixed_cost";
export type FinancialRecurringFrequency = "MONTHLY" | "WEEKLY" | "YEARLY";
export type FinancialRecurringStatus = "active" | "paused" | "ended";

export interface FinancialRecurringRule {
  id: string;
  tenantId: string;
  workspaceId: string;
  kind: FinancialRecurringKind;
  name: string;
  partnerId: string | null;
  partnerName: string | null;
  employeeName: string | null;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  costCenterId: string;
  costCenterName: string | null;
  chartAccountId: string;
  chartAccountName: string | null;
  amount: number;
  frequency: FinancialRecurringFrequency;
  dueDay: number;
  startMonth: string;
  endMonth: string | null;
  autoPost: boolean;
  status: FinancialRecurringStatus;
  notes: string | null;
  generatedCount: number;
  lastGeneratedCompetence: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialRecurringRuleInput {
  id?: string;
  workspaceId: string;
  kind: FinancialRecurringKind;
  name: string;
  partnerId?: string;
  employeeName?: string;
  driverId?: string;
  vehicleId?: string;
  costCenterId: string;
  chartAccountId: string;
  amount: number;
  frequency: FinancialRecurringFrequency;
  dueDay: number;
  startMonth: string;
  endMonth?: string;
  autoPost: boolean;
  status: FinancialRecurringStatus;
  notes?: string;
}

export interface FinancialRecurringGenerationResult {
  generated: number;
  skipped: number;
  documentIds: string[];
}

export type PayrollEntryStatus = "draft" | "calculated" | "approved" | "posted" | "paid" | "voided";

export type PayrollItemType =
  | "SALARY_BASE"
  | "COMMISSION"
  | "OVERTIME"
  | "DAILY_ALLOWANCE"
  | "BONUS"
  | "ADDITIONAL"
  | "BENEFIT"
  | "OTHER_EARNING"
  | "ADVANCE"
  | "DISCOUNT"
  | "OTHER_DEDUCTION";

export interface EmployeeFinancialProfile {
  id: string;
  tenantId: string;
  workspaceId: string;
  displayName: string;
  driverId: string | null;
  profileId: string | null;
  businessPartnerId: string | null;
  jobTitle: string | null;
  baseSalary: number;
  defaultCostCenterId: string;
  defaultChartAccountId: string;
  defaultPayDay: number;
  admissionDate: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFinancialProfileInput {
  id?: string;
  workspaceId: string;
  displayName: string;
  driverId?: string;
  profileId?: string;
  businessPartnerId?: string;
  jobTitle?: string;
  baseSalary: number;
  defaultCostCenterId: string;
  defaultChartAccountId: string;
  defaultPayDay: number;
  admissionDate?: string;
  active: boolean;
  notes?: string;
}

export interface PayrollItem {
  id: string;
  itemType: PayrollItemType;
  direction: "earning" | "deduction";
  description: string;
  amount: number;
  employeeAdvanceId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceEvent: string | null;
  createdAt: string;
}

export interface PayrollEntry {
  id: string;
  tenantId: string;
  workspaceId: string;
  periodId: string;
  employeeProfileId: string;
  employeeNameSnapshot: string;
  employeeDisplayName: string;
  jobTitleSnapshot: string | null;
  baseSalarySnapshot: number;
  costCenterId: string;
  costCenterName: string | null;
  chartAccountId: string;
  chartAccountName: string | null;
  dueDate: string;
  competenceMonth: string;
  status: PayrollEntryStatus;
  grossAmount: number;
  deductionAmount: number;
  netAmount: number;
  financialDocumentId: string | null;
  financialDocumentStatus: FinancialDocumentStatus | null;
  items: PayrollItem[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeAdvance {
  id: string;
  employeeProfileId: string;
  employeeDisplayName: string;
  financialDocumentId: string | null;
  amount: number;
  paidOn: string;
  description: string;
  status: "available" | "applied" | "voided";
  appliedPayrollItemId: string | null;
  notes: string | null;
}

export interface PayrollEntryInput {
  workspaceId: string;
  employeeProfileId: string;
  competenceMonth: string;
  dueDate?: string;
  dueDay?: number;
  costCenterId?: string;
  chartAccountId?: string;
}

export interface PayrollItemInput {
  id?: string;
  payrollEntryId: string;
  itemType: PayrollItemType;
  description: string;
  amount: number;
  employeeAdvanceId?: string;
}

export type ProfitabilitySort =
  | "most_profitable"
  | "lowest_profit"
  | "highest_revenue"
  | "highest_cost";

export type ProfitabilityView = "vehicles" | "freights" | "partners";

export interface ProfitabilityFilters {
  workspaceId: string;
  startDate: string;
  endDate: string;
  vehicleId?: string | null;
  billingPartnerId?: string | null;
  senderId?: string | null;
  recipientId?: string | null;
  productId?: string | null;
  implementModel?: string | null;
  paymentType?: "CIF" | "FOB" | null;
}

export interface FleetProfitabilitySummary {
  revenue: number;
  costs: number;
  result: number;
  margin: number;
  unallocatedCosts: number;
}

export interface VehicleProfitabilityRow {
  vehicleId: string;
  plate: string;
  model: string | null;
  driverName: string | null;
  revenue: number;
  costs: number;
  result: number;
  margin: number;
  freightCount: number;
  implementModels: string[];
}

export interface FreightProfitabilityRow {
  freightId: string;
  vehicleId: string | null;
  plate: string;
  driverName: string | null;
  senderId: string | null;
  senderName: string;
  recipientId: string | null;
  recipientName: string;
  productId: string | null;
  productName: string;
  paymentType: "CIF" | "FOB" | null;
  billingPartnerId: string | null;
  billingPartnerName: string;
  revenue: number;
  costs: number;
  result: number;
  margin: number;
  completedAt: string | null;
}

export interface PartnerProfitabilityRow {
  partnerId: string | null;
  partnerName: string;
  revenue: number;
  costs: number;
  result: number;
  margin: number;
  freightCount: number;
}
