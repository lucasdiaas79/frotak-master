import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Ban,
  CalendarCheck,
  CircleCheck,
  FileBadge,
  FileCheck,
  Pencil,
  Route as RouteIcon,
  Star,
  Timer,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DecisionPill,
  DocStatePill,
  DriverAvatar,
  ScoreStar,
  formatDay,
} from "@/components/shipper/DriverUi";
import { Card, EmptyState, Kpi, Pill } from "@/components/shipper/ShipperUi";
import { Button } from "@/components/ui/button";
import { useShipperPortal } from "@/lib/shipper/client";
import { DRIVER_RELATION_LABELS, type DriverDecision } from "@/lib/shipper/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/terceiros/$profileId")({
  component: DriverProfilePage,
});

function DriverProfilePage() {
  const { profileId } = Route.useParams();
  const { thirdParties, data, setDecision, addNote, rateTrip } = useShipperPortal();
  const driver = thirdParties?.drivers.find((item) => item.profileId === profileId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!thirdParties) {
    return <div className="premium-card h-80 animate-pulse" />;
  }
  if (!driver) {
    return (
      <Card>
        <EmptyState
          icon={TriangleAlert}
          title="Motorista não encontrado"
          text="Ele não levou carga sua pelas transportadoras conectadas."
          action={
            <Link to="/embarcador/terceiros" className="font-bold text-primary">
              Voltar para Terceiros
            </Link>
          }
        />
      </Card>
    );
  }

  async function decide(status: DriverDecision | "limpar") {
    if (!driver) return;
    let reason: string | undefined;
    if (status === "bloqueado") {
      reason = window.prompt("Motivo do bloqueio (só sua empresa vê):")?.trim() || undefined;
    }
    setBusy(true);
    try {
      await setDecision(driver.profileId, status, reason);
      toast.success(
        status === "aprovado"
          ? "Motorista aprovado para suas cargas."
          : status === "bloqueado"
            ? "Motorista bloqueado para suas cargas."
            : status === "limpar"
              ? "Decisão removida."
              : "Motorista em revisão.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!driver || !note.trim()) return;
    setBusy(true);
    try {
      await addNote(driver.profileId, note.trim());
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const activeFreights = (data?.freights ?? []).filter((freight) =>
    driver.activeFreightIds.includes(freight.id),
  );

  return (
    <div className="space-y-4">
      <Link
        to="/embarcador/terceiros"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Terceiros
      </Link>

      <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
        <DriverAvatar initials={driver.initials} size={72} />
        <div className="min-w-0 flex-1">
          <p className="label-tiny text-primary">
            {DRIVER_RELATION_LABELS[driver.relation]} ·{" "}
            {driver.decision === "aprovado"
              ? "aprovado para suas cargas"
              : driver.decision === "bloqueado"
                ? "bloqueado para suas cargas"
                : driver.decision === "em_revisao"
                  ? "em revisão"
                  : "sem análise"}
          </p>
          <h1 className="mt-1 text-[26px] font-medium leading-tight md:text-[30px]">
            {driver.name}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {[driver.vehicleKind, driver.plate, driver.baseCity].filter(Boolean).join(" · ")}
            {driver.carrierNames.length ? ` · roda com ${driver.carrierNames.join(" e ")}` : ""}
          </p>
          {driver.decisionReason && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Motivo: <span className="text-foreground">{driver.decisionReason}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-5 lg:border-l lg:border-border lg:pl-6">
          <div className="text-center">
            <p className="label-tiny">Nota</p>
            <ScoreStar score={driver.score} className="mt-1 text-[30px]" />
            <p className="text-[11.5px] text-muted-foreground">
              {driver.scoreCount} avaliação(ões)
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {driver.decision === "aprovado" ? (
              <Button
                disabled={busy}
                variant="outline"
                className="rounded-full"
                onClick={() => decide("limpar")}
              >
                <Undo2 className="size-4" /> Tirar aprovação
              </Button>
            ) : (
              <Button disabled={busy} className="rounded-full" onClick={() => decide("aprovado")}>
                <CircleCheck className="size-4" /> Aprovar
              </Button>
            )}
            {driver.decision === "bloqueado" ? (
              <Button
                disabled={busy}
                variant="outline"
                className="rounded-full"
                onClick={() => decide("limpar")}
              >
                <Undo2 className="size-4" /> Desbloquear
              </Button>
            ) : (
              <Button
                disabled={busy}
                variant="outline"
                className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => decide("bloqueado")}
              >
                <Ban className="size-4" /> Bloquear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {activeFreights.length > 0 && driver.docState !== "ok" && (
        <div className="flex gap-2.5 rounded-[22px] border border-destructive/30 bg-destructive/6 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-[13px]">
            <b>Atenção:</b> ele está com carga sua agora (
            {activeFreights.map((f) => f.plate).join(", ")}) e tem documento{" "}
            {driver.docState === "vencendo" ? "vencendo" : "irregular"}. Fale com{" "}
            {activeFreights[0].carrierName}.
          </p>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi label="Viagens com você" value={driver.tripsWithMe} icon={RouteIcon} />
        <Kpi
          label="No prazo"
          value={driver.onTimeRate !== undefined ? `${driver.onTimeRate}%` : "-"}
          icon={CalendarCheck}
          tone="good"
        />
        <Kpi label="Ocorrências" value={driver.occurrences} icon={TriangleAlert} tone="warning" />
        <Kpi
          label="Na rede"
          value={driver.inNetwork ? "Sim" : "Não"}
          hint="Rede Frotak"
          icon={Timer}
        />
        <Kpi
          label="Aprovado por"
          value={driver.validatedBy}
          hint="empresa(s) da rede"
          icon={FileCheck}
          tone="good"
        />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_320px] [&>*]:min-w-0">
        <Card className="min-w-0 p-5">
          <p className="label-tiny">Documentos</p>
          <div className="mt-3 space-y-3">
            {driver.documents.map((doc) => (
              <div key={doc.kind} className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-[12px]",
                    doc.state === "ok"
                      ? "bg-success/12 text-success"
                      : doc.state === "vencendo"
                        ? "bg-warning/15 text-warning"
                        : "bg-destructive/10 text-destructive",
                  )}
                >
                  <FileBadge className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{doc.label}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {doc.expiresAt ? `Válido até ${formatDay(doc.expiresAt)}` : "Não informado"}
                    {doc.numberHint ? ` · final ${doc.numberHint}` : ""} · informado pelo{" "}
                    {doc.informedBy}
                  </p>
                </div>
                <DocStatePill state={doc.state} label={doc.state === "ok" ? "Em dia" : undefined} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="min-w-0 p-5">
          <div className="flex items-center justify-between">
            <p className="label-tiny">Histórico com suas cargas</p>
            <span className="text-[11.5px] text-muted-foreground">mais recentes</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="pb-2 pr-3">Data</th>
                  <th className="pb-2 pr-3">Rota</th>
                  <th className="pb-2 pr-3">Prazo</th>
                  <th className="pb-2">Sua nota</th>
                </tr>
              </thead>
              <tbody>
                {driver.trips.slice(0, 8).map((trip) => (
                  <tr key={trip.freightId} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-[12px] text-muted-foreground">
                      {formatDay(trip.date)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold">{trip.route}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {trip.plate} · {trip.carrierName}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">
                      {!trip.finished ? (
                        <Pill tone="neutral">Em andamento</Pill>
                      ) : trip.occurrence ? (
                        <Pill tone="danger">Ocorrência</Pill>
                      ) : trip.onTime === undefined ? (
                        <Pill tone="muted">Sem avaliação</Pill>
                      ) : trip.onTime ? (
                        <Pill tone="good">No prazo</Pill>
                      ) : (
                        <Pill tone="warning">Atrasou</Pill>
                      )}
                    </td>
                    <td className="py-2.5">
                      {trip.myScore ? (
                        <ScoreStar score={trip.myScore} />
                      ) : trip.finished ? (
                        <RateInline
                          onRate={async (score, onTime) => {
                            try {
                              await rateTrip({ freightId: trip.freightId, score, onTime });
                              toast.success("Avaliação salva.");
                            } catch (error) {
                              toast.error(
                                error instanceof Error ? error.message : "Não foi possível salvar.",
                              );
                            }
                          }}
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="min-w-0 p-5">
          <p className="label-tiny">Observação interna</p>
          <form onSubmit={submitNote} className="mt-3 flex gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 text-[12.5px]">
              <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Adicionar observação…"
                maxLength={1000}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <Button type="submit" disabled={busy || !note.trim()} className="rounded-full">
              Salvar
            </Button>
          </form>
          <div className="mt-3 space-y-2">
            {driver.notes.length === 0 && (
              <p className="text-[12px] text-muted-foreground">
                Só a sua empresa vê estas observações.
              </p>
            )}
            {driver.notes.map((item) => (
              <div
                key={item.id}
                className="rounded-[16px] border border-border bg-surface/60 p-3 text-[12.5px] leading-relaxed"
              >
                {item.body}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {item.author ?? "Equipe"} · {formatDay(item.at)} · só sua empresa vê
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function RateInline({ onRate }: { onRate: (score: number, onTime?: boolean) => Promise<void> }) {
  const [score, setScore] = useState(0);
  const [saving, setSaving] = useState(false);
  if (score) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">No prazo?</span>
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onRate(score, value);
              setSaving(false);
            }}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold hover:border-primary hover:text-primary"
          >
            {value ? "Sim" : "Não"}
          </button>
        ))}
      </span>
    );
  }
  return (
    <span className="flex" aria-label="Dar nota">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setScore(value)}
          aria-label={`${value} estrela(s)`}
        >
          <Star className="size-4 text-border hover:fill-[#E0A11B] hover:text-[#E0A11B]" />
        </button>
      ))}
    </span>
  );
}
