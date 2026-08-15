import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/mock/projects";

const toneBg: Record<ProjectStatus, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  done: "bg-info",
};

export function ProgressBar({
  value,
  tone = "ok",
  className,
  showValue = false,
}: {
  value: number;
  tone?: ProjectStatus;
  className?: string;
  showValue?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-subtle">
        <span
          className={cn("block h-full rounded-full", toneBg[tone])}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
      {showValue && <span className="tnum shrink-0 text-caption text-text-secondary">{value}%</span>}
    </span>
  );
}
