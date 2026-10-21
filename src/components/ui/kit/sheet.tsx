/**
 * Шторка и панель справа ADR-045, раздел 4.13.
 *
 * Sheet (телефон): по содержимому до 92% экрана или сразу 92% для деталей записи, ручка 36x4,
 * шапка 52 с заголовком text-heading и «Закрыть», полоса показа строкой под шапкой.
 * Закрытие: свайп вниз, затемнение, «Закрыть», системный «назад» (шторка кладёт запись
 * в историю). Внизу липкая панель действий 64 + safe-area. Фокус уходит в шторку
 * и возвращается на элемент, который её открыл (Radix Dialog). Пока шторка открыта,
 * нижняя панель прячется: шторка регистрируется в менеджере слоёв.
 *
 * SidePanel (планшет и компьютер): панель справа 420, Esc закрывает, стрелки листают.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSheetLayer } from "@/lib/ui/bottom-layers";
import { createSheetHistory, highlightParts, monthGrid, plural } from "@/lib/ui/kit-logic";
import { cn } from "@/lib/utils";
import { IconButton, SearchBar } from "./controls";

/** Шторка кладёт запись в историю: «назад» браузера закрывает её */
function useSheetHistory(id: string, open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  const controller = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createSheetHistory(
            id,
            {
              push: (state) => window.history.pushState(state, ""),
              back: () => window.history.back(),
              state: () => window.history.state,
            },
            () => close.current(),
          ),
    [id],
  );
  useEffect(() => {
    if (!controller) return;
    if (open) controller.open();
    const onPop = (event: PopStateEvent) => controller.pop(event.state);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [controller, open]);
  return controller;
}

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Строка над заголовком: «ГЗ-00095 · Сб 03.10» */
  eyebrow?: ReactNode;
  /** Справа в шапке до «Закрыть»: «Сбросить» у фильтров */
  headerAction?: ReactNode;
  /** Строка под шапкой: полоса показа */
  inline?: ReactNode;
  /** auto: по содержимому до 92%; full: сразу 92% (деталь записи) */
  size?: "auto" | "full";
  /** Липкая панель действий: одна главная и одна вторичная */
  actions?: ReactNode;
  children: ReactNode;
  /** Ключ записи в истории браузера */
  id?: string;
  description?: string;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  eyebrow,
  headerAction,
  inline,
  size = "auto",
  actions,
  children,
  id = "sheet",
  description,
}: SheetProps) {
  useSheetLayer(open);
  const history = useSheetHistory(id, open, () => onOpenChange(false));
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  const close = () => {
    if (history?.isOpen) history.close();
    else onOpenChange(false);
  };

  // Свайп вниз за ручку или шапку: больше 80 px закрывает
  const dragHandlers = {
    onPointerDown: (event: React.PointerEvent) => {
      start.current = event.clientY;
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (start.current === null) return;
      setDrag(Math.max(0, event.clientY - start.current));
    },
    onPointerUp: () => {
      if (drag > 80) close();
      start.current = null;
      setDrag(0);
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag(0);
    },
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[var(--overlay)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          data-kit-sheet
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[61] flex flex-col rounded-sheet bg-surface shadow-pop outline-none",
            size === "full" ? "h-[92dvh]" : "max-h-[92dvh]",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom motion-reduce:data-[state=open]:slide-in-from-bottom-0",
          )}
          style={{
            transform: drag ? `translateY(${drag}px)` : undefined,
            transitionDuration: "var(--dur-sheet)",
          }}
        >
          <div {...dragHandlers} className="shrink-0 touch-none">
            <div className="flex justify-center pt-2">
              <span aria-hidden className="h-1 w-9 rounded-full bg-line-2" />
            </div>
            <div className="flex h-sheet-head items-center gap-2 ps-4 pe-2">
              <div className="min-w-0 flex-1">
                {eyebrow ? <p className="truncate text-meta text-text-3">{eyebrow}</p> : null}
                <Dialog.Title className="truncate text-heading">{title}</Dialog.Title>
              </div>
              {headerAction}
              <IconButton label="Закрыть" onClick={close}>
                <X aria-hidden />
              </IconButton>
            </div>
          </div>
          {description ? (
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          ) : null}
          {inline ? <div className="shrink-0 px-4 pb-2">{inline}</div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {children}
          </div>
          {actions ? (
            <div className="line-top flex h-action shrink-0 items-center gap-2 bg-surface px-4 pb-[env(safe-area-inset-bottom)] box-content">
              {actions}
            </div>
          ) : (
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Панель справа 420 для планшета и компьютера: Esc закрывает, стрелки листают записи */
export function SidePanel({
  open,
  onOpenChange,
  title,
  eyebrow,
  actions,
  children,
  onPrev,
  onNext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          data-kit-panel
          onInteractOutside={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && onNext) {
              event.preventDefault();
              onNext();
            }
            if (event.key === "ArrowUp" && onPrev) {
              event.preventDefault();
              onPrev();
            }
          }}
          aria-describedby={undefined}
          className="fixed inset-y-0 end-0 z-[50] flex w-full max-w-[420px] flex-col border-s border-line bg-surface shadow-pop outline-none"
        >
          <div className="flex h-header items-center gap-1 border-b border-line ps-5 pe-2">
            <div className="min-w-0 flex-1">
              {eyebrow ? <p className="truncate text-meta text-text-3">{eyebrow}</p> : null}
              <Dialog.Title className="truncate text-heading">{title}</Dialog.Title>
            </div>
            {onPrev ? (
              <IconButton label="Предыдущая" onClick={onPrev}>
                <ChevronLeft aria-hidden />
              </IconButton>
            ) : null}
            {onNext ? (
              <IconButton label="Следующая" onClick={onNext}>
                <ChevronRight aria-hidden />
              </IconButton>
            ) : null}
            <IconButton label="Закрыть" onClick={() => onOpenChange(false)}>
              <X aria-hidden />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {actions ? (
            <div className="flex h-action shrink-0 items-center gap-2 border-t border-line px-5">
              {actions}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------------------------------------------------------- Выбор из списка */

export interface PickOption {
  value: string;
  label: string;
  meta?: string;
}

/** Выбор из длинного списка на телефоне: поиск сверху, строки 56, выбранное с галочкой */
export function PickerSheet({
  open,
  onOpenChange,
  title,
  options,
  value,
  onPick,
  searchLabel = "Поиск",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: readonly PickOption[];
  value: string | null;
  onPick: (value: string) => void;
  searchLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const list = options.filter((o) =>
    `${o.label} ${o.meta ?? ""}`.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} id={`picker-${title}`} size="full">
      <SearchBar value={query} onChange={setQuery} label={searchLabel} placeholder={searchLabel} />
      {list.length ? (
        <ul className="mt-2">
          {list.map((option) => {
            const on = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(option.value);
                    onOpenChange(false);
                  }}
                  aria-pressed={on}
                  className="flex min-h-14 w-full items-center gap-3 border-b border-line text-left focus-ring last:border-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">
                      {highlightParts(option.label, query).map((part, i) =>
                        part.hit ? (
                          <mark key={i} className="bg-orange-dim text-text">
                            {part.text}
                          </mark>
                        ) : (
                          <span key={i}>{part.text}</span>
                        ),
                      )}
                    </span>
                    {option.meta ? (
                      <span className="block truncate text-meta text-text-3">{option.meta}</span>
                    ) : null}
                  </span>
                  {on ? (
                    <Check className="size-5 shrink-0 text-orange" aria-label="Выбрано" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-section text-center text-body text-text-2">
          Ничего не найдено по «{query}»
        </p>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- Фильтры */

/** Шторка фильтров: «Сбросить» в шапке, «Показать N записей» внизу, число меняется на лету */
export function FiltersSheet({
  open,
  onOpenChange,
  count,
  noun = ["запись", "записи", "записей"],
  onReset,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  noun?: [string, string, string];
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Фильтры"
      id="filters"
      headerAction={
        <Button variant="quiet" onClick={onReset}>
          Сбросить
        </Button>
      }
      actions={
        <Button variant="primary" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
          Показать {count} {plural(count, noun)}
        </Button>
      }
    >
      <div className="flex flex-col gap-section">{children}</div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- Календарь */

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Даты в виде «ГГГГ-ММ-ДД» */
export function MonthGrid({
  year,
  month,
  value,
  today,
  onPick,
}: {
  year: number;
  month: number;
  value: string | null;
  today: string;
  onPick: (date: string) => void;
}) {
  const weeks = monthGrid(year, month);
  const iso = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return (
    <table className="w-full table-fixed border-collapse" aria-label={`${MONTHS[month]} ${year}`}>
      <thead>
        <tr>
          {WEEKDAYS.map((d) => (
            <th key={d} scope="col" className="h-8 text-meta text-text-3">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, w) => (
          <tr key={w}>
            {week.map((day, d) => (
              <td key={d} className="p-0 text-center">
                {day ? (
                  <button
                    type="button"
                    onClick={() => onPick(iso(day))}
                    aria-pressed={value === iso(day)}
                    aria-current={today === iso(day) ? "date" : undefined}
                    className={cn(
                      "relative mx-auto grid size-11 place-items-center rounded-full text-body tnum focus-ring",
                      value === iso(day)
                        ? "bg-orange-strong text-on-orange"
                        : "is-hover:bg-surface-2",
                    )}
                  >
                    {day}
                    {today === iso(day) ? (
                      <span
                        aria-hidden
                        className="absolute bottom-1 size-1 rounded-full bg-current opacity-70"
                      />
                    ) : null}
                  </button>
                ) : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** «Календарь» в шторке: быстрые «Сегодня», «Вчера», «Эта неделя» и месяц сеткой, ячейка 44 */
export function CalendarSheet({
  open,
  onOpenChange,
  value,
  today,
  onPick,
  onWeek,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  today: string;
  onPick: (date: string) => void;
  onWeek?: () => void;
}) {
  const [view, setView] = useState(() => {
    const [y, m] = (value ?? today).split("-").map(Number);
    return { year: y!, month: m! - 1 };
  });
  const yesterday = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const pick = (date: string) => {
    onPick(date);
    onOpenChange(false);
  };
  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const m = month + delta;
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Календарь" id="calendar">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => pick(today)}>
          Сегодня
        </Button>
        <Button variant="outline" onClick={() => pick(yesterday)}>
          Вчера
        </Button>
        {onWeek ? (
          <Button
            variant="outline"
            onClick={() => {
              onWeek();
              onOpenChange(false);
            }}
          >
            Эта неделя
          </Button>
        ) : null}
      </div>
      <div className="mt-block flex items-center justify-between">
        <IconButton label="Предыдущий месяц" onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden />
        </IconButton>
        <p className="text-heading">
          {MONTHS[view.month]} {view.year}
        </p>
        <IconButton label="Следующий месяц" onClick={() => shift(1)}>
          <ChevronRight aria-hidden />
        </IconButton>
      </div>
      <MonthGrid {...view} value={value} today={today} onPick={pick} />
    </Sheet>
  );
}
