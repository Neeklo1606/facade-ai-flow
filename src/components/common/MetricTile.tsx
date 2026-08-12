import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricTile({
  label,
  value,
  suffix,
  delta,
  deltaLabel = "за неделю",
  invert = false,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  suffix?: string;
  delta?: number;
  deltaLabel?: string;
  /** true when a growing value is bad */
  invert?: boolean;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const up = (delta ?? 0) > 0;
  const flat = !delta;
  const good = invert ? !up : up;
  const DeltaIcon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="card-surface p-5 transition-fast hover:bg-subtle">
      <div className="text-caption text-text-secondary">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "tnum text-[28px] leading-none font-semibold",
            tone === "danger" && "text-danger",
            tone === "warn" && "text-warn",
            tone === "ok" && "text-ok",
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-caption text-text-muted">{suffix}</span>}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <DeltaIcon
          className={cn(
            "size-3.5",
            flat ? "text-text-muted" : good ? "text-ok" : "text-danger",
          )}
        />
        <span
          className={cn(
            "tnum text-caption font-medium",
            flat ? "text-text-muted" : good ? "text-ok" : "text-danger",
          )}
        >
          {flat ? "без изменений" : `${up ? "+" : ""}${delta}`}
        </span>
        <span className="text-caption text-text-muted">{deltaLabel}</span>
      </div>
    </div>
  );
}
