import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Видимая работа модели (D1, п. 5): этапы текстом по очереди вместо спиннера. Пройденный
 * этап с галочкой, текущий ярче, будущие тише.
 */
export function StageList({
  stages,
  current,
  className,
}: {
  stages: readonly string[];
  /** Сколько этапов пройдено; равно длине — всё готово */
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-col gap-3", className)} aria-live="polite">
      {stages.map((stage, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li
            key={stage}
            className={cn(
              "text-body flex items-center gap-3 transition-opacity duration-200",
              done ? "text-text" : now ? "text-text-2" : "text-text-3 opacity-60",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full",
                done ? "bg-ok/15 text-ok" : "bg-surface-2",
              )}
            >
              {done ? <Check className="size-3.5" /> : null}
            </span>
            {stage}
          </li>
        );
      })}
    </ol>
  );
}
