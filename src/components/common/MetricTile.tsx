import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaGood,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaGood?: boolean;
  tone?: "neutral" | "danger" | "warn" | "ok";
}) {
  const valueTone =
    tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-text-primary";
  return (
    <div className="card-surface min-h-[148px] p-5">
      <div className="flex items-center justify-between gap-3 text-text-secondary">
        <span className="text-caption">{label}</span>
        <Icon className="size-[18px] text-text-muted" strokeWidth={1.75} />
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className={cn("text-[40px] leading-none font-semibold tnum", valueTone)}>{value}</span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
      </div>
      {delta && (
        <div className={cn("mt-3 text-caption tnum", deltaGood ? "text-ok" : "text-danger")}>
          {deltaGood ? "↗" : "↘"} {delta} <span className="text-text-muted">к прошлой неделе</span>
        </div>
      )}
    </div>
  );
}
