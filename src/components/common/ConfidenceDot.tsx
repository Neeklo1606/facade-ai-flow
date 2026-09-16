import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { confidenceLevel, confidenceLevelLabel } from "./ConfidenceIndicator";

const dotClass: Record<"high" | "mid" | "low", string> = {
  high: "bg-conf-high",
  mid: "bg-conf-mid",
  low: "bg-conf-low",
};

const wordLabel = confidenceLevelLabel;

/**
 * Компактная точка уверенности рядом с извлечённым полем.
 * Слово — в подсказке, проценты — только там же.
 */
export function ConfidenceDot({ value, className }: { value: number; className?: string }) {
  const level = confidenceLevel(value);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Уверенность: ${wordLabel[level]}`}
          className={cn(
            "inline-block size-2 shrink-0 cursor-help rounded-full align-middle",
            dotClass[level],
            className,
          )}
        />
      </TooltipTrigger>
      <TooltipContent>
        {wordLabel[level]} · уверенность{" "}
        <span className="tnum font-medium">{Math.round(value * 100)}%</span>
      </TooltipContent>
    </Tooltip>
  );
}

export { wordLabel as confidenceWord };
