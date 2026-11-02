// Composicao do modulo financeiro no navegador. As telas importam daqui (e do domain);
// trocar o backend financeiro e trocar os adaptadores abaixo.
import { supabase } from "@/lib/supabase";
import type {
  FinancialChangeFeed,
  FinancialDocumentsPort,
  FinancialMasterDataPort,
  FinancialRecurringPort,
  PayrollPort,
  ProfitabilityPort,
  FinancialReportsPort,
} from "@/modules/financial/application/ports";
import { SupabaseFinancialChangeFeed } from "@/modules/financial/infrastructure/supabaseFinancialChangeFeed";
import {
  supabaseFinancialDocuments,
  supabaseFinancialMasterData,
  supabaseFinancialRecurring,
  supabasePayroll,
  supabaseProfitability,
  supabaseFinancialReports,
} from "@/modules/financial/infrastructure/supabaseFinancialAdapters";

const documents: FinancialDocumentsPort = supabaseFinancialDocuments;
const masterData: FinancialMasterDataPort = supabaseFinancialMasterData;
const recurring: FinancialRecurringPort = supabaseFinancialRecurring;
const payroll: PayrollPort = supabasePayroll;
const profitability: ProfitabilityPort = supabaseProfitability;
const reports: FinancialReportsPort = supabaseFinancialReports;
const changeFeed: FinancialChangeFeed = new SupabaseFinancialChangeFeed(supabase);

export const {
  clearFinancialAccessCache,
  getFinancialAccess,
  listFinancialDocuments,
  listFinancialDocumentsPage,
  getFinancialDocumentDetails,
  saveFinancialDocument,
  voidFinancialDocument,
  settleInstallment,
  reverseSettlement,
  listFinancialAccounts,
  saveFinancialAccount,
  listFinancialPartners,
  saveBusinessPartner,
  listFinancialChart,
  saveChartAccount,
  listFinancialCostCenters,
  saveCostCenter,
  listFinancialIntegrationJobs,
  getFinancialIntegrationSettings,
  saveFinancialIntegrationSettings,
  processFinancialIntegrations,
  getFinancialIntegrationHealth,
} = documents;

export const {
  listCanonicalFreights,
  listBusinessPartners,
  listChartOfAccounts,
  listCostCenters,
  findFinancialDocumentBySource,
} = masterData;

export const {
  listFinancialRecurringRules,
  saveFinancialRecurringRule,
  saveFinancialDocumentWithRecurring,
  setFinancialRecurringRuleStatus,
  generateFinancialRecurringDocuments,
  generateDueFinancialRecurringDocuments,
} = recurring;

export const {
  listEmployeeFinancialProfiles,
  saveEmployeeFinancialProfile,
  listPayrollEntries,
  createPayrollEntry,
  savePayrollItem,
  deletePayrollItem,
  calculatePayrollEntry,
  approvePayrollEntry,
  postPayrollEntry,
  voidPayrollEntry,
  listEmployeeAdvances,
  createEmployeeAdvance,
} = payroll;

export const {
  getFleetProfitabilitySummary,
  getVehicleProfitability,
  getFreightProfitability,
  getPartnerProfitability,
} = profitability;

export const {
  getDreSummary,
  getDreDetail,
  getDre12MonthStatement,
  getDrePeriodStatement,
  getCashFlowSummary,
  getCashFlowEntries,
  getCashFlowSettlementBatchDetails,
  getFinancialDashboard,
} = reports;

/** Avisos em tempo real das mudancas financeiras do workspace. */
export function watchFinancialChanges(
  workspaceId: string,
  handlers: Parameters<FinancialChangeFeed["watch"]>[1],
) {
  return changeFeed.watch(workspaceId, handlers);
}
