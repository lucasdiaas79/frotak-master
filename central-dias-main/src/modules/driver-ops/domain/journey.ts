// Regras de jornada do motorista profissional usadas no espelho de ponto da central.
// Lei 13.103/2015, CTB art. 67-C e STF ADI 5322 (tempo de espera conta como jornada).
// O resultado e conferencia gerencial: nao substitui o REP-P da Portaria MTE 671/2021.

export type PunchActivity =
  "direcao" | "espera" | "carga_descarga" | "refeicao" | "descanso" | "trabalho";

export type Punch = {
  id: string;
  activity: PunchActivity;
  started_at: string;
  ended_at: string | null;
  source: string;
  reason: string | null;
  adjustment_status: string | null;
  adjustment_reason: string | null;
  original_started_at: string | null;
};

export type WorkDay = {
  id: string;
  driver_id: string;
  work_date: string;
  started_at: string;
  ended_at: string | null;
  confirmed_by_driver_at: string | null;
  driver_punches: Punch[];
};

export const RULES = {
  maxContinuousDrivingMin: 330, // 5h30
  minDrivingBreakMin: 30,
  regularDayMin: 480, // 8h
  maxOvertimeMin: 120, // 2h (ate 4h por convencao coletiva)
  mealAfterMin: 360, // 6h
  minMealMin: 60,
  minInterDayMin: 660, // 11h
};

export const ACTIVITY_LABEL: Record<PunchActivity, string> = {
  direcao: "Direção",
  espera: "Espera",
  carga_descarga: "Carga e descarga",
  refeicao: "Refeição",
  descanso: "Descanso",
  trabalho: "Outros trabalhos",
};

export type DaySummary = {
  totalMin: number;
  workMin: number;
  drivingMin: number;
  waitingMin: number;
  mealMin: number;
  restMin: number;
  overtimeMin: number;
  maxContinuousDrivingMin: number;
  interDayMin: number | null;
  alerts: { level: "alerta" | "violacao"; text: string }[];
};

const minutes = (a: string, b: string | null, now: number) =>
  Math.max(0, Math.round(((b ? new Date(b).getTime() : now) - new Date(a).getTime()) / 60_000));

export function summarizeDay(
  day: WorkDay,
  previousEnd: string | null,
  now = Date.now(),
): DaySummary {
  const punches = [...day.driver_punches].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const by: Record<PunchActivity, number> = {
    direcao: 0,
    espera: 0,
    carga_descarga: 0,
    refeicao: 0,
    descanso: 0,
    trabalho: 0,
  };
  let continuous = 0;
  let maxContinuous = 0;
  let workedBeforeMeal = 0;
  let hadMealAfterSix = false;
  for (const p of punches) {
    const m = minutes(p.started_at, p.ended_at ?? day.ended_at, now);
    by[p.activity] += m;
    if (p.activity === "direcao") {
      continuous += m;
      maxContinuous = Math.max(maxContinuous, continuous);
    } else if (
      (p.activity === "descanso" || p.activity === "refeicao") &&
      m >= RULES.minDrivingBreakMin
    ) {
      continuous = 0;
    }
    if (p.activity === "refeicao" && m >= RULES.minMealMin) hadMealAfterSix = true;
    if (p.activity !== "refeicao" && p.activity !== "descanso" && !hadMealAfterSix)
      workedBeforeMeal += m;
  }
  const totalMin = minutes(day.started_at, day.ended_at, now);
  const workMin = by.direcao + by.espera + by.carga_descarga + by.trabalho;
  const overtimeMin = Math.max(0, workMin - RULES.regularDayMin);
  const interDayMin = previousEnd ? minutes(previousEnd, day.started_at, now) : null;

  const alerts: DaySummary["alerts"] = [];
  if (maxContinuous > RULES.maxContinuousDrivingMin) {
    alerts.push({
      level: "violacao",
      text: `Direção contínua de ${fmtMin(maxContinuous)} (máximo 5h30)`,
    });
  }
  if (overtimeMin > RULES.maxOvertimeMin) {
    alerts.push({
      level: "violacao",
      text: `Hora extra de ${fmtMin(overtimeMin)} (máximo 2h, ou 4h com convenção)`,
    });
  } else if (overtimeMin > 0) {
    alerts.push({ level: "alerta", text: `Hora extra de ${fmtMin(overtimeMin)}` });
  }
  if (workedBeforeMeal > RULES.mealAfterMin && !hadMealAfterSix) {
    alerts.push({ level: "violacao", text: "Mais de 6h sem 1h de refeição" });
  }
  if (interDayMin != null && interDayMin < RULES.minInterDayMin) {
    alerts.push({ level: "violacao", text: `Interjornada de ${fmtMin(interDayMin)} (mínimo 11h)` });
  }
  if (punches.some((p) => p.adjustment_status === "pendente")) {
    alerts.push({ level: "alerta", text: "Ajuste de marcação aguardando aprovação" });
  }

  return {
    totalMin,
    workMin,
    drivingMin: by.direcao,
    waitingMin: by.espera,
    mealMin: by.refeicao,
    restMin: by.descanso,
    overtimeMin,
    maxContinuousDrivingMin: maxContinuous,
    interDayMin,
    alerts,
  };
}

export function fmtMin(total: number) {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
