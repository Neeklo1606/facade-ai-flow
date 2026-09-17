import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[var(--r-sm)] border border-transparent bg-surface-2 px-4 text-[14px] text-text transition-fast outline-none placeholder:text-text-3 focus:border-orange-line focus:bg-surface-3 focus:ring-3 focus:ring-[rgba(232,80,2,0.18)] data-[force~=focus]:border-orange-line data-[force~=focus]:bg-surface-3 data-[force~=focus]:ring-3 data-[force~=focus]:ring-[rgba(232,80,2,0.18)] aria-invalid:border-danger/60 disabled:cursor-not-allowed disabled:opacity-50",
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
