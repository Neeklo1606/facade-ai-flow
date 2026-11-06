/**
 * Фильтр-чип «Газ v4» (ADR-066): «Бригада: Все ▾». На компьютере открывает всплывающий список,
 * на телефоне шторку снизу. Список с поиском, когда вариантов больше семи. Выбранный фильтр
 * подсвечен, крестик снимает его одним касанием. Один вид на «Проверке», «Табеле» и в
 * справочниках вместо стандартных списков браузера и отдельной кнопки «Фильтры».
 */
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet } from "@/components/ui/kit/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  /** Подпись справа: число записей, код объекта */
  hint?: string | undefined;
}

const SEARCH_FROM = 8;

export function FilterChip({
  label,
  value,
  onChange,
  options,
  allLabel = "Все",
  compact = false,
  className,
}: {
  /** Название фильтра: «Бригада». Оно же доступное имя кнопки */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel?: string;
  /** Только значение, без названия: для строки шапки, где места мало */
  compact?: boolean;
  className?: string;
}) {
  const phone = useMediaQuery("(max-width: 767px)", false);
  const [open, setOpen] = useState(false);
  const picked = options.find((o) => o.value === value);
  const active = value !== "all" && !!picked;
  const text = active ? picked.label : allLabel;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      aria-label={`${label}: ${text}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-active={active || undefined}
      className={cn("filter-chip focus-ring", className)}
    >
      {compact ? null : <span className="shrink-0 text-ink-3">{label}</span>}
      <span className="min-w-0 truncate">{text}</span>
      <ChevronDown aria-hidden className="filter-chip-caret size-4 shrink-0" />
    </button>
  );

  const list = (
    <OptionList
      label={label}
      value={value}
      allLabel={allLabel}
      options={options}
      onPick={pick}
      roomy={phone}
    />
  );

  return (
    <span className="inline-flex shrink-0 items-center">
      {phone ? (
        <>
          <span onClickCapture={() => setOpen(true)} className="contents">
            {trigger}
          </span>
          <Sheet open={open} onOpenChange={setOpen} title={label} id={`filter-${label}`}>
            {list}
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="filter-pop w-80 border-0 p-1.5"
            onOpenAutoFocus={(event) => {
              // Фокус в поиск, если он есть, иначе на выбранный вариант
              const root = event.currentTarget as HTMLElement | null;
              const target =
                root?.querySelector<HTMLElement>("input") ??
                root?.querySelector<HTMLElement>('[aria-selected="true"]');
              if (target) {
                event.preventDefault();
                target.focus();
              }
            }}
          >
            {list}
          </PopoverContent>
        </Popover>
      )}
      {active ? (
        <button
          type="button"
          aria-label={`Снять фильтр: ${label}`}
          onClick={() => onChange("all")}
          className="filter-chip-clear focus-ring"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </span>
  );
}

function OptionList({
  label,
  value,
  allLabel,
  options,
  onPick,
  roomy,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: FilterOption[];
  onPick: (value: string) => void;
  roomy: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(text) || o.hint?.toLowerCase().includes(text),
    );
  }, [options, query]);
  const all: FilterOption = { value: "all", label: allLabel };
  const rows = query ? shown : [all, ...shown];

  return (
    <div className="flex flex-col gap-1">
      {options.length >= SEARCH_FROM ? (
        <label className="relative block">
          <span className="sr-only">Найти: {label}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти"
            aria-controls={id}
            className="h-11 w-full rounded-control bg-panel-2 ps-9 pe-3 type-text text-ink outline-none focus-ring"
          />
        </label>
      ) : null}
      <ul
        id={id}
        role="listbox"
        aria-label={label}
        className={cn(
          "filter-list overflow-y-auto overscroll-contain",
          roomy ? "pb-4" : "max-h-80",
        )}
      >
        {rows.map((option) => {
          const on = option.value === value;
          return (
            <li key={option.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onPick(option.value)}
                className="filter-option focus-ring"
              >
                <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                {option.hint ? (
                  <span className="shrink-0 type-small text-ink-3 tnum">{option.hint}</span>
                ) : null}
                <Check
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 text-flame-text",
                    on ? "opacity-100" : "opacity-0",
                  )}
                />
              </button>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="px-3 py-4 type-text text-ink-3">Ничего не нашлось</li>
        ) : null}
      </ul>
    </div>
  );
}

/** Переключатель-чип: «Только непроверенные». Нажат — фильтр включён */
export function ToggleChip({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-active={pressed || undefined}
      onClick={() => onChange(!pressed)}
      className="filter-chip focus-ring"
    >
      {pressed ? <Check aria-hidden className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

/** Строка чипов: на телефоне прокручивается вбок, на компьютере переносится */
export function FilterRow({
  children,
  onReset,
  active,
}: {
  children: ReactNode;
  onReset?: () => void;
  active: number;
}) {
  return (
    <div
      role="group"
      aria-label="Фильтры"
      className="filter-row flex max-w-full min-w-0 items-center gap-2 max-md:overflow-x-auto md:flex-wrap"
    >
      {children}
      {active > 0 && onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 shrink-0 items-center px-2 type-label text-flame-text focus-ring"
        >
          Сбросить
        </button>
      ) : null}
    </div>
  );
}

/**
 * Все фильтры одним окном рядом с кнопкой (компьютер, ADR-066): там, где в панели нет места
 * на чипы. Окно раскрывается от кнопки, а не шторкой снизу; итог «Показать 12 строк» живой
 */
export function FilterPanel({
  active,
  summary,
  onReset,
  children,
}: {
  active: number;
  /** «Показано 12 строк» */
  summary: string;
  onReset: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? `Фильтры, выбрано ${active}` : "Фильтры"}
          aria-expanded={open}
          data-active={active > 0 || undefined}
          className="filter-chip focus-ring"
        >
          <SlidersHorizontal aria-hidden className="size-4 shrink-0" />
          Фильтры
          {active ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-flame px-1 type-small text-on-flame tnum">
              {active}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="filter-pop w-96 border-0 p-0">
        <div className="filter-panel flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
            <p className="text-body-strong">Фильтры</p>
            {active ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex min-h-9 items-center type-label text-flame-text focus-ring"
              >
                Сбросить
              </button>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-2 pb-2">{children}</div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
            <span className="type-small text-ink-3" aria-live="polite">
              {summary}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-9 items-center rounded-pill bg-inverse px-4 type-label text-on-inverse focus-ring"
            >
              Готово
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Раздел окна фильтров: подпись и список вариантов с отметкой */
export function FilterGroup({
  label,
  value,
  onChange,
  options,
  allLabel = "Все",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel?: string;
}) {
  return (
    <section className="flex flex-col">
      <h3 className="px-2 pt-1 pb-0.5 type-small text-ink-3">{label}</h3>
      <OptionList
        label={label}
        value={value}
        allLabel={allLabel}
        options={options}
        onPick={onChange}
        roomy={false}
      />
    </section>
  );
}

/** Выбранный фильтр в панели: чип с крестиком, снимает одним нажатием */
export function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <span data-active className="filter-chip pe-1">
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <button
        type="button"
        aria-label={`Снять фильтр: ${label}`}
        onClick={onClear}
        className="filter-chip-clear focus-ring"
      >
        <X aria-hidden className="size-4" />
      </button>
    </span>
  );
}
