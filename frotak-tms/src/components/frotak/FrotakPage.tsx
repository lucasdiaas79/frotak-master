import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FrotakPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1680px] flex-col gap-4 p-3 md:gap-5 md:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FrotakPageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-4 px-1 py-2 md:flex-row md:items-end md:justify-between md:px-0 md:py-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[26px] font-medium leading-tight tracking-normal text-foreground md:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-xs leading-[1.6] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 md:w-auto md:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function FrotakFilterBar({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Filtros"
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[25px] border border-border bg-card px-4 py-4 md:flex-row md:items-end md:px-5",
        className,
      )}
    >
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}

export function FrotakSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-[25px] border border-border bg-card",
        className,
      )}
    >
      {title || description || actions ? (
        <div className="flex min-w-0 flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-medium text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className={cn("min-w-0 p-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function FrotakMetric({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-[#202523] text-white dark:bg-[#1a1e1c]",
    positive: "border-success/25 bg-card text-foreground",
    warning: "border-warning/30 bg-card text-foreground",
    danger: "border-destructive/25 bg-card text-foreground",
  };
  const iconTones = {
    neutral: "bg-white/10 text-white",
    positive: "bg-success/12 text-success",
    warning: "bg-warning/14 text-warning",
    danger: "bg-destructive/12 text-destructive",
  };
  return (
    <article className={cn("rounded-[25px] border p-5", tones[tone], className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.1em]",
              tone === "neutral" ? "text-white/60" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <div className="mt-2 text-[26px] font-medium leading-none tabular-nums md:text-[30px]">
            {value}
          </div>
          {detail ? (
            <div
              className={cn(
                "mt-2 text-xs",
                tone === "neutral" ? "text-white/60" : "text-muted-foreground",
              )}
            >
              {detail}
            </div>
          ) : null}
        </div>
        {icon ? (
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              iconTones[tone],
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function FrotakToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FrotakEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-52 flex-col items-center justify-center px-5 py-10 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
