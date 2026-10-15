import { canReadFinancial, type FrotakAiContext } from "@/lib/frotakAiContext";
import type { getSupabaseServerClient } from "@/lib/frotakAiContext";

// Alertas calculados na hora, com o token do usuario (RLS). Alimentam a ferramenta
// "alertas" e o briefing do dia; nenhum numero e calculado pela IA.

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;
type Row = Record<string, unknown>;

export type FrotakAiAlert = {
  tipo: string;
  titulo: string;
  quantidade: number;
  valor?: number;
  itens?: Row[];
};

const LONG_FREIGHT_DAYS = 7;
const NO_SIGNAL_HOURS = 24;
const FUEL_PRICE_TOLERANCE = 1.15;

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function dateOnly(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function plates(supabase: SupabaseServer, context: FrotakAiContext, ids: string[]) {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 200);
  if (!unique.length) return map;
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, plate")
    .eq("tenant_id", context.tenantId)
    .in("id", unique);
  if (error) throw new Error(error.message);
  ((data ?? []) as Row[]).forEach((row) => map.set(String(row.id), String(row.plate ?? "")));
  return map;
}

async function stoppedVehicles(supabase: SupabaseServer, context: FrotakAiContext) {
  const { data, error, count } = await supabase
    .from("vehicles")
    .select("plate, vehicle_situation, status, city, state, last_transition_at", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .in("vehicle_situation", ["parado", "quebrado", "manutencao"])
    .order("last_transition_at", { ascending: true, nullsFirst: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return {
    tipo: "veiculos_parados",
    titulo: "Veiculos parados, quebrados ou em manutencao",
    quantidade: count ?? data?.length ?? 0,
    itens: (data ?? []) as Row[],
  } satisfies FrotakAiAlert;
}

async function vehiclesWithoutSignal(supabase: SupabaseServer, context: FrotakAiContext) {
  const limit = new Date(Date.now() - NO_SIGNAL_HOURS * 3_600_000).toISOString();
  const { data, error, count } = await supabase
    .from("vehicles")
    .select("plate, last_position_at, city", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .not("sascar_id", "is", null)
    .or(`last_position_at.is.null,last_position_at.lt.${limit}`)
    .order("last_position_at", { ascending: true, nullsFirst: true })
    .limit(10);
  if (error) throw new Error(error.message);
  return {
    tipo: "sem_sinal",
    titulo: `Rastreados sem posicao ha mais de ${NO_SIGNAL_HOURS}h`,
    quantidade: count ?? data?.length ?? 0,
    itens: (data ?? []) as Row[],
  } satisfies FrotakAiAlert;
}

async function longFreights(supabase: SupabaseServer, context: FrotakAiContext) {
  const { data, error, count } = await supabase
    .from("freights")
    .select("vehicle_id, freight_stage, started_at", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .eq("lifecycle_status", "active")
    .lt("started_at", isoDaysAgo(LONG_FREIGHT_DAYS))
    .order("started_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const plateById = await plates(
    supabase,
    context,
    rows.map((row) => String(row.vehicle_id ?? "")),
  );
  return {
    tipo: "fretes_longos",
    titulo: `Fretes ativos ha mais de ${LONG_FREIGHT_DAYS} dias`,
    quantidade: count ?? rows.length,
    itens: rows.map((row) => ({
      placa: plateById.get(String(row.vehicle_id)) ?? null,
      etapa: row.freight_stage,
      inicio: row.started_at,
    })),
  } satisfies FrotakAiAlert;
}

async function pendingAllowances(supabase: SupabaseServer, context: FrotakAiContext) {
  const { data, error, count } = await supabase
    .from("driver_trip_daily_allowances")
    .select("total_amount", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .eq("status", "submitted")
    .limit(1000);
  if (error) throw new Error(error.message);
  return {
    tipo: "diarias_pendentes",
    titulo: "Diarias de motorista aguardando aprovacao",
    quantidade: count ?? data?.length ?? 0,
    valor: round(
      ((data ?? []) as Row[]).reduce((sum, row) => sum + numberValue(row.total_amount), 0),
    ),
  } satisfies FrotakAiAlert;
}

async function fuelOutliers(supabase: SupabaseServer, context: FrotakAiContext) {
  const { data, error } = await supabase
    .from("fuel_records")
    .select("vehicle_plate, station, liters, amount, recorded_at")
    .eq("tenant_id", context.tenantId)
    .eq("fuel_type", "diesel_s10")
    .gte("recorded_at", isoDaysAgo(30))
    .gt("liters", 0)
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Row[])
    .map((row) => ({
      vehicle_plate: row.vehicle_plate,
      station: row.station,
      recorded_at: row.recorded_at,
      preco_litro: numberValue(row.amount) / numberValue(row.liters),
    }))
    .filter((row) => Number.isFinite(row.preco_litro) && row.preco_litro > 0);
  const reference = median(rows.map((row) => row.preco_litro));
  const outliers = rows
    .filter((row) => reference > 0 && row.preco_litro > reference * FUEL_PRICE_TOLERANCE)
    .sort((a, b) => b.preco_litro - a.preco_litro);
  return {
    tipo: "abastecimento_fora_do_padrao",
    titulo: "Abastecimentos de diesel com preco por litro acima do normal (30 dias)",
    quantidade: outliers.length,
    itens: outliers.slice(0, 5).map((row) => ({
      placa: row.vehicle_plate,
      posto: row.station,
      data: row.recorded_at,
      preco_litro: round(row.preco_litro),
      mediana_preco_litro: round(reference),
    })),
  } satisfies FrotakAiAlert;
}

async function installments(supabase: SupabaseServer, context: FrotakAiContext) {
  const { data, error } = await supabase
    .from("financial_installments")
    .select("balance, due_date, financial_documents!inner(direction)")
    .eq("tenant_id", context.tenantId)
    .in("status", ["open", "partially_settled"])
    .lte("due_date", dateOnly(7))
    .limit(2000);
  if (error) throw new Error(error.message);
  const today = dateOnly();
  const buckets: Record<string, { quantidade: number; valor: number }> = {};
  ((data ?? []) as Row[]).forEach((row) => {
    const document = Array.isArray(row.financial_documents)
      ? (row.financial_documents[0] as Row | undefined)
      : (row.financial_documents as Row | undefined);
    const direction = document?.direction === "receivable" ? "receber" : "pagar";
    const when = String(row.due_date) < today ? "vencidas" : "vencendo_7_dias";
    const key = `${when}_${direction}`;
    buckets[key] ??= { quantidade: 0, valor: 0 };
    buckets[key].quantidade += 1;
    buckets[key].valor += numberValue(row.balance);
  });
  const labels: Record<string, string> = {
    vencidas_pagar: "Contas a pagar vencidas",
    vencidas_receber: "Contas a receber vencidas",
    vencendo_7_dias_pagar: "Contas a pagar vencendo em 7 dias",
    vencendo_7_dias_receber: "Contas a receber vencendo em 7 dias",
  };
  return Object.entries(buckets).map(
    ([key, bucket]) =>
      ({
        tipo: key,
        titulo: labels[key] ?? key,
        quantidade: bucket.quantidade,
        valor: round(bucket.valor),
      }) satisfies FrotakAiAlert,
  );
}

export async function listFrotakAiAlerts(supabase: SupabaseServer, context: FrotakAiContext) {
  const checks: Array<Promise<FrotakAiAlert | FrotakAiAlert[]>> = [
    stoppedVehicles(supabase, context),
    vehiclesWithoutSignal(supabase, context),
    longFreights(supabase, context),
    pendingAllowances(supabase, context),
    fuelOutliers(supabase, context),
  ];
  if (canReadFinancial(context)) checks.push(installments(supabase, context));
  const settled = await Promise.allSettled(checks);
  const alerts = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((alert) => alert.quantidade > 0);
  const failures = settled.filter((result) => result.status === "rejected");
  failures.forEach((failure) =>
    console.error("[frotakAi] alert check failed", {
      tenantId: context.tenantId,
      message: failure.reason instanceof Error ? failure.reason.message : String(failure.reason),
    }),
  );
  if (failures.length === checks.length) {
    return { error: "Nao foi possivel calcular os alertas agora.", code: "ALERTS_FAILED" };
  }
  return {
    gerado_em: new Date().toISOString(),
    alertas: alerts,
    ...(failures.length ? { aviso: "Alguns alertas nao puderam ser verificados agora." } : {}),
  };
}
