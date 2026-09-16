import { HelpCircle, ArrowUpRight, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ExplainSource {
  label: string;
  hint?: string;
}

/** «Почему»: как получено значение, формула и первоисточники. */
export function ExplainPopover({
  title,
  formula,
  sources,
  className,
}: {
  title: string;
  formula: string;
  sources: ExplainSource[];
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Как получено значение"
          className={cn(
            "focus-ring grid size-5 shrink-0 place-items-center rounded-full text-text-muted transition-fast hover:bg-hover hover:text-text-primary",
            className,
          )}
        >
          <HelpCircle className="size-3.5" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-medium">{title}</p>
          <p className="mt-1.5 rounded-[var(--r-xs)] bg-subtle px-2 py-1 font-mono text-[12px] text-text-secondary">
            {formula}
          </p>
        </div>
        <ul className="divide-y divide-border">
          {sources.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                className="focus-ring flex w-full items-start gap-2 px-4 py-2.5 text-left transition-fast hover:bg-hover"
              >
                <FileText className="mt-0.5 size-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{s.label}</span>
                  {s.hint && (
                    <span className="block truncate text-caption text-text-muted">{s.hint}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            className="focus-ring inline-flex items-center gap-1 text-caption text-info hover:underline"
          >
            Открыть полный разбор <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
