/**
 * Элементы управления ADR-045, разделы 4.6, 4.11 и 4.12: кнопка-иконка, сегменты, вкладки
 * с прокруткой и затуханием краёв, поиск, кнопка фильтров.
 */
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { fadeEdges, revealScrollLeft } from "@/lib/ui/kit-logic";
import { cn } from "@/lib/utils";

/** Кнопка-иконка: круг 40, область касания 44, подпись обязательна */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "size" | "children"> & { label: string; children: ReactNode }
>(function IconButton({ label, variant = "ghost", children, ...props }, ref) {
  return (
    <Button ref={ref} size="icon" variant={variant} aria-label={label} {...props}>
      {children}
    </Button>
  );
});

/* ---------------------------------------------------------------- Сегменты */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Сегмент до трёх вариантов: высота 36, область 44, активный фон surface */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-full bg-surface-2 p-0.5", className)}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "touch-target h-segment flex-1 rounded-full px-3 whitespace-nowrap focus-ring transition-fast",
              on
                ? "bg-surface text-body-strong text-text ring-1 ring-line"
                : "text-body text-text-2 is-hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Вкладки */

export interface TabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Вкладки со счётчиками: горизонтальная прокрутка, затухание краёв 16 px, активная
 * докручивается в видимую область, подчёркивание 2 px акцентом.
 */
export function ScrollTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active) {
      const next = revealScrollLeft(
        { scrollLeft: el.scrollLeft, width: el.clientWidth, scrollWidth: el.scrollWidth },
        { left: active.offsetLeft, width: active.offsetWidth },
      );
      if (next !== null) el.scrollTo({ left: next });
    }
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges(
        fadeEdges({
          scrollLeft: el.scrollLeft,
          width: el.clientWidth,
          scrollWidth: el.scrollWidth,
        }),
      );
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? "transparent 0, #000 16px" : "#000 0"}, ${
          edges.end ? "#000 calc(100% - 16px), transparent 100%" : "#000 100%"
        })`
      : undefined;

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className={cn(
        "flex gap-4 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {tabs.map((tab) => {
        const on = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative flex h-control shrink-0 items-center gap-1.5 whitespace-nowrap focus-ring",
              on ? "text-body-strong text-text" : "text-body text-text-2 is-hover:text-text",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className={cn("text-meta tnum", on ? "text-text-2" : "text-text-3")}>
                {tab.count}
              </span>
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 -bottom-px h-0.5 rounded-full",
                on ? "bg-orange" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Поиск */

/**
 * Поле поиска 44: задержка 200 мс, очистка справа, inputmode search. Липкость задаёт экран.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Поиск",
  label,
  delay = 200,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  delay?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), delay);
    return () => window.clearTimeout(timer);
  }, [draft, value, delay, onChange]);
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-text-3"
        aria-hidden
      />
      <input
        type="search"
        inputMode="search"
        role="searchbox"
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="h-control w-full rounded-card border border-line bg-surface ps-10 pe-11 text-body text-text outline-none placeholder:text-text-3 focus:border-orange-line [&::-webkit-search-cancel-button]:hidden"
        style={{ minHeight: "var(--h-control)" }}
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          aria-label="Очистить поиск"
          className="touch-target absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-text-3 focus-ring is-hover:bg-surface-2"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** «Ничего не найдено по «...»» и «Сбросить» */
export function NothingFound({ query, onReset }: { query: string; onReset: () => void }) {
  return (
    <div className="py-section text-center">
      <p className="text-body text-text-2">Ничего не найдено по «{query}»</p>
      <Button variant="quiet" className="mt-2" onClick={onReset}>
        Сбросить поиск
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- Фильтры */

/** Кнопка «Фильтры» с числом активных: «Фильтры 2» */
export function FiltersButton({
  active,
  onClick,
  className,
}: {
  active: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={cn("shrink-0", className)}
      aria-label={active ? `Фильтры, выбрано ${active}` : "Фильтры"}
    >
      <SlidersHorizontal aria-hidden />
      Фильтры
      {active ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-strong px-1 text-meta-strong text-on-orange tnum">
          {active}
        </span>
      ) : null}
    </Button>
  );
}
