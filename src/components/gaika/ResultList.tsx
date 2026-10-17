import { FileText, ListChecks, TriangleAlert, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Экран результата (продукт, раздел 7): одно голосовое может дать отчёт, задачу и запрос.
 * Любой элемент исключается до подтверждения, поэтому исключение показывается строкой
 * с возвратом, а не исчезновением: человек должен видеть, что именно он убрал.
 */
export type ResultKind = "report" | "task" | "risk";

const kindView: Record<ResultKind, { label: string; icon: typeof FileText; tone: string }> = {
  report: { label: "Отчёт", icon: FileText, tone: "text-ember" },
  task: { label: "Задача", icon: ListChecks, tone: "text-sand" },
  risk: { label: "Запрос", icon: TriangleAlert, tone: "text-risk" },
};

export interface ResultItem {
  id: string;
  kind: ResultKind;
  title: string;
  excluded?: boolean;
}

export function ResultList({
  items,
  onToggle,
  className,
}: {
  items: ResultItem[];
  /** Исключить элемент или вернуть его обратно */
  onToggle?: (id: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => {
        const { label, icon: Icon, tone } = kindView[item.kind];
        const excluded = item.excluded === true;
        return (
          <li
            key={item.id}
            className={cn(
              "bg-surface flex items-center gap-3 rounded-[var(--r-md)] px-4 py-3",
              excluded && "opacity-55",
            )}
          >
            <Icon className={cn("size-5 shrink-0", excluded ? "text-text-3" : tone)} />
            <span className="min-w-0 flex-1">
              <span className="text-overline text-text-3 block">{label}</span>
              <span className={cn("text-list block truncate", excluded && "line-through")}>
                {item.title}
              </span>
            </span>
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-label={excluded ? `Вернуть: ${item.title}` : `Исключить: ${item.title}`}
                className="focus-ring press text-text-2 is-hover:text-text grid size-12 shrink-0 place-items-center rounded-[var(--r-sm)]"
              >
                {excluded ? <Undo2 className="size-4" /> : <X className="size-4" />}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
