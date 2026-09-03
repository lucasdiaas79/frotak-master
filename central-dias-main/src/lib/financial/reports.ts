import { supabase } from "@/lib/supabase";
import type {
  CashFlowEntry,
  CashFlowSummary,
  DreDetail,
  DreSummary,
  FinancialDashboard,
  FinancialReportPeriod,
} from "./types";

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function numberify<T>(value: T): T {
  if (Array.isArray(value)) return value.map(numberify) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (typeof item === "string" && /^-?\d+(\.\d+)?$/.test(item)) {
          return [key, Number(item)];
        }
        return [key, numberify(item)];
      }),
    ) as T;
  }
  return value;
}

export async function getDreSummary(input: FinancialReportPeriod): Promise<DreSummary> {
  const { data, error } = await supabase.rpc("get_dre_summary", { p_payload: input });
  fail("Nao foi possivel carregar a DRE gerencial", error);
  return numberify(data as DreSummary);
}

export async function getDreDetail(
  input: FinancialReportPeriod & { dreGroup?: string | null; chartAccountId?: string | null },
): Promise<DreDetail> {
  const { data, error } = await supabase.rpc("get_dre_detail", { p_payload: input });
  fail("Nao foi possivel carregar o detalhe da DRE", error);
  return numberify(data as DreDetail);
}

export async function getCashFlowSummary(
  input: FinancialReportPeriod & { financialAccountId?: string | null },
): Promise<CashFlowSummary> {
  const { data, error } = await supabase.rpc("get_cash_flow_summary", { p_payload: input });
  fail("Nao foi possivel carregar o fluxo de caixa", error);
  return numberify(data as CashFlowSummary);
}

export async function getCashFlowEntries(
  input: FinancialReportPeriod & {
    mode?: "realized" | "forecast";
    direction?: "receivable" | "payable" | null;
    financialAccountId?: string | null;
    sourceType?: string | null;
    chartAccountId?: string | null;
  },
): Promise<CashFlowEntry[]> {
  const { data, error } = await supabase.rpc("get_cash_flow_entries", { p_payload: input });
  fail("Nao foi possivel carregar os lancamentos do fluxo", error);
  const payload = numberify(data as { entries: CashFlowEntry[] });
  return payload.entries ?? [];
}

export async function getFinancialDashboard(
  input: FinancialReportPeriod,
): Promise<FinancialDashboard> {
  const { data, error } = await supabase.rpc("get_financial_dashboard", { p_payload: input });
  fail("Nao foi possivel carregar o dashboard financeiro", error);
  return numberify(data as FinancialDashboard);
}
