import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function splitDescription(text: string) {
  const idx = text.indexOf(". ");
  if (idx === -1 || text.length <= 96) return { lead: text, rest: "" };
  return { lead: text.slice(0, idx + 1), rest: text.slice(idx + 2) };
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  const parts = description ? splitDescription(description) : null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {parts && (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-text-secondary">
            <span className="truncate">{parts.lead}</span>
            {parts.rest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Подробнее"
                    className="focus-ring shrink-0 text-text-muted hover:text-text-primary"
                  >
                    <Info className="size-3.5" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{parts.rest}</TooltipContent>
              </Tooltip>
            )}
          </p>
        )}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
