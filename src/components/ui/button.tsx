import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-pill)] text-sm font-medium cursor-pointer transition-fast outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-line disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-primary-foreground hover:bg-[var(--ink-hover)]",
        accent: "bg-orange text-on-orange shadow-[var(--glow-orange)] hover:bg-orange-hot",
        destructive: "bg-transparent text-danger hover:bg-danger-bg",
        outline: "border border-line-2 bg-transparent text-text hover:bg-surface-2",
        secondary: "bg-surface-2 text-text shadow-[var(--lift-1)] hover:bg-surface-3",
        ghost: "bg-transparent text-text-2 hover:bg-surface-2 hover:text-text",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 lg:h-10",
        sm: "h-11 px-3.5 text-[13px] lg:h-[34px]",
        lg: "h-11 px-6",
        icon: "size-11 rounded-[var(--r-sm)] lg:size-10",
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
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
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
