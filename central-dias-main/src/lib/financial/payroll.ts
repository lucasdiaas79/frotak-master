import { supabase } from "@/lib/supabase";
import type {
  EmployeeAdvance,
  EmployeeFinancialProfile,
  EmployeeFinancialProfileInput,
  PayrollEntry,
  PayrollEntryInput,
  PayrollItem,
  PayrollItemInput,
} from "./types";

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableString(value: unknown) {
  return value ? String(value) : null;
}

function mapProfile(row: Record<string, unknown>): EmployeeFinancialProfile {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    displayName: String(row.display_name),
    driverId: nullableString(row.driver_id),
    profileId: nullableString(row.profile_id),
    businessPartnerId: nullableString(row.business_partner_id),
    jobTitle: nullableString(row.job_title),
    baseSalary: numberValue(row.base_salary),
    defaultCostCenterId: String(row.default_cost_center_id),
    defaultChartAccountId: String(row.default_chart_account_id),
    defaultPayDay: numberValue(row.default_pay_day),
    admissionDate: nullableString(row.admission_date),
    active: Boolean(row.active),
    notes: nullableString(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapItem(row: Record<string, unknown>): PayrollItem {
  return {
    id: String(row.id),
    itemType: row.itemType as PayrollItem["itemType"],
    direction: row.direction as PayrollItem["direction"],
    description: String(row.description),
    amount: numberValue(row.amount),
    employeeAdvanceId: nullableString(row.employeeAdvanceId),
    sourceType: nullableString(row.sourceType),
    sourceId: nullableString(row.sourceId),
    sourceEvent: nullableString(row.sourceEvent),
    createdAt: String(row.createdAt),
  };
}

function mapEntry(row: Record<string, unknown>): PayrollEntry {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    periodId: String(row.period_id),
    employeeProfileId: String(row.employee_profile_id),
    employeeNameSnapshot: String(row.employee_name_snapshot),
    employeeDisplayName: String(row.employee_display_name),
    jobTitleSnapshot: nullableString(row.job_title_snapshot),
    baseSalarySnapshot: numberValue(row.base_salary_snapshot),
    costCenterId: String(row.cost_center_id),
    costCenterName: nullableString(row.cost_center_name),
    chartAccountId: String(row.chart_account_id),
    chartAccountName: nullableString(row.chart_account_name),
    dueDate: String(row.due_date),
    competenceMonth: String(row.competence_month),
    status: row.status as PayrollEntry["status"],
    grossAmount: numberValue(row.gross_amount),
    deductionAmount: numberValue(row.deduction_amount),
    netAmount: numberValue(row.net_amount),
    financialDocumentId: nullableString(row.financial_document_id),
    financialDocumentStatus: row.financial_document_status
      ? (row.financial_document_status as PayrollEntry["financialDocumentStatus"])
      : null,
    items: Array.isArray(row.items)
      ? (row.items as Array<Record<string, unknown>>).map(mapItem)
      : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAdvance(row: Record<string, unknown>): EmployeeAdvance {
  return {
    id: String(row.id),
    employeeProfileId: String(row.employee_profile_id),
    employeeDisplayName: String(row.employee_display_name),
    financialDocumentId: nullableString(row.financial_document_id),
    amount: numberValue(row.amount),
    paidOn: String(row.paid_on),
    description: String(row.description),
    status: row.status as EmployeeAdvance["status"],
    appliedPayrollItemId: nullableString(row.applied_payroll_item_id),
    notes: nullableString(row.notes),
  };
}

export async function listEmployeeFinancialProfiles(): Promise<EmployeeFinancialProfile[]> {
  const { data, error } = await supabase
    .from("employee_financial_profiles")
    .select("*")
    .order("active", { ascending: false })
    .order("display_name");
  fail("Nao foi possivel carregar funcionarios financeiros", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapProfile);
}

export async function saveEmployeeFinancialProfile(input: EmployeeFinancialProfileInput) {
  const { data, error } = await supabase.rpc("save_employee_financial_profile", {
    p_payload: input,
  });
  fail("Nao foi possivel salvar funcionario financeiro", error);
  return data as string;
}

export async function listPayrollEntries(): Promise<PayrollEntry[]> {
  const { data, error } = await supabase
    .from("payroll_entries_overview")
    .select("*")
    .order("competence_month", { ascending: false })
    .order("employee_name_snapshot");
  fail("Nao foi possivel carregar a folha gerencial", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapEntry);
}

export async function createPayrollEntry(input: PayrollEntryInput) {
  const { data, error } = await supabase.rpc("create_payroll_entry", { p_payload: input });
  fail("Nao foi possivel criar lancamento de folha", error);
  return data as string;
}

export async function savePayrollItem(input: PayrollItemInput) {
  const { data, error } = await supabase.rpc("save_payroll_item", { p_payload: input });
  fail("Nao foi possivel salvar item da folha", error);
  return data as string;
}

export async function deletePayrollItem(id: string) {
  const { error } = await supabase.rpc("delete_payroll_item", { p_item_id: id });
  fail("Nao foi possivel remover item da folha", error);
}

export async function calculatePayrollEntry(id: string) {
  const { error } = await supabase.rpc("calculate_payroll_entry", { p_entry_id: id });
  fail("Nao foi possivel calcular a folha", error);
}

export async function approvePayrollEntry(id: string) {
  const { error } = await supabase.rpc("approve_payroll_entry", { p_entry_id: id });
  fail("Nao foi possivel aprovar a folha", error);
}

export async function postPayrollEntry(id: string) {
  const { data, error } = await supabase.rpc("post_payroll_entry", { p_entry_id: id });
  fail("Nao foi possivel postar a folha", error);
  return data as { documentId: string; created: boolean };
}

export async function voidPayrollEntry(id: string, reason: string) {
  const { error } = await supabase.rpc("void_payroll_entry", {
    p_entry_id: id,
    p_reason: reason,
  });
  fail("Nao foi possivel cancelar a folha", error);
}

export async function listEmployeeAdvances(): Promise<EmployeeAdvance[]> {
  const { data, error } = await supabase
    .from("employee_advances_overview")
    .select("*")
    .order("paid_on", { ascending: false });
  fail("Nao foi possivel carregar adiantamentos", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapAdvance);
}

export async function createEmployeeAdvance(input: {
  workspaceId: string;
  employeeProfileId: string;
  amount: number;
  paidOn: string;
  description: string;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("create_employee_advance", { p_payload: input });
  fail("Nao foi possivel criar adiantamento", error);
  return data as string;
}
