import { Ban, Clock, ShieldAlert, ShieldCheck, ShieldQuestion, Star } from "lucide-react";
import { Pill } from "@/components/shipper/ShipperUi";
import { cn } from "@/lib/utils";
import {
  DRIVER_DECISION_LABELS,
  DRIVER_RELATION_LABELS,
  type DocState,
  type DriverDecision,
  type DriverRelation,
} from "@/lib/shipper/types";

// Pecas visuais de motorista (terceiros e Rede Frotak).

export function DriverAvatar({ initials, size = 36 }: { initials: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-extrabold text-primary"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

export function ScoreStar({ score, className }: { score?: number; className?: string }) {
  if (score === undefined)
    return <span className={cn("text-[12px] text-muted-foreground", className)}>sem nota</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono font-black", className)}>
      <Star className="size-3.5 fill-[#E0A11B] text-[#E0A11B]" />
      {score.toFixed(1).replace(".", ",")}
    </span>
  );
}

const DOC_PILL: Record<
  DocState,
  { tone: "good" | "warning" | "danger" | "muted"; label: string; icon: typeof ShieldCheck }
> = {
  ok: { tone: "good", label: "Docs em dia", icon: ShieldCheck },
  vencendo: { tone: "warning", label: "Vencendo", icon: Clock },
  vencido: { tone: "danger", label: "Vencido", icon: ShieldAlert },
  faltando: { tone: "muted", label: "Sem documento", icon: ShieldQuestion },
};

export function DocStatePill({ state, label }: { state: DocState; label?: string }) {
  const item = DOC_PILL[state];
  return (
    <Pill tone={item.tone} className="uppercase tracking-[0.06em] text-[10px]">
      <item.icon className="size-3" />
      {label ?? item.label}
    </Pill>
  );
}

export function DecisionPill({ decision }: { decision?: DriverDecision }) {
  if (!decision) return <Pill tone="muted">Sem análise</Pill>;
  const tone = decision === "aprovado" ? "good" : decision === "bloqueado" ? "danger" : "warning";
  return (
    <Pill tone={tone}>
      {decision === "bloqueado" && <Ban className="size-3" />}
      {DRIVER_DECISION_LABELS[decision]}
    </Pill>
  );
}

export function RelationLabel({ relation }: { relation: DriverRelation }) {
  return <span>{DRIVER_RELATION_LABELS[relation]}</span>;
}

export function formatDay(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: iso.length === 10 ? "numeric" : undefined,
      });
}
