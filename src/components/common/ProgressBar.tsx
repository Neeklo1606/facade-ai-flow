import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProgressTone = "ok" | "warn" | "danger" | "info" | "accent";

const fill: Record<ProgressTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-orange",
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Полоса прогресса 6px; reference — риска эталона (например, план на сегодня) */
export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  reference,
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  reference?: number;
  /** Подпись для чтения с экрана */
  label: string;
  className?: string;
}) {
  const ratio = max > 0 ? clamp(value / max) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("relative h-1.5 w-full rounded-full bg-surface-3", className)}
    >
      <div className={cn("h-full rounded-full", fill[tone])} style={{ width: `${ratio * 100}%` }} />
      {reference != null && max > 0 && (
        <span
          aria-hidden
          className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-text"
          style={{ left: `${clamp(reference / max) * 100}%` }}
        />
      )}
    </div>
  );
}

/** Прогресс в ячейке таблицы: полоса, значение 13px и бейдж статуса */
export function ProgressCell({
  value,
  max = 100,
  tone,
  reference,
  valueLabel,
  badge,
  label,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  reference?: number;
  valueLabel: ReactNode;
  badge?: ReactNode;
  label: string;
}) {
  return (
    <div className="flex min-w-[220px] items-center gap-3">
      <ProgressBar
        value={value}
        max={max}
        label={label}
        className="min-w-16 flex-1"
        {...(tone ? { tone } : {})}
        {...(reference != null ? { reference } : {})}
      />
      <span className="shrink-0 text-[13px] font-medium text-text tabular-nums">{valueLabel}</span>
      {badge}
    </div>
  );
}
