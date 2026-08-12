import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type Confidence = "high" | "medium" | "low";

const meta: Record<Confidence, { color: string; label: string }> = {
  high: { color: "bg-ok", label: "Высокая уверенность агента" },
  medium: { color: "bg-warn", label: "Средняя уверенность агента" },
  low: { color: "bg-danger", label: "Низкая уверенность — требует проверки" },
};

export function ConfidenceIndicator({
  level,
  showLabel = false,
  className,
}: {
  level: Confidence;
  showLabel?: boolean;
  className?: string;
}) {
  const m = meta[level];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1.5 align-middle", className)}>
          <span className={cn("size-2 shrink-0 rounded-full", m.color)} />
          {(showLabel || level === "low") && (
            <span
              className={cn(
                "text-caption",
                level === "low" ? "text-danger font-medium" : "text-text-muted",
              )}
            >
              {level === "low" ? "Требует проверки" : m.label}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{m.label}</TooltipContent>
    </Tooltip>
  );
}
