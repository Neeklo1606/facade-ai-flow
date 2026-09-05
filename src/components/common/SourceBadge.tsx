import { Sparkles } from "lucide-react";
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

/** Значок происхождения данных: какой агент, когда, из какого источника, с какой уверенностью. */
export function SourceBadge({ agent, at, source, confidence, onOpen, className }: SourceInfo & { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Источник: ${source}. Заполнено агентом «${agent}»`}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-accent transition-fast hover:bg-accent-subtle",
            className,
          )}
        >
          <Sparkles className="size-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 space-y-1">
        <div className="text-caption font-medium">Заполнено агентом «{agent}»</div>
        <div className="text-caption text-text-secondary">{fmtDateTime(at)}</div>
        <div className="text-caption text-text-secondary">Источник: {source}</div>
        <ConfidenceIndicator value={confidence} />
        <div className="text-[11px] text-text-muted">Нажмите, чтобы открыть оригинал</div>
      </TooltipContent>
    </Tooltip>
  );
}
