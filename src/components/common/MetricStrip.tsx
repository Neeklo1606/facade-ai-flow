import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Направление изменения величины: стрелка показывает только его */
export type DeltaDirection = "up" | "down" | "flat";
/** Смысл изменения для метрики: цвет задаёт он, а не знак числа */
export type DeltaEffect = "better" | "worse" | "neutral";

export interface Delta {
  text: string;
  direction: DeltaDirection;
  effect: DeltaEffect;
}

const effectClass: Record<DeltaEffect, string> = {
  better: "bg-ok-bg text-ok",
  worse: "bg-danger-bg text-danger",
  neutral: "bg-surface-3 text-text-3",
};

const effectWord: Record<DeltaEffect, string> = {
  better: "улучшение",
  worse: "ухудшение",
  neutral: "без изменений",
};

const arrow: Record<DeltaDirection, LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  flat: ArrowRight,
};

/**
 * Дельта-капсула. Рост просроченных запросов — стрелка вверх и красный цвет,
 * рост проверенных позиций — стрелка вверх и зелёный.
 */
export function DeltaPill({ delta, className }: { delta: Delta; className?: string }) {
  const Arrow = arrow[delta.direction];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] leading-none font-medium whitespace-nowrap",
        effectClass[delta.effect],
        className,
      )}
      aria-label={`${delta.text}, ${effectWord[delta.effect]}`}
    >
      <Arrow className="size-3" strokeWidth={2} aria-hidden />
      {delta.text}
    </span>
  );
}

export interface MetricStripItemProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  delta?: Delta;
  /** Ячейка-фильтр: нажатие сужает список под полосой */
  onSelect?: () => void;
  selected?: boolean;
}

export function MetricStripItem({ icon: Icon, label, value, delta }: MetricStripItemProps) {
  return (
    // Контейнер: в узкой ячейке капсула встаёт рядом со значением, в очень узкой прячется иконка
    <div className="@container min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--r-sm)] bg-surface-2 @max-[200px]:hidden">
          <Icon className="size-[18px] text-text-2" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="line-clamp-2 text-[12px] leading-[1.35] break-words text-text-3"
            title={label}
          >
            {label}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[22px] leading-[1.15] font-semibold text-text md:text-[26px]">
              {value}
            </span>
            {delta && <DeltaPill delta={delta} className="@3xs:hidden" />}
          </div>
        </div>
        {delta && <DeltaPill delta={delta} className="hidden @3xs:inline-flex" />}
      </div>
    </div>
  );
}

/** Карточка полосы: в ряд с 1440px, ниже — сетка по 4 / 3 / 2 */
const stripClass =
  "grid grid-cols-2 overflow-hidden rounded-[var(--r-md)] border border-line bg-surface shadow-[var(--lift-1)] lg:grid-cols-3 xl:grid-cols-4 min-[1440px]:flex min-[1440px]:h-[104px] min-[1440px]:items-center min-[1440px]:px-6";
/** Ячейка: 88px в сетке, во всю высоту полосы в ряд; линии сетки — только внутренние */
const cellClass =
  "flex h-[88px] min-w-0 items-center px-4 md:px-5 min-[1440px]:h-auto min-[1440px]:flex-1 min-[1440px]:px-0";
const separatorClass = "mx-4 hidden h-14 w-px shrink-0 bg-line min-[1440px]:block";

/**
 * Полоса метрик: одна карточка на всю ширину, 4–6 метрик через вертикальные линии 56px (с 1440px).
 * На 1280 — по 4 в ряд, на 1024 — по 3, на планшете и телефоне — по 2 высотой 88px.
 */
export function MetricStrip({
  items,
  className,
}: {
  items: MetricStripItemProps[];
  className?: string;
}) {
  return (
    <section aria-label="Показатели" className={cn(stripClass, className)}>
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && <span aria-hidden className={separatorClass} />}
          {item.onSelect ? (
            <button
              type="button"
              aria-pressed={item.selected}
              onClick={item.onSelect}
              className={cn(
                cellClass,
                gridLines(index),
                "focus-ring relative text-left transition-fast is-hover:bg-surface-2",
                "min-[1440px]:-my-3 min-[1440px]:self-stretch min-[1440px]:rounded-[var(--r-sm)] min-[1440px]:px-3",
                item.selected && "bg-surface-3 is-hover:bg-surface-3",
              )}
            >
              <MetricStripItem {...item} />
            </button>
          ) : (
            <div className={cn(cellClass, gridLines(index))}>
              <MetricStripItem {...item} />
            </div>
          )}
        </Fragment>
      ))}
    </section>
  );
}

/**
 * Внутренние линии сетки без двойных границ: слева — не у первой колонки, сверху — не у первого ряда.
 * Классы записаны целиком: сборщик стилей не видит собранные из частей имена.
 */
function gridLines(index: number) {
  return cn(
    "border-line min-[1440px]:border-t-0 min-[1440px]:border-l-0",
    index % 2 ? "border-l" : "border-l-0",
    index >= 2 ? "border-t" : "border-t-0",
    index % 3 ? "lg:border-l" : "lg:border-l-0",
    index >= 3 ? "lg:border-t" : "lg:border-t-0",
    index % 4 ? "xl:border-l" : "xl:border-l-0",
    index >= 4 ? "xl:border-t" : "xl:border-t-0",
  );
}

export function MetricStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden className={stripClass}>
      {Array.from({ length: count }).map((_, index) => (
        <Fragment key={index}>
          {index > 0 && <span className={separatorClass} />}
          <div className={cn(cellClass, gridLines(index))}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="skeleton size-10 shrink-0 rounded-[var(--r-sm)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="skeleton block h-3 w-20" />
                <span className="skeleton block h-6 w-16" />
              </div>
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
