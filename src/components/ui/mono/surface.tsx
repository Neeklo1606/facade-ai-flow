/**
 * Поверхности «Монохрома» (ADR-055, S3, раздел 2.2): карточка обычная и инверсная,
 * карточка показателя со счётом и спарклайном, ряд показателей и блок «доли».
 */
import type { ReactNode } from "react";
import { useCountUp, useFirstReveal } from "@/hooks/use-first-reveal";
import { sharePercents, type Delta } from "@/lib/ui/mono-logic";
import { cn } from "@/lib/utils";
import { DeltaChip } from "./controls";

export function Card({
  title,
  action,
  inverse = false,
  children,
  className,
  as: Tag = "section",
}: {
  title?: ReactNode;
  /** Справа в шапке карточки: ссылка «Все», переключатель */
  action?: ReactNode;
  /** Чёрная карточка главного показателя: одна на экран */
  inverse?: boolean;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("mono-card", inverse && "mono-card-inverse", className)}>
      {title || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          {title ? <h3 className="type-card min-w-0">{title}</h3> : <span />}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

/** Спарклайн 1,5 px цветом текста, высота 40, рисуется при первом показе */
export function Sparkline({
  values,
  draw = false,
  label,
  className,
}: {
  values: readonly (number | null)[];
  draw?: boolean;
  label?: string;
  className?: string;
}) {
  const points = values
    .map((v, i) => (v === null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null);
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || 1;
  const width = 100;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  // Пропуск рвёт линию: новый отрезок начинается с M после пустой точки
  let path = "";
  let prevIndex = -2;
  for (const p of points) {
    const x = (p.i * step).toFixed(2);
    const y = (36 - ((p.v - min) / span) * 32).toFixed(2);
    path += `${p.i === prevIndex + 1 ? "L" : "M"}${x} ${y} `;
    prevIndex = p.i;
  }
  return (
    <svg
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("h-10 w-full text-ink", draw && "draw-wipe", className)}
    >
      <path
        d={path.trim()}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Карточка показателя: подпись 16, значение 36/40 со счётом при первом показе, единица тише,
 * изменение меткой и подпись «к прошлой неделе», спарклайн на всю ширину. inverse — главный.
 */
export function MetricCard({
  label,
  value,
  format = (v) => String(Math.round(v)),
  unit,
  delta,
  deltaNote = "к прошлой неделе",
  spark,
  inverse = false,
  revealKey,
  note,
  text,
  className,
}: {
  label: string;
  /** null — значения нет, показывается прочерк, а не ноль */
  value: number | null;
  /** Готовая строка значения из расчёта («361,42 ч»): показывается как есть, без счёта */
  text?: string;
  format?: (value: number) => string;
  unit?: string;
  delta?: Delta | null;
  deltaNote?: string;
  spark?: readonly (number | null)[];
  inverse?: boolean;
  /** Ключ первого показа: счёт и рисование только один раз на сессию */
  revealKey?: string;
  note?: ReactNode;
  className?: string;
}) {
  const first = useFirstReveal(revealKey ?? `metric:${label}`);
  const counted = useCountUp(value ?? 0, first && value !== null);
  return (
    <Card inverse={inverse} as="article" className={cn("flex flex-col gap-3", className)}>
      <p className="type-label text-ink-2">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className="type-kpi">{text ?? (value === null ? "—" : format(counted))}</span>
        {unit && value !== null ? <span className="type-text text-ink-3">{unit}</span> : null}
      </p>
      {delta ? (
        <p className="flex flex-wrap items-center gap-2">
          <DeltaChip delta={delta} />
          <span className="type-label text-ink-3">{deltaNote}</span>
        </p>
      ) : note ? (
        <p className="type-label text-ink-3">{note}</p>
      ) : null}
      {spark ? <Sparkline values={spark} draw={first} /> : null}
    </Card>
  );
}

/**
 * Ряд показателей: сетка на компьютере, на телефоне горизонтальная прокрутка с прилипанием
 * (2.5), инверсная карточка первой
 */
export function MetricRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="list"
      aria-label={label}
      className="-mx-gutter flex snap-x snap-mandatory gap-3 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0 [&>*]:w-[78%] [&>*]:shrink-0 [&>*]:snap-start lg:[&>*]:w-auto"
    >
      {children}
    </div>
  );
}

export interface ShareItem {
  key: string;
  label: string;
  note?: string;
  value: number;
  /** Подпись суммы справа: «1 102 000 ₽» */
  amount: string;
  delta?: Delta | null;
}

/**
 * Блок «доли» (2.2): два крупных процента, полоса 10 (чёрная и серая), ниже строки:
 * квадрат цвета, название, пояснение, сумма справа и метка изменения
 */
export function ShareBar({ items, label }: { items: readonly ShareItem[]; label: string }) {
  const percents = sharePercents(items.map((i) => ({ key: i.key, value: i.value })));
  const [a, b] = items;
  const tone = (index: number) =>
    index === 0 ? "bg-ink" : index === 1 ? "bg-ink-3" : "bg-panel-3";
  return (
    <div className="flex flex-col gap-4" aria-label={label} role="group">
      <div className="flex items-baseline gap-6">
        {[a, b].map((item) =>
          item ? (
            <p key={item.key} className="flex items-baseline gap-2">
              <span className="type-kpi">{percents[item.key]}%</span>
              <span className="type-label text-ink-3">{item.label}</span>
            </p>
          ) : null,
        )}
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-pill bg-panel-2" aria-hidden>
        {items.map((item, i) => (
          <span
            key={item.key}
            className={cn("h-full", tone(i))}
            style={{ width: `${percents[item.key]}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((item, i) => (
          <li key={item.key} className="flex items-center gap-3 py-3">
            <span aria-hidden className={cn("size-3 shrink-0", tone(i))} />
            <span className="min-w-0 flex-1">
              <span className="block truncate type-text">{item.label}</span>
              {item.note ? (
                <span className="block truncate type-small text-ink-3">{item.note}</span>
              ) : null}
            </span>
            <span className="shrink-0 type-text tnum">{item.amount}</span>
            {item.delta ? <DeltaChip delta={item.delta} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
