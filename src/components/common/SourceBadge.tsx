import { FileSearch, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { ConfidenceIndicator } from "./ConfidenceIndicator";

export interface SourceInfo {
  agent: string;
  at: string;
  source: string;
  confidence: number;
  onOpen?: () => void;
}

/**
 * Значок источника: квадрат 24px, --surface-2, иконка 13px --text-3; при наведении — --info.
 * В подсказке: какой агент, когда, из какого источника, с какой уверенностью.
 */
export function SourceBadge({
  agent,
  at,
  source,
  confidence,
  onOpen,
  icon: Icon = FileSearch,
  force,
  className,
}: SourceInfo & {
  icon?: LucideIcon;
  /** Только для витрины: состояние наведения или фокуса без мыши */
  force?: "hover" | "focus";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Источник: ${source}. Заполнено агентом «${agent}»`}
          data-force={force}
          className={cn(
            "group focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-surface-2 text-text-3 transition-fast is-hover:bg-info-bg is-hover:text-info",
            className,
          )}
        >
          <Icon className="size-[13px]" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 space-y-1">
        <div className="text-caption font-medium">Заполнено агентом «{agent}»</div>
        <div className="text-caption text-text-secondary">{fmtDateTime(at)}</div>
        <div className="text-caption text-text-secondary">Источник: {source}</div>
        <ConfidenceIndicator value={confidence} />
        <div className="text-[11px] text-text-muted">Нажмите, чтобы открыть источник</div>
      </TooltipContent>
    </Tooltip>
  );
}
