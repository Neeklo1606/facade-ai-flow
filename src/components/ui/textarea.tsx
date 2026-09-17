import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[88px] w-full rounded-[var(--r-sm)] border border-transparent bg-surface-2 px-4 py-3 text-[14px] text-text transition-fast outline-none placeholder:text-text-3 focus:border-orange-line focus:bg-surface-3 focus:ring-3 focus:ring-[rgba(232,80,2,0.18)] aria-invalid:border-danger/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
