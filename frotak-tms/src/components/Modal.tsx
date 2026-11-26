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
        <DialogHeader className="border-b border-border bg-popover px-6 py-5">
          <DialogTitle className="text-[18px] font-medium tracking-normal">{title}</DialogTitle>
          {description && (
            <DialogDescription className="font-sans text-xs leading-relaxed tracking-normal">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto bg-surface/20 px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {footer && (
          <DialogFooter className="border-t border-border bg-surface-2 px-4 py-4 sm:px-6">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
