import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { processingStages } from "@/contracts";

/**
 * Полоса стадий обработки документа. Каждая стадия подписана:
 * человек видит, на каком шаге файл, а не безликий спиннер.
 */
export function ProcessingStages({ stage, compact }: { stage: number; compact?: boolean }) {
  return (
    <ol
      className={cn("grid grid-cols-5 gap-1", compact ? "min-w-[360px]" : "")}
      aria-label="Стадии обработки"
    >
      {processingStages.map((label, index) => {
        const done = index < stage || (index === stage && stage === processingStages.length - 1);
        const current = index === stage && !done;
        return (
          <li key={label} className="min-w-0" aria-current={current ? "step" : undefined}>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  done ? "w-full bg-ok" : current ? "w-1/2 bg-accent" : "w-0",
                )}
              />
            </div>
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1 truncate text-[11px]",
                done
                  ? "text-text-secondary"
                  : current
                    ? "font-medium text-text-primary"
                    : "text-text-muted",
              )}
              title={label}
            >
              {done && <Check className="size-3 shrink-0 text-ok" />}
              {current && (
                <span className="pulse-dot size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              )}
              <span className="truncate">{label}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
