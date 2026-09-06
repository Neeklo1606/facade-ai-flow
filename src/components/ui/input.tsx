import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[38px] w-full rounded-[var(--r-sm)] border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-[var(--border-focus)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[color:color-mix(in_oklab,var(--accent)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
