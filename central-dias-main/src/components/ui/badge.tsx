import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase leading-none tracking-[0.12em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring/70 focus:ring-offset-2 focus:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/12 text-primary shadow-[0_8px_24px_color-mix(in_oklch,var(--color-primary)_14%,transparent)] hover:bg-primary/16",
        secondary: "border-border bg-secondary/70 text-secondary-foreground hover:bg-secondary",
        destructive:
          "border-destructive/25 bg-destructive/10 text-destructive shadow-[0_8px_24px_color-mix(in_oklch,var(--color-destructive)_12%,transparent)] hover:bg-destructive/15",
        outline: "border-border bg-surface/55 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

