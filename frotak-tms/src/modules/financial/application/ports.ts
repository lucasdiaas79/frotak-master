// Portas do modulo financeiro. Os adaptadores Supabase (RPCs) implementam estas interfaces;
// a interface do usuario chega a elas pelo container.
import type {
  BusinessPartner,
  CanonicalFreight,
  CashFlowEntry,
  CashFlowSettlementBatchDetails,
  CashFlowSummary,
  ChartAccount,
  CostCenter,
  Dre12MonthStatement,
  DreDetail,
  DrePeriodStatement,
  DreSummary,
  EmployeeAdvance,
  EmployeeFinancialProfile,
  EmployeeFinancialProfileInput,
  FinancialAccess,
  FinancialAccount,
  FinancialDashboard,
  FinancialDocument,
  FinancialDocumentDetails,
  FinancialDocumentDirection,
  FinancialDocumentInput,
  FinancialDocumentsPage,
  FinancialDocumentsPageInput,
  FinancialIntegrationHealth,
  FinancialIntegrationJob,
  FinancialIntegrationProcessResult,
  FinancialIntegrationSettings,
  FinancialRecurringGenerationResult,
  FinancialRecurringRule,
  FinancialRecurringRuleInput,
  FinancialReportPeriod,
  FleetProfitabilitySummary,
  FreightProfitabilityRow,
  PartnerProfitabilityRow,
  PayrollEntry,
  PayrollEntryInput,
  PayrollItemInput,
  ProfitabilityFilters,
  ProfitabilitySort,
  SettlementInput,
  VehicleProfitabilityRow,
} from "@/modules/financial/domain/types";

/** Acesso, titulos, baixas, contas, parceiros, plano de contas, centros de custo e integracoes. */
export interface FinancialDocumentsPort {
  clearFinancialAccessCache(): void;
  getFinancialAccess(force?: boolean): Promise<FinancialAccess>;
  listFinancialDocuments(
    direction?: FinancialDocumentDirection,
    workspaceId?: string,
  ): Promise<FinancialDocumentDetails[]>;
  listFinancialDocumentsPage(input: FinancialDocumentsPageInput): Promise<FinancialDocumentsPage>;
  getFinancialDocumentDetails(id: string): Promise<FinancialDocumentDetails>;
  saveFinancialDocument(input: FinancialDocumentInput): Promise<string>;
  voidFinancialDocument(id: string, reason: string): Promise<void>;
  settleInstallment(input: SettlementInput): Promise<string>;
  reverseSettlement(id: string, reason: string): Promise<string>;
  listFinancialAccounts(workspaceId?: string): Promise<FinancialAccount[]>;
  saveFinancialAccount(payload: Record<string, unknown>): Promise<string>;
  listFinancialPartners(tenantId?: string): Promise<BusinessPartner[]>;
  saveBusinessPartner(payload: Record<string, unknown>): Promise<string>;
  listFinancialChart(tenantId?: string): Promise<ChartAccount[]>;
  saveChartAccount(payload: Record<string, unknown>): Promise<string>;
  listFinancialCostCenters(workspaceId?: string): Promise<CostCenter[]>;
  saveCostCenter(payload: Record<string, unknown>): Promise<string>;
  listFinancialIntegrationJobs(): Promise<FinancialIntegrationJob[]>;
  getFinancialIntegrationSettings(workspaceId: string): Promise<FinancialIntegrationSettings>;
  saveFinancialIntegrationSettings(settings: FinancialIntegrationSettings): Promise<void>;
  processFinancialIntegrations(jobId?: string): Promise<FinancialIntegrationProcessResult>;
  getFinancialIntegrationHealth(workspaceId: string): Promise<FinancialIntegrationHealth>;
}

/** Regras de recorrencia e geracao de titulos recorrentes. */
export interface FinancialRecurringPort {
  listFinancialRecurringRules(): Promise<FinancialRecurringRule[]>;
  saveFinancialRecurringRule(input: FinancialRecurringRuleInput): Promise<string>;
  saveFinancialDocumentWithRecurring(input: {
    document: FinancialDocumentInput;
    recurring: FinancialRecurringRuleInput;
  }): Promise<{ documentId: string; ruleId: string }>;
  setFinancialRecurringRuleStatus(
    id: string,
    workspaceId: string,
    status: FinancialRecurringRule["status"],
  ): Promise<string>;
  generateFinancialRecurringDocuments(
    workspaceId: string,
    competenceMonth: string,
    ruleId?: string,
  ): Promise<FinancialRecurringGenerationResult>;
  generateDueFinancialRecurringDocuments(
    workspaceId: string,
    untilMonth: string,
  ): Promise<FinancialRecurringGenerationResult>;
}

