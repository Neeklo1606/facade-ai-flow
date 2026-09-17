import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageActions } from "@/components/layout/PageActions";

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
    // Без описания и меток видимой части нет: заголовок и действия уже в шапке контента
    <div
      className={
        parts || meta
          ? "mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
          : "contents"
      }
    >
      <div className="min-w-0">
        {/* Заголовок страницы показывает шапка контента; здесь он остаётся для чтения с экрана */}
        <h1 className="sr-only">{title}</h1>
        {parts && (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-text-secondary">
            <span className="truncate">{parts.lead}</span>
            {parts.rest && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Подробнее"
                    className="focus-ring inline-grid size-11 shrink-0 place-items-center text-text-muted hover:text-text-primary lg:size-auto"
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
      {actions && <PageActions>{actions}</PageActions>}
    </div>
  );
}
