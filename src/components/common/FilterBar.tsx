import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Панель фильтров реестра: высота 56px, прилипает при скролле.
 * Слева — условия отбора, справа — счётчик и сброс.
 */
export function FilterBar({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** Кнопка-условие отбора внутри панели фильтров. */
export function FilterChip({
  active,
  count,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  count?: number;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-11 shrink-0 gap-2 border px-3 text-[13px] lg:h-9",
        active ? "border-line-2 bg-surface-3 text-text" : "border-transparent text-text-2",
        className,
      )}
    >
      {children}
      {count != null && <span className="text-[12px] font-normal text-text-3">{count}</span>}
    </Button>
  );
}
