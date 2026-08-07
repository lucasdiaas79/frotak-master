import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "screen";
}

const SIZE: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-6xl",
  screen: "max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)]",
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${SIZE[size]} max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] gap-0 overflow-hidden p-0`}
      >
        <DialogHeader className="border-b border-border/80 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--color-primary)_10%,transparent),transparent)] px-6 py-5">
          <div className="mb-3 h-1 w-12 rounded-full bg-primary/75 shadow-none" />
          <DialogTitle className="text-[18px] font-extrabold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em]">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto bg-surface/20 px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {footer && (
          <DialogFooter className="border-t border-border/80 bg-surface-2/90 px-4 py-4 shadow-[0_-12px_32px_rgb(0_0_0_/_0.14)] sm:px-6">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
