import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImpactChange {
  /** что меняется: «Выполненный объём по захватке 2» */
  label: string;
  /** Не задано — показывается только итоговое значение */
  before?: string;
  after: string;
  /** пояснение: откуда взято новое значение */
  hint?: string;
}

/**
 * Предпросмотр последствий подтверждения: что изменится, из какого значения в какое.
 * Показывается до применения, чтобы человек видел цену решения.
 */
export function ImpactPreview({
  changes,
  title = "Что изменится после подтверждения",
  className,
}: {
  changes: ImpactChange[];
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--r-md)] border border-border bg-subtle", className)}>
      <p className="border-b border-border px-4 py-2.5 text-caption font-medium text-text-secondary">
        {title}
      </p>
      <ul className="divide-y divide-border">
        {changes.map((c) => (
          <li key={c.label} className="px-4 py-3">
            <p className="text-[13px] font-medium">{c.label}</p>
            {c.before != null ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="tnum text-text-muted line-through">{c.before}</span>
                <ArrowRight className="size-3.5 text-text-muted" aria-hidden />
                <span className="tnum font-medium text-text-primary">{c.after}</span>
              </p>
            ) : (
              <p className="tnum mt-0.5 text-[15px] font-semibold text-text-primary">{c.after}</p>
            )}
            {c.hint && <p className="mt-1 text-caption text-text-muted">{c.hint}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
