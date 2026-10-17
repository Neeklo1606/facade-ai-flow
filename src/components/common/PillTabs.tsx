import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[var(--r-sm)] border border-line bg-surface-2 p-1",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <Button
            variant="ghost"
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
              "h-12 shrink-0 gap-2 px-3 lg:h-9 text-[13px] leading-none font-medium whitespace-nowrap",
              !active && "bg-transparent text-text-2 is-hover:bg-surface-2",
              active && "border-line-2 bg-surface text-text",
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className={cn("text-[13px] font-normal", "text-text-3")}>{tab.count}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
