import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Кнопки EMBER. accent — основная, одна на экран; default и secondary — вторичная;
 * ghost — призрачная; destructive — опасная; size="icon" — иконочная 38px. Градиентных кнопок нет.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-pill)] text-[14px] leading-none font-medium cursor-pointer border border-transparent transition-fast focus-ring disabled:pointer-events-none disabled:shadow-none disabled:opacity-45 disabled:cursor-not-allowed active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        accent: "bg-orange text-on-orange shadow-[var(--glow-orange)] is-hover:bg-orange-hot",
        default: "border-line bg-surface-2 text-text is-hover:border-line-2 is-hover:bg-surface-3",
        secondary:
          "border-line bg-surface-2 text-text is-hover:border-line-2 is-hover:bg-surface-3",
        outline: "border-line bg-surface-2 text-text is-hover:border-line-2 is-hover:bg-surface-3",
        ghost: "bg-transparent text-text-2 is-hover:bg-surface-2 is-hover:text-text",
        destructive: "bg-transparent text-danger is-hover:bg-danger-bg",
        link: "text-text underline-offset-4 is-hover:underline",
      },
      size: {
        default: "h-11 px-5 lg:h-10",
        sm: "h-11 px-4 text-[13px] lg:h-9",
        lg: "h-11 px-6",
        icon: "size-11 rounded-[var(--r-sm)] lg:size-[38px]",
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
