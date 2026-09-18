import { HelpCircle, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ExplainSource {
  label: string;
  hint?: string | undefined;
  /** Первоисточник значения: строка открывает его в панели деталей */
  sourceId?: string | null | undefined;
}

/**
 * «Как получено»: формула величины одной строкой и первоисточники, из которых она собрана.
 * Строка источника кликабельна только тогда, когда её есть чем открыть (TASK-A2, п. 1).
 */
export function ExplainPopover({
  title,
  formula,
  sources,
  onOpenSource,
  className,
}: {
  title: string;
  formula: string;
  sources: ExplainSource[];
  onOpenSource?: (sourceId: string) => void;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Как получено значение: ${title}`}
          className={cn(
            // Палец попадает в 44px, а рисунок остаётся значком 20px: отрицательное поле
            // не даёт кнопке раздвинуть строку подписи
            "focus-ring -m-3 grid size-11 shrink-0 place-items-center rounded-full text-text-3 transition-fast hover:bg-surface-3 hover:text-text lg:m-0 lg:size-5",
            className,
          )}
        >
          <HelpCircle className="size-3.5" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <div className="border-b border-line px-4 py-3">
          <p className="text-[13px] font-medium text-text">{title}</p>
          <p className="mt-1.5 rounded-[var(--r-xs)] bg-surface-2 px-2 py-1 text-[12px] leading-[1.45] text-text-2">
            {formula}
          </p>
        </div>
        {sources.length > 0 && (
          <ul className="divide-y divide-line">
            {sources.map((source) => {
              const open = source.sourceId && onOpenSource;
              const body = (
                <>
                  <FileText className="mt-0.5 size-3.5 shrink-0 text-text-3" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">{source.label}</span>
                    {source.hint && (
                      <span className="block truncate text-[12px] text-text-3">{source.hint}</span>
                    )}
                  </span>
                </>
              );
              return (
                <li key={source.label}>
                  {open ? (
                    <button
                      type="button"
                      onClick={() => onOpenSource(source.sourceId!)}
                      className="focus-ring flex min-h-11 w-full items-start gap-2 px-4 py-2.5 text-left transition-fast is-hover:bg-surface-2"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-start gap-2 px-4 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
