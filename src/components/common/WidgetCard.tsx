import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type WidgetCardProps = {
  children: ReactNode;
  className?: string;
} & (
  | ({ interactive?: false } & ComponentPropsWithoutRef<"section">)
  | ({ interactive: true } & ComponentPropsWithoutRef<"button">)
);

/**
 * Карточка виджета: --surface, граница --line, --lift-1, отступ 24px.
 * interactive — вся карточка кнопка: при наведении граница --line-2 и --lift-2.
 */
export function WidgetCard(props: WidgetCardProps) {
  if (props.interactive) {
    const { interactive: _interactive, className, children, ...rest } = props;
    return (
      <button
        type="button"
        {...rest}
        className={cn("widget-card widget-card-interactive focus-ring block w-full", className)}
      >
        {children}
      </button>
    );
  }
  const { interactive: _interactive, className, children, ...rest } = props;
  return (
    <section {...rest} className={cn("widget-card", className)}>
      {children}
    </section>
  );
}

/**
 * Заголовок карточки: иконка-квадрат 30px, заголовок, пояснение и справа счётчик или действие.
 * level — уровень заголовка в структуре страницы: 2 для карточек верхнего уровня, иначе 3.
 */
export function WidgetCardHeader({
  icon: Icon,
  title,
  hint,
  aside,
  level = 3,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  aside?: ReactNode;
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <header className={cn("mb-5 flex min-h-8 items-center gap-3", className)}>
      {Icon && (
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[var(--r-sm)] bg-surface-3">
          <Icon className="size-[15px] text-text-2" strokeWidth={1.5} aria-hidden />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <Heading className="truncate text-[16px] leading-[1.35] font-semibold text-text">
          {title}
        </Heading>
        {hint && <span className="truncate text-[13px] leading-[1.45] text-text-3">{hint}</span>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </header>
  );
}

/** Счётчик-капсула в заголовке карточки */
export function CountPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-3 px-2.5 text-[12px] leading-none font-medium text-text-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
