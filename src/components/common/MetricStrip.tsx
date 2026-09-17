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
}

export function MetricStripItem({ icon: Icon, label, value, delta }: MetricStripItemProps) {
  return (
    // Контейнер: в узкой ячейке (5–6 метрик) капсула встаёт рядом со значением, чтобы не резать подпись
    <div className="@container min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--r-sm)] bg-surface-2">
          <Icon className="size-[18px] text-text-2" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] leading-[1.4] text-text-3" title={label}>
            {label}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[26px] leading-[1.15] font-semibold text-text">
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

/**
 * Полоса метрик: одна карточка на всю ширину, 4–6 метрик через вертикальные линии.
 * На узком экране метрики встают в две колонки без линий.
 */
export function MetricStrip({
  items,
  className,
}: {
  items: MetricStripItemProps[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid grid-cols-1 gap-4 rounded-[var(--r-md)] border border-line bg-surface p-5 shadow-[var(--lift-1)] sm:grid-cols-2 lg:flex lg:h-[104px] lg:items-center lg:gap-0 lg:px-6 lg:py-0",
        className,
      )}
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && (
            <span aria-hidden className="mx-4 hidden h-14 w-px shrink-0 bg-line lg:block" />
          )}
          <MetricStripItem {...item} />
        </Fragment>
      ))}
    </section>
  );
}

export function MetricStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 gap-4 rounded-[var(--r-md)] border border-line bg-surface p-5 sm:grid-cols-2 lg:flex lg:h-[104px] lg:items-center lg:gap-0 lg:px-6 lg:py-0"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="mx-4 hidden h-14 w-px shrink-0 bg-line lg:block" />}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="skeleton size-10 shrink-0 rounded-[var(--r-sm)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <span className="skeleton block h-3 w-20" />
              <span className="skeleton block h-6 w-16" />
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
