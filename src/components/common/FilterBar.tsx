import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
        "sticky top-0 z-20 flex h-14 min-h-14 items-center gap-2 overflow-x-auto border-b border-border bg-surface px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-fast lg:h-9",
        active
          ? "bg-surface-3 text-text shadow-[var(--lift-1)]"
          : "bg-transparent text-text-2 is-hover:bg-surface-2 is-hover:text-text",
        className,
      )}
    >
      {children}
      {count != null && <span className="text-[12px] font-normal text-text-3">{count}</span>}
    </button>
  );
}
