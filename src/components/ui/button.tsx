import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-pill)] text-sm font-medium cursor-pointer transition-fast outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:color-mix(in_oklab,var(--accent)_35%,transparent)] disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-primary-foreground hover:bg-[var(--ink-hover)] hover:shadow-[var(--shadow-sm)] active:shadow-none",
        accent: "bg-accent text-accent-foreground hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-sm)] active:shadow-none",
        destructive: "bg-transparent text-danger hover:bg-danger-bg",
        outline: "border border-border bg-surface text-text-primary hover:border-border-strong hover:bg-hover",
        secondary: "border border-border bg-surface text-text-primary hover:border-border-strong hover:bg-hover",
        ghost: "bg-transparent text-text-secondary hover:bg-hover hover:text-text-primary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[38px] px-[18px]",
        sm: "h-[34px] px-3.5 text-[13px]",
        lg: "h-11 px-6",
        icon: "size-[34px] rounded-[var(--r-sm)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
