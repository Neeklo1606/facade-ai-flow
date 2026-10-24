import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Данные «Графита» (ADR-052): полоса показателей со спарклайнами, панель с плиткой иконки
 * и выводом в подвале, ProgressStack, BarList, ColumnChart. Цвета только токенами серий:
 * mint, sky, lavender, teal, pink, periwinkle; amber и coral в графиках не используются.
 * Каждое число приходит из расчёта: компоненты ничего не придумывают и не округляют.
 */

export const SERIES = ["mint", "sky", "lavender", "teal", "pink", "periwinkle"] as const;
export type Series = (typeof SERIES)[number];

const FILL: Record<Series, string> = {
  mint: "bg-mint",
  sky: "bg-sky",
  lavender: "bg-lavender",
  teal: "bg-teal",
  pink: "bg-pink",
  periwinkle: "bg-periwinkle",
};
const STROKE: Record<Series, string> = {
  mint: "stroke-mint",
  sky: "stroke-sky",
  lavender: "stroke-lavender",
  teal: "stroke-teal",
  pink: "stroke-pink",
  periwinkle: "stroke-periwinkle",
};

/** Спарклайн: ломаная по точкам без осей. Пустой ряд или одна точка — ничего не рисуем */
export function Sparkline({
  values,
  series = "mint",
  label,
}: {
  values: number[];
  series?: Series;
  label: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-8 w-full"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={STROKE[series]}
      />
    </svg>
  );
}

export interface Kpi {
  label: string;
  value: ReactNode;
  /** Строка под числом: период, источник или «План не задан» */
  note?: ReactNode;
  trend?: number[];
  series?: Series;
  testId?: string;
}

/** Полоса показателей: телефон 2 × 2, планшет и компьютер в ряд */
export function KpiStrip({ items, label }: { items: Kpi[]; label: string }) {
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-block lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="surface-1 flex min-w-0 flex-col gap-1 p-card"
          data-testid={item.testId}
        >
          <span className="truncate text-meta text-text-3">{item.label}</span>
          <span className="truncate text-title tnum">{item.value}</span>
          {item.trend ? (
            <Sparkline
              values={item.trend}
              series={item.series ?? "mint"}
              label={`${item.label}: по дням недели`}
            />
          ) : null}
          {item.note ? <span className="text-meta text-text-3">{item.note}</span> : null}
        </div>
      ))}
    </section>
  );
}

/** Панель: плитка иконки, заголовок, содержимое и вывод одной строкой в подвале */
export function Panel({
  icon: Icon,
  title,
  action,
  footer,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("surface-1 flex min-w-0 flex-col", className)}>
      <header className="flex items-center gap-3 p-card pb-0">
        {Icon ? (
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-control bg-panel-2 text-ink-2"
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate text-heading">{title}</h2>
        {action}
      </header>
      <div className="min-w-0 flex-1 p-card">{children}</div>
      {footer ? (
        <footer className="border-t border-line px-card py-3 text-meta text-text-2">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export interface StackPart {
  label: string;
  value: number;
  /** Подпись значения: «6 записей», «1 524 132 ₽» */
  text: string;
}

/** ProgressStack: части целого одной полосой и легендой. Части складываются в целое */
export function ProgressStack({ parts, label }: { parts: StackPart[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.text}`).join(", ")}`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-panel-2"
      >
        {total > 0
          ? parts.map((p, i) =>
              p.value > 0 ? (
                <span
                  key={p.label}
                  className={cn("h-full", FILL[SERIES[i % SERIES.length]!])}
                  style={{ width: `${(p.value / total) * 100}%` }}
                />
              ) : null,
            )
          : null}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {parts.map((p, i) => (
          <li key={p.label} className="flex min-w-0 items-center gap-2 text-meta">
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", FILL[SERIES[i % SERIES.length]!])}
            />
            <span className="min-w-0 flex-1 truncate text-text-2">{p.label}</span>
            <span className="shrink-0 text-text tnum">{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarItem {
  id: string;
  label: string;
  value: number;
  text: string;
  meta?: string;
}

/** BarList: строки с полосой доли от наибольшего. Порядок задаёт вызывающий */
export function BarList({
  items,
  series = "mint",
  empty,
}: {
  items: BarItem[];
  series?: Series;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-body text-text-3">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-body">{item.label}</span>
            <span className="shrink-0 text-body-strong tnum">{item.text}</span>
          </div>
          <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
            <span
              className={cn("block h-full rounded-full", FILL[series])}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          {item.meta ? <span className="text-meta text-text-3">{item.meta}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export interface Column {
  key: string;
  label: string;
  value: number;
  text: string;
}

/** ColumnChart: столбцы по дням. Нулевой день — тонкая линия, а не пропуск */
export function ColumnChart({
  columns,
  series = "sky",
  label,
}: {
  columns: Column[];
  series?: Series;
  label: string;
}) {
  const max = Math.max(1, ...columns.map((c) => c.value));
  return (
    <figure aria-label={label} className="flex flex-col gap-2">
      <div className="flex h-36 items-end gap-2">
        {columns.map((c) => (
          <div key={c.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <span className="truncate text-center text-meta text-text-3 tnum">{c.text}</span>
            <span
              className={cn("block w-full rounded-control", FILL[series])}
              style={{ height: `${Math.max(2, (c.value / max) * 100)}%` }}
              title={`${c.label}: ${c.text}`}
            />
          </div>
        ))}
      </div>
      <figcaption className="flex gap-2">
        {columns.map((c) => (
          <span key={c.key} className="min-w-0 flex-1 truncate text-center text-meta text-text-3">
            {c.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
