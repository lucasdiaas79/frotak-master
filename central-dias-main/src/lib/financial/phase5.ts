import { supabase } from "@/lib/supabase";
import type {
  FinancialRecurringGenerationResult,
  FinancialRecurringRule,
  FinancialRecurringRuleInput,
} from "./types";

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRule(row: Record<string, unknown>): FinancialRecurringRule {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    kind: row.kind as FinancialRecurringRule["kind"],
    name: String(row.name),
    partnerId: row.partner_id ? String(row.partner_id) : null,
    partnerName: row.partner_name ? String(row.partner_name) : null,
    employeeName: row.employee_name ? String(row.employee_name) : null,
    driverId: row.driver_id ? String(row.driver_id) : null,
    driverName: row.driver_name ? String(row.driver_name) : null,
    vehicleId: row.vehicle_id ? String(row.vehicle_id) : null,
    vehiclePlate: row.vehicle_plate ? String(row.vehicle_plate) : null,
    costCenterId: String(row.cost_center_id),
    costCenterName: row.cost_center_name ? String(row.cost_center_name) : null,
    chartAccountId: String(row.chart_account_id),
    chartAccountName: row.chart_account_name ? String(row.chart_account_name) : null,
    amount: numberValue(row.amount),
    dueDay: numberValue(row.due_day),
    startMonth: String(row.start_month),
    endMonth: row.end_month ? String(row.end_month) : null,
    autoPost: Boolean(row.auto_post),
    status: row.status as FinancialRecurringRule["status"],
    notes: row.notes ? String(row.notes) : null,
    generatedCount: numberValue(row.generated_count),
    lastGeneratedCompetence: row.last_generated_competence
      ? String(row.last_generated_competence)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listFinancialRecurringRules(): Promise<FinancialRecurringRule[]> {
  const { data, error } = await supabase
    .from("financial_recurring_rules_overview")
    .select("*")
    .order("status")
    .order("name");
  fail("Nao foi possivel carregar salarios e recorrencias", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRule);
}

export async function saveFinancialRecurringRule(input: FinancialRecurringRuleInput) {
  const { data, error } = await supabase.rpc("save_financial_recurring_rule", {
    p_payload: input,
  });
  fail("Nao foi possivel salvar a recorrencia financeira", error);
  return data as string;
}

export async function setFinancialRecurringRuleStatus(
  id: string,
  workspaceId: string,
  status: FinancialRecurringRule["status"],
) {
  const { data, error } = await supabase.rpc("save_financial_recurring_rule", {
    p_payload: { id, workspaceId, status },
  });
  fail("Nao foi possivel atualizar a recorrencia financeira", error);
  return data as string;
}

export async function generateFinancialRecurringDocuments(
  workspaceId: string,
  competenceMonth: string,
  ruleId?: string,
): Promise<FinancialRecurringGenerationResult> {
  const { data, error } = await supabase.rpc("generate_financial_recurring_documents", {
    p_workspace_id: workspaceId,
    p_competence_month: competenceMonth,
    p_rule_id: ruleId ?? null,
  });
  fail("Nao foi possivel gerar os titulos recorrentes", error);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    generated: numberValue(row.generated),
    skipped: numberValue(row.skipped),
    documentIds: Array.isArray(row.documentIds) ? row.documentIds.map(String) : [],
  };
}
