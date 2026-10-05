import { supabase } from "@/lib/supabase";
import type {
  CashFlowEntry,
  CashFlowSettlementBatchDetails,
  CashFlowSummary,
  Dre12MonthStatement,
  DreDetail,
  DrePeriodStatement,
  DreSummary,
  FinancialDashboard,
  FinancialReportPeriod,
} from "./types";
import { perfCount, perfStart } from "@/lib/performance";

const financialDashboardInFlight = new Map<string, Promise<FinancialDashboard>>();

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

export async function getDre12MonthStatement(input: {
  workspaceId: string;
  year: number;
  basis: "accrual" | "cash";
  costCenterId?: string | null;
}): Promise<Dre12MonthStatement> {
  const { data, error } = await supabase.rpc("get_dre_12_month_statement", { p_payload: input });
  fail("Nao foi possivel carregar o demonstrativo gerencial", error);
  return numberify(data as Dre12MonthStatement);
}

export async function getDrePeriodStatement(input: {
  workspaceId: string;
  startDate: string;
  endDate: string;
  basis: "accrual" | "cash";
  costCenterId?: string | null;
  vehicleId?: string | null;
}): Promise<DrePeriodStatement> {
  const { data, error } = await supabase.rpc("get_dre_period_statement", { p_payload: input });
  fail("Nao foi possivel carregar a DRE do periodo", error);
  return numberify(data as DrePeriodStatement);
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
  const entries = payload.entries ?? [];
  if (input.mode !== "forecast") {
    const settlementIds = entries
      .map((entry) => entry.settlement_id)
      .filter((id): id is string => Boolean(id));
    if (settlementIds.length) {
      const { data: batchRows, error: batchError } = await supabase
        .from("financial_settlements")
        .select("id,batch_id,batch_name")
        .in("id", settlementIds);
      if (!batchError) {
        const batchBySettlement = new Map(
          (batchRows ?? []).map((row) => [row.id, row]),
        );
        return entries.map((entry) => {
          const batch = entry.settlement_id
            ? batchBySettlement.get(entry.settlement_id)
            : undefined;
          return {
            ...entry,
            batch_id: batch?.batch_id ?? null,
            batch_name: batch?.batch_name ?? null,
          };
        });
      }
    }
  }
  return entries;
}

export async function getCashFlowSettlementBatchDetails(
  batchId: string,
): Promise<CashFlowSettlementBatchDetails> {
  const { data, error } = await supabase.rpc("get_cash_flow_settlement_batch_details", {
    p_batch_id: batchId,
  });
  fail("Nao foi possivel carregar os detalhes do pagamento", error);
  return numberify(data as CashFlowSettlementBatchDetails);
}

export async function getFinancialDashboard(
  input: FinancialReportPeriod,
): Promise<FinancialDashboard> {
  const key = JSON.stringify(input);
  const current = financialDashboardInFlight.get(key);
  if (current) {
    perfCount("financial:dashboard:deduplicated");
    return current;
  }

  const request = (async () => {
    const finish = perfStart("financial:rpc:get_financial_dashboard");
    try {
      const { data, error } = await supabase.rpc("get_financial_dashboard", { p_payload: input });
      fail("Nao foi possivel carregar o dashboard financeiro", error);
      return numberify(data as FinancialDashboard);
    } finally {
      finish();
      financialDashboardInFlight.delete(key);
    }
  })();
  financialDashboardInFlight.set(key, request);
  return request;
}
