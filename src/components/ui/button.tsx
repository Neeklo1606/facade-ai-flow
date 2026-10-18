import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Кнопки EMBER. accent — основная, одна на кадр, и она сама знает про кадр: до 1024 px
 * нейтральная (заливка цветом текста), с 1024 px оранжевая. Причина — единственное оранжевое
 * пятно на телефоне занято кнопкой «+» нижней панели, а на десктопе панели нет
 * (ADR-027, п. 3 и поправка). Экрану достаточно писать variant="accent".
 * default и secondary — вторичная; ghost — призрачная; destructive — опасная;
 * size="icon" — иконочная 38px. Градиентных кнопок нет.
 */
const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] text-[15px] leading-none font-medium lg:text-[14px] cursor-pointer border border-transparent transition-fast focus-ring active:translate-y-px motion-reduce:transform-none disabled:pointer-events-none disabled:shadow-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        accent: "accent-fill",
        default: "border-line bg-surface-2 text-text is-hover:border-line-2 is-hover:bg-surface-3",
        secondary:
          "border-line bg-surface-2 text-text is-hover:border-line-2 is-hover:bg-surface-3",
        outline: "border-line-2 bg-surface text-text is-hover:bg-surface-2",
        ghost: "bg-transparent text-text-2 is-hover:bg-surface-2 is-hover:text-text",
        destructive: "bg-transparent text-danger is-hover:bg-danger-bg",
        link: "text-text underline-offset-4 is-hover:underline",
      },
      /*
       * Высоты телефона: 48 px — минимальная область нажатия ГАЙКИ (правило 6, ADR-034, п. 6).
       * На десктопе мышь точнее, там ряд плотнее: 40, 36 и 38 px.
       */
      size: {
        default: "h-12 px-5 lg:h-10",
        sm: "h-12 px-4 text-[13px] lg:h-9",
        lg: "h-14 px-6 lg:h-12",
        icon: "size-12 rounded-[var(--r-sm)] lg:size-[38px]",
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
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      title,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          title={title ?? (size === "icon" ? props["aria-label"] : undefined)}
          {...props}
        >
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
        title={title ?? (size === "icon" ? props["aria-label"] : undefined)}
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
