import { canReadFinancial, type FrotakAiContext } from "@/lib/frotakAiContext";
import type { getSupabaseServerClient } from "@/lib/frotakAiContext";

// Veiculos sem viagem e rendimento da frota. Tudo e calculado aqui com o token do usuario
// (RLS); a IA so repete. O motivo vem do que o sistema ja sabe (manutencao, motorista,
// frete planejado) ou do que o gestor registrou com registrar_motivo_parado.

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;
type Row = Record<string, unknown>;

export const FROTAK_AI_IDLE_REASON_EVENT = "motivo_parado";
export const FROTAK_AI_IDLE_DEFAULT_HOURS = 24;

const DAY_MS = 86_400_000;
// O Brasil nao tem horario de verao desde 2019: o dia operacional e o de Sao Paulo (UTC-3).
const BRAZIL_OFFSET_MS = 3 * 3_600_000;

const MAINTENANCE_STATUSES = new Set(["parado-quebrado", "manutencao", "disponivel-oficina"]);
const MAINTENANCE_SITUATIONS = new Set(["quebrado", "manutencao", "disponivel-oficina"]);

export type FrotakAiIdleVehicle = {
  placa: string;
  motorista: string | null;
  dias_parado: number | null;
  horas_parado: number | null;
  ultima_viagem: string | null;
  situacao: string;
  local: string | null;
  motivo: string;
  origem_motivo: "gestor" | "sistema" | "desconhecido";
  precisa_motivo: boolean;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function time(value: unknown) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function brazilDay(ms: number) {
  return new Date(ms - BRAZIL_OFFSET_MS).toISOString().slice(0, 10);
}

function brazilDate(ms: number | null) {
  return ms === null ? null : brazilDay(ms);
}

function tripEnd(row: Row) {
  return time(row.completed_at) ?? time(row.delivered_at);
}

async function selectAll(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

function latestBy<T extends Row>(rows: T[], key: string, timeField: (row: T) => number | null) {
  const map = new Map<string, { row: T; at: number }>();
  rows.forEach((row) => {
    const id = text(row[key]);
    const at = timeField(row);
    if (!id || at === null) return;
    const current = map.get(id);
    if (!current || at > current.at) map.set(id, { row, at });
  });
  return map;
}

function systemReason(input: {
  vehicle: Row;
  driver: Row | null;
  plannedFreight: boolean;
  driverReturnAt: number | null;
}) {
  const { vehicle, driver, plannedFreight, driverReturnAt } = input;
  const status = String(vehicle.status ?? "");
  const situation = String(vehicle.vehicle_situation ?? "");
  if (MAINTENANCE_STATUSES.has(status) || MAINTENANCE_SITUATIONS.has(situation)) {
    return {
      motivo:
        status === "parado-quebrado" || situation === "quebrado"
          ? "quebrado"
          : "em manutencao ou na oficina",
      precisa: false,
    };
  }
  if (plannedFreight) return { motivo: "frete planejado, ainda nao iniciado", precisa: false };
  if (!vehicle.driver_id || status === "aguardando-motorista") {
    return { motivo: "sem motorista vinculado", precisa: false };
  }
  if (driver && driver.active === false) return { motivo: "motorista inativo", precisa: false };
  if (driverReturnAt !== null) {
    return {
      motivo: `motorista de folga desde ${brazilDay(driverReturnAt)} (retorno para casa registrado)`,
      precisa: false,
    };
  }
  if (status === "parado-aguardando-carga") return { motivo: "aguardando carga", precisa: false };
  if (status === "parado-descarregando") return { motivo: "descarregando", precisa: false };
  // Disponivel no patio ou aguardando comando, com motorista: o sistema nao sabe o porque.
  return { motivo: "sem frete alocado e sem motivo registrado", precisa: true };
}

export async function listIdleVehicles(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  options: { hours?: number; limit?: number } = {},
) {
  const hours = Math.max(
    1,
    Math.min(24 * 90, Math.trunc(options.hours ?? FROTAK_AI_IDLE_DEFAULT_HOURS)),
  );
  const limit = Math.max(1, Math.min(80, Math.trunc(options.limit ?? 30)));
  const now = Date.now();

  const [vehicles, openFreights] = await Promise.all([
    selectAll(
      supabase
        .from("vehicles")
        .select(
          "id, plate, status, vehicle_situation, current_freight_id, driver_id, city, state, last_transition_at, created_at",
        )
        .eq("tenant_id", context.tenantId)
        .limit(1000),
    ),
    selectAll(
      supabase
        .from("freights")
        .select("vehicle_id, lifecycle_status")
        .eq("tenant_id", context.tenantId)
        .in("lifecycle_status", ["active", "planned"])
        .not("vehicle_id", "is", null)
        .limit(2000),
    ),
  ]);

  const activeVehicles = new Set(
    openFreights
      .filter((row) => row.lifecycle_status === "active")
      .map((row) => String(row.vehicle_id)),
  );
  const plannedVehicles = new Set(
    openFreights
      .filter((row) => row.lifecycle_status === "planned")
      .map((row) => String(row.vehicle_id)),
  );
  const candidates = vehicles.filter(
    (row) =>
      !row.current_freight_id &&
      row.vehicle_situation !== "em-rota" &&
      !activeVehicles.has(String(row.id)),
  );
  if (!candidates.length) {
    return {
      horas_minimas: hours,
      quantidade: 0,
      sem_motivo: 0,
      veiculos: [] as FrotakAiIdleVehicle[],
    };
  }

  const vehicleIds = candidates.map((row) => String(row.id));
  const driverIds = Array.from(
    new Set(candidates.map((row) => text(row.driver_id)).filter((id): id is string => !!id)),
  );
  const [lastTrips, reasons, drivers, cycles] = await Promise.all([
    selectAll(
      supabase
        .from("freights")
        .select("vehicle_id, completed_at, delivered_at")
        .eq("tenant_id", context.tenantId)
        .eq("lifecycle_status", "completed")
        .in("vehicle_id", vehicleIds)
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(3000),
    ),
    selectAll(
      supabase
        .from("fleet_events")
        .select("vehicle_id, description, timestamp")
        .eq("tenant_id", context.tenantId)
        .eq("event_type", FROTAK_AI_IDLE_REASON_EVENT)
        .in("vehicle_id", vehicleIds)
        .gte("timestamp", new Date(now - 90 * DAY_MS).toISOString())
        .order("timestamp", { ascending: false })
        .limit(1000),
    ),
    driverIds.length
      ? selectAll(
          supabase
            .from("drivers")
            .select("id, name, active")
            .eq("tenant_id", context.tenantId)
            .in("id", driverIds),
        )
      : Promise.resolve([] as Row[]),
    driverIds.length
      ? selectAll(
          supabase
            .from("driver_trip_cycles")
            .select("driver_id, status, closed_at, close_reason, started_at")
            .eq("tenant_id", context.tenantId)
            .in("driver_id", driverIds)
            .gte("started_at", new Date(now - 120 * DAY_MS).toISOString())
            .limit(2000),
        )
      : Promise.resolve([] as Row[]),
  ]);

  const lastTripByVehicle = latestBy(lastTrips, "vehicle_id", tripEnd);
  const reasonByVehicle = latestBy(reasons, "vehicle_id", (row) => time(row.timestamp));
  const driverById = new Map(drivers.map((row) => [String(row.id), row]));
  const latestCycleByDriver = latestBy(cycles, "driver_id", (row) =>
    row.status === "open" ? Number.POSITIVE_INFINITY : time(row.closed_at),
  );

  const idle: FrotakAiIdleVehicle[] = [];
  candidates.forEach((vehicle) => {
    const id = String(vehicle.id);
    const lastTripAt = lastTripByVehicle.get(id)?.at ?? null;
    // Sem viagem registrada: conta desde a ultima mudanca de situacao (ou do cadastro).
    const since = lastTripAt ?? time(vehicle.last_transition_at) ?? time(vehicle.created_at);
    const idleHours = since === null ? null : (now - since) / 3_600_000;
    if (idleHours !== null && idleHours < hours) return;

    const driverId = text(vehicle.driver_id);
    const driver = driverId ? (driverById.get(driverId) ?? null) : null;
    const cycle = driverId ? latestCycleByDriver.get(driverId) : undefined;
    const driverReturnAt =
      cycle && cycle.row.status === "closed" && cycle.row.close_reason === "driver_return_completed"
        ? cycle.at
        : null;
    const registered = reasonByVehicle.get(id);
    const registeredValid = registered && (since === null || registered.at >= since);
    const fromSystem = systemReason({
      vehicle,
      driver,
      plannedFreight: plannedVehicles.has(id),
      driverReturnAt,
    });

    idle.push({
      placa: String(vehicle.plate ?? ""),
      motorista: text(driver?.name),
      dias_parado: idleHours === null ? null : round(idleHours / 24),
      horas_parado: idleHours === null ? null : Math.round(idleHours),
      ultima_viagem: brazilDate(lastTripAt),
      situacao: String(vehicle.vehicle_situation ?? vehicle.status ?? ""),
      local: [text(vehicle.city), text(vehicle.state)].filter(Boolean).join("/") || null,
      motivo: registeredValid
        ? `${text(registered.row.description) ?? "motivo registrado"} (informado em ${brazilDay(registered.at)})`
        : fromSystem.motivo,
      origem_motivo: registeredValid ? "gestor" : fromSystem.precisa ? "desconhecido" : "sistema",
      precisa_motivo: !registeredValid && fromSystem.precisa,
    });
  });

  idle.sort(
    (a, b) =>
      (b.horas_parado ?? Number.MAX_SAFE_INTEGER) - (a.horas_parado ?? Number.MAX_SAFE_INTEGER),
  );
  const withoutReason = idle.filter((row) => row.precisa_motivo).length;
  return {
    horas_minimas: hours,
    quantidade: idle.length,
    sem_motivo: withoutReason,
    veiculos: idle.slice(0, limit),
    ...(withoutReason
      ? {
          instrucao:
            "Para os veiculos com precisa_motivo, pergunte ao gestor por que estao parados e, quando ele responder, use registrar_motivo_parado com a placa e o motivo.",
        }
      : {}),
  };
}

type Interval = { start: number; end: number };

function coveredDays(intervals: Interval[], windowStart: number, windowEnd: number) {
  const days = new Set<string>();
  intervals.forEach(({ start, end }) => {
    const from = Math.max(start, windowStart);
    const to = Math.min(end, windowEnd);
    if (to < from) return;
    for (let at = from; at <= to; at += DAY_MS) days.add(brazilDay(at));
    days.add(brazilDay(to));
  });
  return days.size;
}

function windowDays(windowStart: number, windowEnd: number) {
  return Math.max(
    1,
    Math.round((Date.parse(brazilDay(windowEnd)) - Date.parse(brazilDay(windowStart))) / DAY_MS) +
      1,
  );
}

export async function computeFleetUtilization(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  options: { days?: number; groupBy?: "veiculo" | "motorista"; limit?: number } = {},
) {
  const days = Math.max(7, Math.min(180, Math.trunc(options.days ?? 30)));
  const groupBy = options.groupBy === "motorista" ? "motorista" : "veiculo";
  const limit = Math.max(1, Math.min(80, Math.trunc(options.limit ?? 20)));
  const now = Date.now();
  // Janela em dias inteiros de Sao Paulo, terminando hoje.
  const windowStart = Date.parse(brazilDay(now - (days - 1) * DAY_MS)) + BRAZIL_OFFSET_MS;
  const windowStartIso = new Date(windowStart).toISOString();

  const [freights, vehicles, drivers] = await Promise.all([
    selectAll(
      supabase
        .from("freights")
        .select(
          "vehicle_id, driver_id, started_at, completed_at, delivered_at, lifecycle_status, freight_value",
        )
        .eq("tenant_id", context.tenantId)
        .in("lifecycle_status", ["active", "completed"])
        .not("started_at", "is", null)
        .or(
          `lifecycle_status.eq.active,completed_at.gte.${windowStartIso},delivered_at.gte.${windowStartIso}`,
        )
        .limit(5000),
    ),
    selectAll(
      supabase
        .from("vehicles")
        .select("id, plate, created_at")
        .eq("tenant_id", context.tenantId)
        .limit(1000),
    ),
    selectAll(
      supabase
        .from("drivers")
        .select("id, name, active, created_at")
        .eq("tenant_id", context.tenantId)
        .limit(1000),
    ),
  ]);

  const intervals = new Map<string, Interval[]>();
  let revenue = 0;
  let revenueTripDays = 0;
  const field = groupBy === "veiculo" ? "vehicle_id" : "driver_id";
  freights.forEach((row) => {
    const start = time(row.started_at);
    if (start === null) return;
    const end = row.lifecycle_status === "active" ? now : (tripEnd(row) ?? start);
    const key = text(row[field]);
    if (key) intervals.set(key, [...(intervals.get(key) ?? []), { start, end }]);
    const value = Number(row.freight_value ?? 0);
    if (row.lifecycle_status === "completed" && Number.isFinite(value) && value > 0) {
      revenue += value;
      revenueTripDays += coveredDays([{ start, end }], start, end);
    }
  });

  const subjects =
    groupBy === "veiculo"
      ? vehicles.map((row) => ({
          id: String(row.id),
          nome: String(row.plate ?? ""),
          created: time(row.created_at),
        }))
      : drivers
          .filter((row) => row.active !== false || intervals.has(String(row.id)))
          .map((row) => ({
            id: String(row.id),
            nome: String(row.name ?? ""),
            created: time(row.created_at),
          }));

  const revenuePerDay = revenueTripDays > 0 ? revenue / revenueTripDays : 0;
  const showMoney = canReadFinancial(context) && revenuePerDay > 0;
  let totalDays = 0;
  let totalIdle = 0;
  const items = subjects.map((subject) => {
    const start = Math.max(windowStart, subject.created ?? windowStart);
    const total = windowDays(start, now);
    const onTrip = Math.min(total, coveredDays(intervals.get(subject.id) ?? [], start, now));
    const idleDays = total - onTrip;
    totalDays += total;
    totalIdle += idleDays;
    return {
      nome: subject.nome,
      dias_no_periodo: total,
      dias_em_viagem: onTrip,
      dias_parados: idleDays,
      percentual_parado: round((idleDays / total) * 100),
      ...(showMoney
        ? { frete_nao_feito_estimado: Math.round(idleDays * revenuePerDay * 100) / 100 }
        : {}),
    };
  });
  items.sort(
    (a, b) => b.percentual_parado - a.percentual_parado || b.dias_parados - a.dias_parados,
  );

  return {
    periodo: { dias: days, inicio: brazilDay(windowStart), fim: brazilDay(now) },
    agrupado_por: groupBy,
    frota: {
      quantidade: items.length,
      dias_parados: totalIdle,
      percentual_parado: totalDays ? round((totalIdle / totalDays) * 100) : 0,
      ...(showMoney
        ? {
            receita_media_por_dia_de_viagem: Math.round(revenuePerDay * 100) / 100,
            frete_nao_feito_estimado: Math.round(totalIdle * revenuePerDay * 100) / 100,
          }
        : {}),
    },
    itens: items.slice(0, limit),
    observacao: showMoney
      ? "Dia parado = dia sem nenhum frete em andamento. Frete nao feito e estimativa: dias parados vezes a receita media por dia de viagem da frota no periodo."
      : "Dia parado = dia sem nenhum frete em andamento.",
  };
}
