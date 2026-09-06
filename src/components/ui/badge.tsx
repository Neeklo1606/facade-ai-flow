import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center rounded-[var(--r-pill)] px-2.5 text-xs font-medium transition-fast focus:outline-none focus:ring-2 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-ink text-primary-foreground",
        secondary: "bg-subtle text-text-secondary",
        destructive: "bg-danger-bg text-danger",
        outline: "border border-border text-foreground",
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
