// Adaptadores Supabase do financeiro, conferidos pelo compilador contra as portas:
// se uma RPC mudar de assinatura sem a porta acompanhar, o build falha aqui.
import type {
  FinancialDocumentsPort,
  FinancialMasterDataPort,
  FinancialRecurringPort,
  FinancialReportsPort,
  PayrollPort,
  ProfitabilityPort,
} from "@/modules/financial/application/ports";
import * as documents from "@/modules/financial/infrastructure/financialDocuments";
import * as masterData from "@/modules/financial/infrastructure/financialMasterData";
import * as recurring from "@/modules/financial/infrastructure/financialRecurring";
import * as payroll from "@/modules/financial/infrastructure/payroll";
import * as profitability from "@/modules/financial/infrastructure/profitability";
import * as reports from "@/modules/financial/infrastructure/reports";

export const supabaseFinancialDocuments: FinancialDocumentsPort = documents;
export const supabaseFinancialMasterData: FinancialMasterDataPort = masterData;
export const supabaseFinancialRecurring: FinancialRecurringPort = recurring;
export const supabasePayroll: PayrollPort = payroll;
export const supabaseProfitability: ProfitabilityPort = profitability;
export const supabaseFinancialReports: FinancialReportsPort = reports;