/** Cadastros de apoio: fretes canonicos, parceiros, plano de contas, centros de custo. */
export interface FinancialMasterDataPort {
  listCanonicalFreights(workspaceId?: string): Promise<CanonicalFreight[]>;
  listBusinessPartners(): Promise<BusinessPartner[]>;
  listChartOfAccounts(): Promise<ChartAccount[]>;
  listCostCenters(): Promise<CostCenter[]>;
  findFinancialDocumentBySource(
    sourceType: string,
    sourceId: string,
    sourceEvent: string,
  ): Promise<FinancialDocument | null>;
}

/** Folha: perfis financeiros, lancamentos, itens e adiantamentos. */
export interface PayrollPort {
  listEmployeeFinancialProfiles(): Promise<EmployeeFinancialProfile[]>;
  saveEmployeeFinancialProfile(input: EmployeeFinancialProfileInput): Promise<string>;
  listPayrollEntries(): Promise<PayrollEntry[]>;
  createPayrollEntry(input: PayrollEntryInput): Promise<string>;
  savePayrollItem(input: PayrollItemInput): Promise<string>;
  deletePayrollItem(id: string): Promise<void>;
  calculatePayrollEntry(id: string): Promise<void>;
  approvePayrollEntry(id: string): Promise<void>;
  postPayrollEntry(id: string): Promise<{ documentId: string; created: boolean }>;
  voidPayrollEntry(id: string, reason: string): Promise<void>;
  listEmployeeAdvances(): Promise<EmployeeAdvance[]>;
  createEmployeeAdvance(input: {
    workspaceId: string;
    employeeProfileId: string;
    amount: number;
    paidOn: string;
    description: string;
    notes?: string;
  }): Promise<string>;
}

/** Rentabilidade por frota, veiculo, frete e parceiro. */
export interface ProfitabilityPort {
  getFleetProfitabilitySummary(filters: ProfitabilityFilters): Promise<FleetProfitabilitySummary>;
  getVehicleProfitability(
    filters: ProfitabilityFilters,
    sort: ProfitabilitySort,
    limit?: number,
  ): Promise<VehicleProfitabilityRow[]>;
  getFreightProfitability(filters: ProfitabilityFilters): Promise<FreightProfitabilityRow[]>;
  getPartnerProfitability(filters: ProfitabilityFilters): Promise<PartnerProfitabilityRow[]>;
}

/** DRE, fluxo de caixa e painel financeiro. */
export interface FinancialReportsPort {
  getDreSummary(input: FinancialReportPeriod): Promise<DreSummary>;
  getDreDetail(
    input: FinancialReportPeriod & { dreGroup?: string | null; chartAccountId?: string | null },
  ): Promise<DreDetail>;
  getDre12MonthStatement(input: {
    workspaceId: string;
    year: number;
    basis: "accrual" | "cash";
    costCenterId?: string | null;
  }): Promise<Dre12MonthStatement>;
  getDrePeriodStatement(input: {
    workspaceId: string;
    startDate: string;
    endDate: string;
    basis: "accrual" | "cash";
    costCenterId?: string | null;
    vehicleId?: string | null;
  }): Promise<DrePeriodStatement>;
  getCashFlowSummary(
    input: FinancialReportPeriod & { financialAccountId?: string | null },
  ): Promise<CashFlowSummary>;
  getCashFlowEntries(
    input: FinancialReportPeriod & {
      mode?: "realized" | "forecast";
      direction?: "receivable" | "payable" | null;
      financialAccountId?: string | null;
      sourceType?: string | null;
      chartAccountId?: string | null;
    },
  ): Promise<CashFlowEntry[]>;
  getCashFlowSettlementBatchDetails(batchId: string): Promise<CashFlowSettlementBatchDetails>;
  getFinancialDashboard(input: FinancialReportPeriod): Promise<FinancialDashboard>;
}

/** Avisos de mudanca nos titulos e jobs de integracao do workspace (tempo real). */
export interface FinancialChangeFeed {
  watch(
    workspaceId: string,
    handlers: { onChange(): void; onReconnected(): void; onDisconnected(): void },
  ): () => void;
}
