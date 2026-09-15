import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function confidenceLevel(value: number) {
  if (value >= 0.85) return "high" as const;
  if (value >= 0.7) return "mid" as const;
  return "low" as const;
}

const dot: Record<"high" | "mid" | "low", string> = {
  high: "bg-conf-high",
  mid: "bg-conf-mid",
  low: "bg-conf-low",
};

const label: Record<"high" | "mid" | "low", string> = {
  high: "Проверено",
  mid: "Требует внимания",
  low: "Не удалось определить",
};

const textTone: Record<"high" | "mid" | "low", string> = {
  high: "text-text-secondary",
  mid: "text-conf-mid",
  low: "text-conf-low",
};

export { label as confidenceLevelLabel };

/**
 * Та же точка и слово без подсказки — для длинных списков,
 * где сотни тултипов тормозят интерфейс.
 */
export function ConfidenceLabel({ value, className }: { value: number; className?: string }) {
  const level = confidenceLevel(value);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-caption", className)} title={`Уверенность ${Math.round(value * 100)}%`}>
      <span className={cn("size-2 shrink-0 rounded-full", dot[level])} aria-hidden />
      <span className={cn("font-medium", textTone[level])}>{label[level]}</span>
    </span>
  );
}

/** Уверенность модели человеческим языком; число — в тултипе. */
export function ConfidenceIndicator({
  value,
  showValue = false,
  className,
}: {
  value: number;
  showValue?: boolean;
  className?: string;
}) {
  const level = confidenceLevel(value);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex cursor-help items-center gap-1.5 text-caption", className)}>
          <span className={cn("size-2 shrink-0 rounded-full", dot[level])} aria-hidden />
          <span className={cn("font-medium", textTone[level])}>{label[level]}</span>
          {showValue && <span className="tnum text-text-muted">{value.toFixed(2)}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Уверенность: <span className="tnum font-medium">{Math.round(value * 100)}%</span>
      </TooltipContent>
    </Tooltip>
  );
}
