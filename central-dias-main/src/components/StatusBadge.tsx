import * as React from "react";
import { cn } from "@/lib/utils";
import type { VehicleStatus } from "@/lib/types";
import { VEHICLE_STATUS_LABEL, VEHICLE_STATUS_SHORT, statusTone } from "@/lib/types";

interface Props {
  status: VehicleStatus;
  full?: boolean;
  className?: string;
}

const WRAP_CLASS: Record<string, string> = {
  success: "border-success/40 bg-success/20 text-success",
  warning: "border-warning/45 bg-warning/25 text-warning",
  destructive: "border-destructive/45 bg-destructive/20 text-destructive",
  muted: "border-muted-foreground/35 bg-muted-foreground/20 text-muted-foreground",
};

export function StatusBadge({ status, full = false, className }: Props) {
  const tone = statusTone(status);
  const label = full ? VEHICLE_STATUS_LABEL[status] : VEHICLE_STATUS_SHORT[status];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-black uppercase leading-none tracking-[0.12em]",
        WRAP_CLASS[tone],
        className,
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
