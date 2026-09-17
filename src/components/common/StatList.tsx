import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Список показателей для узких колонок: строка 40px, ритм задаёт высота, разделителей нет */
export function StatList({
  items,
  leader = "dots",
  className,
}: {
  items: { label: string; value: ReactNode }[];
  leader?: "dots" | "none";
  className?: string;
}) {
  return (
    <dl className={cn("min-w-0", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex h-10 min-w-0 items-center">
          <dt className="min-w-0 truncate text-[13px] text-text-2">{item.label}</dt>
          {leader === "dots" ? (
            <span aria-hidden className="leader-dots" />
          ) : (
            <span aria-hidden className="min-w-4 flex-1" />
          )}
          <dd className="shrink-0 text-[14px] font-medium text-text tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
