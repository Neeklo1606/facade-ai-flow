import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type RingStatus = "ok" | "warn" | "danger" | "info" | "accent";

const STATUS_COLOR: Record<RingStatus, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  accent: "var(--accent)",
};

const STATUS_GLOW: Record<RingStatus, string> = {
  ok: "0 0 18px rgba(52,119,90,.35)",
  warn: "0 0 18px rgba(140,104,30,.35)",
  danger: "0 0 18px rgba(184,75,67,.4)",
  info: "0 0 18px rgba(71,107,137,.35)",
  accent: "0 0 22px rgba(212,92,45,.4)",
};

/**
 * Кольцо прогресса 72px. Дуга 6px со скруглёнными концами,
 * фон --line, цвет по статусу. В центре — число и подпись.
 * Заполнение анимируется один раз при появлении (600ms ease-out).
 * При значении выше порога — свечение цвета статуса.
 */
export function ProgressRing({
  value,
  max = 100,
  status = "accent",
  label,
  threshold,
  size = 72,
  stroke = 6,
  className,
}: {
  value: number;
  max?: number;
  status?: RingStatus;
  label?: string;
  /** При value >= threshold включается свечение. */
  threshold?: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  const above = threshold != null && value >= threshold;

  // один раз запускаем анимацию заполнения при появлении
  const [animated, setAnimated] = useState(false);
  const ref = useRef(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // игнорируем смену ref-значения для noop
  void ref;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", above && "ring-glow", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={STATUS_COLOR[status]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? offset : circumference}
          style={{
            transition: "stroke-dashoffset 600ms ease-out",
            filter: above ? `drop-shadow(${STATUS_GLOW[status]})` : undefined,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="mono text-[20px] font-semibold tabular-nums text-text-primary">{value}</span>
        {label && <span className="mt-0.5 text-micro text-text-muted">{label}</span>}
      </div>
    </div>
  );
}
