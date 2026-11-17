import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PUBLIC_STEPS } from "@/lib/freightShare";
import type { ShipperFreight } from "@/lib/shipper/types";

// Pecas visuais do portal do embarcador, no padrao Frotak (cards 25px, pill, Plus Jakarta).

export function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}

export function formatCnpj(value?: string) {
  const d = (value ?? "").replace(/\D/g, "");
  if (d.length !== 14) return value ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function PageTitle({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="label-tiny">{eyebrow}</p>}
        <h1 className="mt-1 text-[24px] font-medium leading-tight text-foreground md:text-[28px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("premium-card p-5", className)}>{children}</section>;
}

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "bg-primary/10 text-primary",
    good: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/12 text-destructive",
  }[tone];
  return (
    <div className="premium-card flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="label-tiny">{label}</p>
        <p className="mt-1.5 font-mono text-[28px] font-black leading-none text-foreground">
          {value}
        </p>
        {hint && <p className="mt-1.5 truncate text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <span
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
          toneClass,
        )}
      >
        <Icon className="size-5" />
      </span>
    </div>
  );
}

export function statusTone(
  freight: ShipperFreight,
): "good" | "warning" | "danger" | "neutral" | "muted" {
  if (freight.cancelled) return "muted";
  if (freight.occurrence) return "danger";
  if (freight.step === "entregue") return "good";
  if (freight.statusLabel.startsWith("No local") || freight.statusLabel === "Carregado")
    return "warning";
  return "neutral";
}

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "good" | "warning" | "danger" | "neutral" | "muted";
  children: ReactNode;
  className?: string;
}) {
  const toneClass = {
    good: "border-success/30 bg-success/12 text-success",
    warning: "border-warning/35 bg-warning/12 text-warning",
    danger: "border-destructive/30 bg-destructive/10 text-destructive",
    neutral: "border-primary/25 bg-primary/10 text-primary",
    muted: "border-border bg-surface-2/50 text-muted-foreground",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ freight }: { freight: ShipperFreight }) {
  return (
    <Pill tone={statusTone(freight)}>
      {freight.occurrence ? "Ocorrência" : freight.statusLabel}
    </Pill>
  );
}

export function StepBar({ freight }: { freight: ShipperFreight }) {
  if (freight.cancelled) return null;
  const index = PUBLIC_STEPS.findIndex((step) => step.id === freight.step);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Etapas">
      {PUBLIC_STEPS.map((step, i) => (
        <li key={step.id} className="flex flex-col gap-1">
          <span className={cn("h-1.5 rounded-full", i <= index ? "bg-primary" : "bg-border")} />
          <span
            className={cn(
              "text-[10px] font-semibold leading-tight",
              i === index ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-3 text-[15px] font-extrabold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function FilterChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string; count?: number }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition",
            value === option.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px]",
                value === option.id ? "bg-white/20" : "bg-surface-2",
              )}
            >
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
