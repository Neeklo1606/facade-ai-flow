/**
 * Строка списка и группа строк ADR-045, раздел 4.9.
 *
 * Двухстрочная строка от 64: точка статуса, название text-heading в 1-2 строки, пояснение
 * text-meta в одну строку, справа значение text-body-strong и дата, стрелка. Однострочная
 * (меню, «Ещё», строка отчёта) 52. Вся строка нажимается. Группа: карточка радиусом 12,
 * разделитель 1 px с отступом слева 16, липкий заголовок группы text-meta высотой 28.
 */
import type { ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot, type EntryStatus } from "./status";

export interface ListRowProps {
  title: ReactNode;
  /** Пояснение одной строкой: «Бригада 1 · 12:00-14:30 · 2,50 ч» */
  meta?: ReactNode;
  /** Статус точкой в начале пояснения */
  status?: EntryStatus;
  /** Значение справа: «14 700 ₽» */
  value?: ReactNode;
  /** Под значением: дата или доходность */
  valueMeta?: ReactNode;
  /** Третий ряд: метки (ChipRow) */
  chips?: ReactNode;
  /** Слева: аватар 32 или иконка 20 */
  leading?: ReactNode;
  compact?: boolean;
  /** Без стрелки: строка только для просмотра */
  arrow?: boolean;
  /** Режим выбора пачкой: флажок слева */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (next: boolean) => void;
  onClick?: () => void;
  href?: string;
  current?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ListRow({
  title,
  meta,
  status,
  value,
  valueMeta,
  chips,
  leading,
  compact = false,
  arrow,
  selectable = false,
  selected = false,
  onSelect,
  onClick,
  href,
  current = false,
  className,
  ...rest
}: ListRowProps) {
  const interactive = !!(onClick || href);
  const showArrow = arrow ?? interactive;
  const content = (
    <>
      {leading ? <span className="flex shrink-0 items-center text-text-3">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-text",
            compact ? "truncate text-body" : "line-clamp-2 text-heading",
          )}
        >
          {title}
        </span>
        {meta || status ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-text-3">
            {status ? <StatusDot status={status} className="shrink-0 text-text-2" /> : null}
            {status && meta ? <span aria-hidden>·</span> : null}
            {meta ? <span className="truncate">{meta}</span> : null}
          </span>
        ) : null}
        {chips ? <span className="mt-1.5 block">{chips}</span> : null}
      </span>
      {value || valueMeta ? (
        <span className="shrink-0 text-right">
          {value ? <span className="block text-body-strong tnum">{value}</span> : null}
          {valueMeta ? (
            <span className="mt-0.5 block text-meta text-text-3 tnum">{valueMeta}</span>
          ) : null}
        </span>
      ) : null}
      {showArrow ? (
        <ChevronRight className="size-5 shrink-0 self-center text-text-3" aria-hidden />
      ) : null}
    </>
  );
  const cls = cn(
    "flex w-full items-start gap-3 px-row text-left",
    compact ? "min-h-row-compact items-center py-2" : "min-h-row py-row",
    interactive && "focus-ring transition-fast is-hover:bg-surface-2 active:bg-surface-2",
    current && "bg-surface-2",
    className,
  );

  const body = href ? (
    <a href={href} className={cls} aria-current={current ? "true" : undefined} {...rest}>
      {content}
    </a>
  ) : onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      aria-current={current ? "true" : undefined}
      {...rest}
    >
      {content}
    </button>
  ) : (
    <div className={cls} {...rest}>
      {content}
    </div>
  );

  if (!selectable) return body;
  return (
    <div className="flex items-stretch">
      <label className="flex shrink-0 cursor-pointer items-center ps-row">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect?.(event.target.checked)}
          className="peer sr-only"
          aria-label={typeof title === "string" ? `Выбрать: ${title}` : "Выбрать"}
        />
        <span
          aria-hidden
          className={cn(
            "grid size-6 place-items-center rounded-[var(--r-xs)] border peer-focus-visible:ring-2 peer-focus-visible:ring-orange",
            selected ? "border-orange-strong bg-orange-strong text-on-orange" : "border-line-2",
          )}
        >
          {selected ? <Check className="size-4" /> : null}
        </span>
      </label>
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );
}

/** Группа строк: карточка с разделителями, липкий заголовок группы */
export function ListGroup({
  title,
  aside,
  sticky = false,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  title?: ReactNode;
  /** Справа в заголовке: «18 записей · 312 450 ₽» или кнопка «Все» */
  aside?: ReactNode;
  sticky?: boolean;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section className={className} aria-label={ariaLabel}>
      {title ? (
        <div
          className={cn(
            "flex h-7 items-center justify-between gap-2 text-meta text-text-3",
            sticky && "sticky top-[var(--sticky-top,0px)] z-10 bg-void",
          )}
        >
          <span className="truncate">{title}</span>
          {aside ? <span className="shrink-0 tnum">{aside}</span> : null}
        </div>
      ) : null}
      <ul className="surface-1 overflow-hidden [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-x-0 [&>li+li]:before:top-0 [&>li+li]:before:ms-4 [&>li+li]:before:h-px [&>li+li]:before:bg-line">
        {children}
      </ul>
    </section>
  );
}
