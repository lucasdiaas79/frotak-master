import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <div
      className={cn(
        "premium-card mx-3 mt-3 flex flex-col gap-4 px-4 py-5 md:mx-0 md:mt-0 md:flex-row md:items-center md:justify-between md:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        {subtitle && (
          <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {subtitle}
          </p>
        )}
        <h1 className="truncate text-[22px] font-extrabold leading-tight text-foreground md:text-[26px]">
          {title}
        </h1>
      </div>
      {actions && (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 md:w-auto">{actions}</div>
      )}
    </div>
  );
}

