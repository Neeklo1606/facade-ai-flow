import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface PillTab<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Только для витрины: показать состояние наведения или фокуса без мыши */
  force?: "hover" | "focus";
}

/**
 * Табы-пилюли. variant="primary" — главный фильтр экрана с оранжевой активной пилюлей;
 * на экране такой набор один.
 */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = "default",
  label,
  className,
}: {
  tabs: PillTab<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "default" | "primary";
  /** Подпись набора для чтения с экрана */
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Стрелки переводят фокус и выбор, как у обычных вкладок
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    refs.current[next]?.focus();
    onChange(tab.value);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-surface p-1",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-force={tab.force}
            data-tour={`tab-${tab.value}`}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "focus-ring inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-[18px] lg:h-9 text-[13px] leading-none font-medium whitespace-nowrap transition-fast",
              !active && "bg-transparent text-text-2 is-hover:bg-surface-2",
              active &&
                (variant === "primary"
                  ? "bg-orange-strong text-on-orange"
                  : "bg-surface-3 text-text shadow-[var(--lift-1)]"),
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  "text-[12px] font-normal",
                  active && variant === "primary" ? "text-on-orange/75" : "text-text-3",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
