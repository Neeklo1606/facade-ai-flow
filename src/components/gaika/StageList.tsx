import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Видимая работа модели (D1, п. 5): этапы текстом по очереди вместо спиннера. Пройденный
 * этап с галочкой, текущий крупно и ярче с тихой точкой, будущие тише. Вид v3: строки
 * крупные, читаются с вытянутой руки поверх песочного поля.
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
    <ol className={cn("flex flex-col gap-1", className)} aria-live="polite">
      {stages.map((stage, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li
            key={stage}
            className={cn(
              "flex min-h-12 items-center gap-3 transition-[opacity,color] duration-200",
              now ? "text-card-title text-text" : "text-body",
              done ? "text-text-2" : !now && "text-text-3 opacity-70",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-200",
                done ? "bg-ok-bg text-ok" : now ? "bg-text/10" : "bg-text/5",
              )}
            >
              {done ? (
                <Check className="size-4" strokeWidth={2.25} />
              ) : now ? (
                <span className="bg-text size-2 rounded-full motion-safe:animate-pulse" />
              ) : null}
            </span>
            {stage}
          </li>
        );
      })}
    </ol>
  );
}
