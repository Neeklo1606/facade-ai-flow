/**
 * График «по времени» (ADR-055, раздел 2.2) на Recharts. Отдельный файл: Recharts грузится
 * только с экранами, где график есть, а не с оболочкой.
 *
 * Текущий период — линия 2 px цветом текста и заливка градиентом 6 % → 0, прошлый —
 * пунктир ink-3. Подсказка: белая карточка, дата, два значения, разница зелёным или красным.
 * Курсор — вертикальная линия и круг на точке. Пропуск данных рвёт линию (connectNulls
 * выключен), ноль не подставляется: точки готовит chartPoints.
 */
import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { useFirstReveal } from "@/hooks/use-first-reveal";
import { pointDelta, type ChartPoint } from "@/lib/ui/mono-logic";
import { DeltaChip } from "./controls";

function ChartTip({
  active,
  payload,
  format,
  currentLabel,
  previousLabel,
  better,
}: TooltipProps<number, string> & {
  format: (value: number) => string;
  currentLabel: string;
  previousLabel: string;
  better: "up" | "down";
}) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  const delta = pointDelta(point, better);
  return (
    <div className="flex min-w-48 flex-col gap-1.5 rounded-inset bg-card p-3 text-ink shadow-floating">
      <p className="type-small text-ink-3">{point.x}</p>
      <p className="flex items-center justify-between gap-4 type-label">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 bg-ink" />
          {currentLabel}
        </span>
        <span className="tnum">
          {point.current === null ? "нет данных" : format(point.current)}
        </span>
      </p>
      {point.previous !== null ? (
        <p className="flex items-center justify-between gap-4 type-label text-ink-2">
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 border-t border-dashed border-ink-3" />
            {previousLabel}
          </span>
          <span className="tnum">{format(point.previous)}</span>
        </p>
      ) : null}
      {delta ? (
        <span className="self-start">
          <DeltaChip delta={delta} />
        </span>
      ) : null}
    </div>
  );
}

export function TimeChart({
  points,
  label,
  format = (v) => String(v),
  currentLabel = "Эта неделя",
  previousLabel = "Прошлая неделя",
  compare = true,
  better = "up",
  height = 260,
  revealKey,
}: {
  points: readonly ChartPoint[];
  /** Подпись графика для читалок: что показано и за какой период */
  label: string;
  format?: (value: number) => string;
  currentLabel?: string;
  previousLabel?: string;
  /** Показывать прошлый период пунктиром */
  compare?: boolean;
  better?: "up" | "down";
  height?: number;
  revealKey?: string;
}) {
  const gradient = useId().replace(/:/g, "");
  const first = useFirstReveal(revealKey ?? `chart:${label}`);
  const hasPrevious = compare && points.some((p) => p.previous !== null);
  return (
    <figure aria-label={label} className="m-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={[...points]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.06} />
              <stop offset="100%" stopColor="var(--ink)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--ink-3)", fontSize: 13 }}
            dy={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: "var(--ink-3)", fontSize: 13 }}
            tickFormatter={(v: number) => format(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
            content={
              <ChartTip
                format={format}
                currentLabel={currentLabel}
                previousLabel={previousLabel}
                better={better}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="current"
            stroke="none"
            fill={`url(#${gradient})`}
            connectNulls={false}
            isAnimationActive={first}
            animationDuration={700}
          />
          {hasPrevious ? (
            <Line
              type="monotone"
              dataKey="previous"
              stroke="var(--ink-3)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={first}
              animationDuration={700}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="current"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={first}
            animationDuration={700}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
