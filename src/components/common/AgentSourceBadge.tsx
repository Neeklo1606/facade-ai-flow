import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface AgentSource {
  agent: string;
  at: string;
  source: string;
}

export function AgentSourceBadge({ agent, at, source, className }: AgentSource & { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-accent transition-fast hover:bg-accent-subtle",
            className,
          )}
          aria-label={`Заполнено агентом «${agent}»`}
        >
          <Sparkles className="size-3" strokeWidth={2} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <div className="text-caption">
          <div className="font-medium">Заполнено агентом «{agent}»</div>
          <div className="text-text-muted">{at}</div>
          <div className="text-text-muted">Источник: {source}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
