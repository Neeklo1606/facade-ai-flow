import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Кнопки ADR-045, раздел 4.6.
 * - primary: главная, заливка акцентом, белый текст 15/500, высота 48 (size="lg"), одна на экран;
 * - secondary и outline: вторичная, граница 1 px, фон surface, 44;
 * - quiet: тихая, без фона, текст акцентом («Изменить», «Все»), 44;
 * - destructive: опасная, красный текст без заливки, 44;
 * - size="icon": круг 40, область касания 44; size="field": полевое действие прораба 56.
 * accent (ADR-027) и default оставлены для экранов до перевёрстки.
 * Нажатие: фон темнее и сжатие 0,98. Загрузка: подпись меняется на действие в процессе
 * (`loadingText`), ширина не прыгает. Недоступная: прозрачность 0,45.
 */
const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-control text-body-strong leading-none cursor-pointer border border-transparent transition-fast focus-ring press-98 disabled:pointer-events-none disabled:shadow-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-orange-strong text-on-orange is-hover:bg-orange-strong-hover active:bg-orange-strong-hover",
        quiet: "bg-transparent text-orange is-hover:bg-surface-2 active:bg-surface-2",
        accent: "accent-fill",
        default: "border-line bg-surface-2 text-text is-hover:border-line-2 is-hover:bg-surface-3",
        secondary:
          "border-line bg-surface-2 text-text is-hover:border-line-2 is-hover:bg-surface-3",
        outline: "border-line-2 bg-surface text-text is-hover:bg-surface-2 active:bg-surface-2",
        ghost: "bg-transparent text-text-2 is-hover:bg-surface-2 is-hover:text-text",
        destructive: "bg-transparent text-danger is-hover:bg-danger-bg",
        link: "text-text underline-offset-4 is-hover:underline",
      },
      /*
       * Высоты ADR-045: обычная 44, главная 48, полевое действие 56. Маленькая на компьютере
       * 36, на телефоне область касания остаётся 44. Иконка: круг 40 с областью 44.
       */
      size: {
        default: "h-control px-4",
        sm: "h-control px-3 text-meta-strong lg:h-9",
        lg: "h-control-lg px-5",
        field: "h-14 px-6",
        icon: "touch-target size-10 rounded-full",
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
  /** Подпись на время загрузки: «Подтверждаю...». Без неё остаётся основная подпись */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
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
        {loading && loadingText ? (
          // Ширина держится основной подписью, поверх неё подпись процесса
          <span className="grid">
            <span aria-hidden className="invisible col-start-1 row-start-1">
              {children}
            </span>
            <span className="col-start-1 row-start-1">{loadingText}</span>
          </span>
        ) : (
          <>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
