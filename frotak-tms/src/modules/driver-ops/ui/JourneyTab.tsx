import { useMemo, useState } from "react";
import { Check, Download, X } from "lucide-react";
import { FrotakEmptyState, FrotakSection } from "@/components/frotak/FrotakPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_LABEL,
  fmtMin,
  fmtTime,
  summarizeDay,
  type WorkDay,
} from "@/modules/driver-ops/domain/journey";
import {
  listDrivers,
  listWorkDays,
  previousDayEnds,
  reviewAdjustment,
} from "@/modules/driver-ops/infrastructure/opsRepository";
import { LoadError, StatusBadge, act, todayIso, useLoad } from "./shared";

const SOURCE_LABEL: Record<string, string> = {
  motorista: "Motorista",
  etapa: "Etapa do frete",
  cerca: "Cerca",
  voz: "Voz",
  ajuste: "Ajuste",
  central: "Central",
};

function weekAgo() {
  const d = new Date(Date.now() - 6 * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function JourneyTab() {
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(todayIso());
  const [driverId, setDriverId] = useState("todos");
  const drivers = useLoad(listDrivers, []);
  const days = useLoad(() => listWorkDays(from, to), [from, to], 60_000);
  const prev = useLoad(
    () => previousDayEnds([...new Set((days.data ?? []).map((d) => d.driver_id))], from),
    [days.data, from],
  );
  const names = useMemo(
    () => Object.fromEntries((drivers.data ?? []).map((d) => [d.id, d.name])),
    [drivers.data],
  );

  const rows = useMemo(() => {
    const list = (days.data ?? []).filter((d) => driverId === "todos" || d.driver_id === driverId);
    const byDriver: Record<string, WorkDay[]> = {};
    for (const d of days.data ?? []) (byDriver[d.driver_id] ??= []).push(d);
    return list.map((day) => {
      const own = byDriver[day.driver_id] ?? [];
      const idx = own.findIndex((d) => d.id === day.id);
      const previousEnd =
        idx > 0 ? (own[idx - 1]?.ended_at ?? null) : (prev.data?.[day.driver_id] ?? null);
      return { day, summary: summarizeDay(day, previousEnd) };
    });
  }, [days.data, driverId, prev.data]);

  const pending = rows.flatMap(({ day }) =>
    day.driver_punches
      .filter((p) => p.adjustment_status === "pendente")
      .map((p) => ({ day, punch: p })),
  );

  const exportCsv = () => {
    const header = [
      "Motorista",
      "Data",
      "Inicio",
      "Fim",
      "Jornada",
      "Direcao",
      "Espera",
      "Refeicao",
      "Descanso",
      "Hora extra",
      "Direcao continua max",
      "Interjornada",
      "Confirmado pelo motorista",
      "Alertas",
    ];
    const lines = rows.map(({ day, summary: s }) =>
      [
        names[day.driver_id] ?? day.driver_id,
        day.work_date,
        fmtTime(day.started_at),
        fmtTime(day.ended_at),
        fmtMin(s.workMin),
        fmtMin(s.drivingMin),
        fmtMin(s.waitingMin),
        fmtMin(s.mealMin),
        fmtMin(s.restMin),
        fmtMin(s.overtimeMin),
        fmtMin(s.maxContinuousDrivingMin),
        s.interDayMin == null ? "" : fmtMin(s.interDayMin),
        day.confirmed_by_driver_at ? "sim" : "nao",
        s.alerts.map((a) => a.text).join(" | "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob([`\uFEFF${[header.join(";"), ...lines].join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `espelho-ponto-${from}-a-${to}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="w-[220px]">
          <Label className="text-xs text-muted-foreground">Motorista</Label>
          <Select value={driverId} onValueChange={setDriverId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(drivers.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" className="ml-auto" onClick={exportCsv} disabled={!rows.length}>
          <Download className="size-4" /> Exportar espelho (CSV)
        </Button>
      </div>
      <LoadError error={days.error} />

      {pending.length ? (
        <FrotakSection
          title="Ajustes aguardando aprovação"
          description="O horário original fica guardado. Aprovar troca o início da marcação."
        >
          <ul className="flex flex-col divide-y divide-border">
            {pending.map(({ day, punch }) => (
              <li
                key={punch.id}
                className="flex flex-col gap-2 py-3 text-xs sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {names[day.driver_id] ?? "Motorista"} · {ACTIVITY_LABEL[punch.activity]} ·{" "}
                    {day.work_date}
                  </p>
                  <p className="text-muted-foreground">
                    De {fmtTime(punch.original_started_at)} para {fmtTime(punch.started_at)} ·
                    motivo: {punch.adjustment_reason}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void act(
                        "Ajuste recusado",
                        () => reviewAdjustment(punch.id, false),
                        () => void days.reload(),
                      )
                    }
                  >
                    <X className="size-4" /> Recusar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void act(
                        "Ajuste aprovado",
                        () => reviewAdjustment(punch.id, true),
                        () => void days.reload(),
                      )
                    }
                  >
                    <Check className="size-4" /> Aprovar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </FrotakSection>
      ) : null}

      <FrotakSection
        title="Espelho de ponto"
        description="Marcações do app do motorista. Etapas do frete marcam sozinhas. Conferência gerencial pela Lei 13.103; não é REP-P (Portaria 671)."
        contentClassName="p-0"
      >
        {!rows.length && !days.loading ? (
          <FrotakEmptyState
            title="Nenhuma jornada no período"
            description="As jornadas aparecem quando o motorista inicia o dia no app."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-xs">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  {[
                    "Motorista",
                    "Data",
                    "Início",
                    "Fim",
                    "Jornada",
                    "Direção",
                    "Espera",
                    "Refeição",
                    "Extra",
                    "Interjornada",
                    "Situação",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ day, summary: s }) => (
                  <DayRow
                    key={day.id}
                    day={day}
                    name={names[day.driver_id] ?? "Motorista"}
                    summary={s}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FrotakSection>
    </div>
  );
}

function DayRow({
  day,
  name,
  summary: s,
}: {
  day: WorkDay;
  name: string;
  summary: ReturnType<typeof summarizeDay>;
}) {
  const [open, setOpen] = useState(false);
  const violation = s.alerts.some((a) => a.level === "violacao");
  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-3 font-medium">{name}</td>
        <td className="px-4 py-3 tabular-nums">{day.work_date.split("-").reverse().join("/")}</td>
        <td className="px-4 py-3 tabular-nums">{fmtTime(day.started_at)}</td>
        <td className="px-4 py-3 tabular-nums">
          {day.ended_at ? fmtTime(day.ended_at) : <StatusBadge tone="ok">Aberta</StatusBadge>}
        </td>
        <td className="px-4 py-3 tabular-nums">{fmtMin(s.workMin)}</td>
        <td
          className={cn(
            "px-4 py-3 tabular-nums",
            s.maxContinuousDrivingMin > 330 && "text-destructive",
          )}
        >
          {fmtMin(s.drivingMin)}
        </td>
        <td className="px-4 py-3 tabular-nums">{fmtMin(s.waitingMin)}</td>
        <td className="px-4 py-3 tabular-nums">{fmtMin(s.mealMin)}</td>
        <td className={cn("px-4 py-3 tabular-nums", s.overtimeMin > 120 && "text-destructive")}>
          {fmtMin(s.overtimeMin)}
        </td>
        <td
          className={cn(
            "px-4 py-3 tabular-nums",
            s.interDayMin != null && s.interDayMin < 660 && "text-destructive",
          )}
        >
          {s.interDayMin == null ? "--" : fmtMin(s.interDayMin)}
        </td>
        <td className="px-4 py-3">
          {violation ? (
            <StatusBadge tone="danger">
              {s.alerts.filter((a) => a.level === "violacao").length} violação(ões)
            </StatusBadge>
          ) : s.alerts.length ? (
            <StatusBadge tone="warn">Atenção</StatusBadge>
          ) : (
            <StatusBadge tone="ok">
              {day.confirmed_by_driver_at ? "Confirmado" : "Em ordem"}
            </StatusBadge>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="bg-muted/25">
          <td colSpan={11} className="px-4 py-3">
            {s.alerts.length ? (
              <ul className="mb-3 flex flex-wrap gap-2">
                {s.alerts.map((a) => (
                  <li key={a.text}>
                    <StatusBadge tone={a.level === "violacao" ? "danger" : "warn"}>
                      {a.text}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            ) : null}
            <ol className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {[...day.driver_punches]
                .sort((a, b) => a.started_at.localeCompare(b.started_at))
                .map((p) => (
                  <li key={p.id} className="flex gap-2">
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                      {fmtTime(p.started_at)}–{p.ended_at ? fmtTime(p.ended_at) : "agora"}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">{ACTIVITY_LABEL[p.activity]}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {SOURCE_LABEL[p.source] ?? p.source}
                        {p.reason ? ` · ${p.reason}` : ""}
                        {p.original_started_at
                          ? ` · ajustado (era ${fmtTime(p.original_started_at)})`
                          : ""}
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {day.confirmed_by_driver_at
                ? `Motorista confirmou o espelho em ${new Date(day.confirmed_by_driver_at).toLocaleString("pt-BR")}.`
                : "Motorista ainda não confirmou este dia."}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}
