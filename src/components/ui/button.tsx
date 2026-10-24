import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Кнопки «Графита» (ADR-052, раздел 3). Один набор на все экраны, своих стилей кнопок в экранах нет.
 * - primary: главная, таблетка, заливка accent, текст on-accent 15/600; иконка справа в круге 24
 *   (`iconEnd`). Одна на экран;
 * - secondary (outline, default — псевдонимы): таблетка, фон panel-2, граница line-2, текст ink;
 * - quiet (ghost — псевдоним): текст ink-2 без фона, при наведении фон panel-2;
 * - destructive: текст danger без заливки;
 * - size="icon": круг 40 на компьютере и 44 на телефоне, фон panel-2, граница line.
 * Высота: компьютер 40, телефон 44, size="field" (полевое действие, решение по записи) 52.
 * Нажатие: scale 0,97 за 100 мс. Фокус: кольцо accent 2 px с зазором 2 px. Загрузка: подпись
 * меняется на действие в процессе (`loadingText`), ширина не прыгает. Недоступная: 0,45.
 */
const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-pill text-body-strong leading-none cursor-pointer border border-transparent focus-ring press-97 disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent font-semibold fg-on-accent is-hover:bg-accent-hover active:bg-accent-hover",
        secondary: "border-line-2 bg-panel-2 fg-ink is-hover:bg-panel-3 active:bg-panel-3",
        outline: "border-line-2 bg-panel-2 fg-ink is-hover:bg-panel-3 active:bg-panel-3",
        default: "border-line-2 bg-panel-2 fg-ink is-hover:bg-panel-3 active:bg-panel-3",
        quiet: "bg-transparent fg-ink-2 is-hover:bg-panel-2 is-hover:fg-ink active:bg-panel-2",
        ghost: "bg-transparent fg-ink-2 is-hover:bg-panel-2 is-hover:fg-ink active:bg-panel-2",
        destructive: "bg-transparent fg-danger is-hover:bg-danger-bg active:bg-danger-bg",
        /*
         * Прежний вариант ADR-027: капсула цвета текста. Не оранжевая: экраны ГАЙКИ ставят её
         * рядом с активной вкладкой, и правило «одно оранжевое пятно» иначе нарушается
         */
        accent: "accent-fill font-semibold",
        link: "rounded-control fg-ink underline-offset-4 is-hover:underline",
      },
      size: {
        default: "h-btn px-5",
        sm: "h-btn px-4 text-meta-strong",
        lg: "h-btn px-6",
        field: "h-btn-field px-6",
        icon: "size-btn-icon rounded-full border-line bg-panel-2 p-0 fg-ink is-hover:bg-panel-3",
      },
    },
    compoundVariants: [
      // Иконка-кнопка всегда круг panel-2 с границей line, какой бы вариант ни пришёл
      { size: "icon", variant: "quiet", className: "border-line bg-panel-2" },
      { size: "icon", variant: "ghost", className: "border-line bg-panel-2" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** Иконка справа у главной кнопки: круг 24 цвета on-accent с прозрачностью 0,14 */
function IconEnd({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="-me-2 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-on-accent/14 [&_svg]:size-4"
    >
      {children}
    </span>
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Подпись на время загрузки: «Подтверждаю...». Без неё остаётся основная подпись */
  loadingText?: string;
  /** Иконка справа в круге 24: только у главной кнопки */
  iconEnd?: React.ReactNode;
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
      iconEnd,
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
          <>
            <span className="grid">
              <span aria-hidden className="invisible col-start-1 row-start-1">
                {children}
              </span>
              <span className="col-start-1 row-start-1">{loadingText}</span>
            </span>
            {iconEnd ? <IconEnd>{iconEnd}</IconEnd> : null}
          </>
        ) : (
          <>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {children}
            {iconEnd ? <IconEnd>{iconEnd}</IconEnd> : null}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
