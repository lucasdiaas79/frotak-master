import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Minus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "info" | "neutral" | "danger";

const toneClasses: Record<Tone, string> = {
  success: "bg-success/15 text-success ring-success/25",
  warning: "bg-warning/15 text-warning ring-warning/25",
  info: "bg-info/15 text-info ring-info/25",
  neutral: "bg-muted text-muted-foreground ring-border",
  danger: "bg-destructive/15 text-destructive ring-destructive/25",
};

export function toneFor(value?: string): Tone {
  const normalized = (value ?? "").toLowerCase();
  if (
    /(ok|online|ativo|operacional|sucesso|pago|resolvido|sincronizado|em rota|verde)/.test(
      normalized,
    )
  )
    return "success";
  if (/(trial|analise|análise|andamento|aguardando|info|lead)/.test(normalized)) return "info";
  if (/(risco|warning|aten|expir|suspenso|pendente|revis|manual)/.test(normalized))
    return "warning";
  if (/(erro|crit|danger|inadimpl|falha|cancel|bloq|vencido|offline)/.test(normalized))
    return "danger";
  return "neutral";
}

export function StatusPill({
  tone = "neutral",
  dot = true,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs = [],
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  crumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
}) {
  return (
    <section className="mb-4 rounded-[28px] border border-border bg-card/75 p-5 shadow-sm lg:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {crumbs.length ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-2">
                  {crumb.to ? (
                    <Link to={crumb.to} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                  {index < crumbs.length - 1 ? <span>/</span> : null}
                </span>
              ))}
            </div>
          ) : null}
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}

export function Panel({
  eyebrow,
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  hint,
  trend = "flat",
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: string;
  hint?: string;
  trend?: "up" | "down" | "flat";
  icon?: ComponentType<{ className?: string }>;
  index?: number;
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const tone = trend === "down" ? "danger" : trend === "up" ? "success" : "neutral";

  return (
    <article className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
        </div>
        {Icon ? (
          <span className="icon-tile size-10 shrink-0 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <StatusPill tone={tone} dot={false} className="px-2 py-1">
          <TrendIcon className="size-3.5" />
          {delta}
        </StatusPill>
        {hint ? <span className="truncate text-muted-foreground">{hint}</span> : null}
      </div>
    </article>
  );
}

export function Meter({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">{hint ?? `${safeValue}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-[width]"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-border",
        className,
      )}
    >
      {initials || "FK"}
    </span>
  );
}

export function Timeline({ items }: { items: { title: string; meta?: string; tone?: Tone }[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "mt-1 size-2.5 rounded-full",
                item.tone ? toneClasses[item.tone].split(" ")[0] : "bg-primary",
              )}
            />
            {index < items.length - 1 ? <span className="mt-2 h-full w-px bg-border" /> : null}
          </div>
          <div className="min-w-0 pb-2">
            <p className="text-sm font-semibold">{item.title}</p>
            {item.meta ? <p className="text-xs text-muted-foreground">{item.meta}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-elevated/30 px-4 py-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Pager({ total }: { total: number }) {
  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
      <span className="text-muted-foreground">{total} registros</span>
      <div className="flex items-center gap-2">
        <button className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
          <ChevronLeft className="size-4" />
        </button>
        <span className="rounded-lg bg-muted px-3 py-1 text-xs font-semibold">1</span>
        <button className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("w-full overflow-x-auto", className)} {...props} />;
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-border px-4 py-3 text-left text-xs font-semibold text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-border/60 px-4 py-3 align-middle text-sm", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition hover:bg-accent/30", className)} {...props} />;
}
