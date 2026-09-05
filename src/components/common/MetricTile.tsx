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
    <div className="card-surface p-5">
      <div className="flex items-center gap-2 text-text-secondary">
        <Icon className="size-4" strokeWidth={1.75} />
        <span className="text-caption">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("text-[26px] leading-none font-semibold tnum", valueTone)}>{value}</span>
        {unit && <span className="text-caption text-text-muted">{unit}</span>}
      </div>
      {delta && (
        <div className={cn("mt-2 text-caption tnum", deltaGood ? "text-ok" : "text-danger")}>
          {delta} <span className="text-text-muted">к прошлой неделе</span>
        </div>
      )}
    </div>
  );
}
