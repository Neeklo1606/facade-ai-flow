import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Polarity = "higher-better" | "lower-better" | "neutral";

/** Тренд-спарклайн 72×28: только линия, без осей, точек и заливки. */
function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  const w = 72;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (w - 3) + 1.5;
      const y = h - 3 - ((v - min) / span) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function deltaTone(delta: number, polarity: Polarity) {
  if (delta === 0 || polarity === "neutral") return "muted" as const;
  const better = polarity === "higher-better" ? delta > 0 : delta < 0;
  return better ? ("good" as const) : ("bad" as const);
}

export function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  delta = 0,
  deltaText,
  periodLabel = "за неделю",
  polarity = "neutral",
  trend,
  variant = "plain",
  tone = "neutral",
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  deltaText?: string;
  periodLabel?: string;
  polarity?: Polarity;
  trend?: number[];
  variant?: "plain" | "accent";
  tone?: "neutral" | "danger" | "warn" | "ok";
  active?: boolean;
  onClick?: () => void;
}) {
  const dTone = deltaTone(delta, polarity);
  const lineColor = dTone === "good" ? "var(--ok)" : dTone === "bad" ? "var(--danger)" : "var(--text-muted)";
  const valueTone =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-text-primary";
  const stripe = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-accent";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "card-surface focus-ring relative flex h-[118px] w-full cursor-pointer flex-col justify-between overflow-hidden p-4 text-left transition-fast hover:shadow-[var(--shadow-sm)]",
        variant === "accent" && tone === "danger" && "bg-danger-bg",
        variant === "accent" && tone === "warn" && "bg-warn-bg",
        active && "border-border-strong shadow-[var(--shadow-sm)]",
      )}
    >
      {variant === "accent" && <span className={cn("absolute inset-y-0 left-0 w-[3px]", stripe)} aria-hidden />}
      <div className="flex items-start justify-between gap-3">
        <span className="truncate text-caption text-text-secondary" title={label}>
          {label}
        </span>
        <Icon className="size-4 shrink-0 text-text-muted" strokeWidth={1.5} />
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1">
          <span
            className={cn(
              "leading-none font-semibold tracking-[-0.02em] tnum",
              value.length > 4 ? "text-[26px]" : "text-[34px]",
              valueTone,
            )}
          >
            {value}
          </span>
          {unit && <span className="text-[13px] text-text-secondary">{unit}</span>}
        </span>
        {trend && trend.length > 1 && <span className="hidden sm:block"><Sparkline data={trend} stroke={lineColor} /></span>}
      </div>

      <div className="flex items-center gap-1.5 text-caption">
        <span
          className={cn(
            "tnum font-medium",
            dTone === "good" ? "text-ok" : dTone === "bad" ? "text-danger" : "text-text-muted",
          )}
        >
          {delta === 0 ? "→" : delta > 0 ? "↑" : "↓"} {deltaText ?? `${delta > 0 ? "+" : ""}${delta}`}
        </span>
        <span className="text-text-muted">{periodLabel}</span>
      </div>
    </button>
  );
}
