/**
 * Данные «Монохрома» (ADR-055, S3): одна таблица с одним API — на компьютере таблица
 * с клавишами J, K, Enter, Esc, X и выбором пачкой, на телефоне строки от 64 (2.5).
 * Деталь строки: панель справа 440 на компьютере и шторка 92 % на телефоне, тоже одним API.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ChevronRight as Chevron, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet } from "@/components/ui/kit/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  allState,
  tableKey,
  toggleAll,
  toggleSelected,
  type TableState,
} from "@/lib/ui/mono-logic";
import { cn } from "@/lib/utils";
import { Button } from "./controls";

export interface DataColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
  /** Ширина колонки компьютера: «28%», «120px» */
  width?: string;
}

export interface DataViewProps<T> {
  rows: readonly T[];
  rowId: (row: T) => string;
  columns: readonly DataColumn<T>[];
  /** Строка телефона: заголовок, подпись и правая часть */
  title: (row: T) => ReactNode;
  meta?: (row: T) => ReactNode;
  aside?: (row: T) => ReactNode;
  label: string;
  openId?: string | null;
  onOpen?: (id: string | null) => void;
  /** Выбор пачкой: флажки и панель действий над таблицей */
  selected?: ReadonlySet<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  batch?: (selected: ReadonlySet<string>) => ReactNode;
  /** Клавиши J, K, Enter, Esc, X на компьютере */
  keyboard?: boolean;
  empty?: ReactNode;
}

/** Клавиши не перехватываются в полях ввода и поверх диалогов */
function keysBlocked(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (el?.closest("input, textarea, select, [contenteditable='true']")) return true;
  // Немодальная панель детали клавиши не забирает: J и K листают открытую запись
  return !!document.querySelector(
    "[role='alertdialog'], [role='menu'], [role='dialog'][aria-modal='true']",
  );
}

export function DataView<T>({
  rows,
  rowId,
  columns,
  title,
  meta,
  aside,
  label,
  openId = null,
  onOpen,
  selected,
  onSelectedChange,
  batch,
  keyboard = true,
  empty,
}: DataViewProps<T>) {
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  const ids = rows.map(rowId);
  const selectable = !!selected && !!onSelectedChange;
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    if (!desktop || !keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (!["j", "k", "enter", "escape", "x"].includes(event.key.toLowerCase())) return;
      if (keysBlocked(event.target)) return;
      const state: TableState = { cursor, open: openId, selected: selected ?? new Set() };
      const next = tableKey(state, event.key, ids);
      if (next === state) return;
      if (event.key.toLowerCase() === "x" && !selectable) return;
      event.preventDefault();
      setCursor(next.cursor);
      if (next.open !== state.open) onOpen?.(next.open);
      if (next.selected !== state.selected) onSelectedChange?.(new Set(next.selected));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, keyboard, cursor, openId, selected, ids, onOpen, onSelectedChange, selectable]);

  if (rows.length === 0) return <>{empty}</>;

  const batchBar =
    selectable && selected.size > 0 && batch ? (
      <div
        role="toolbar"
        aria-label="Действия с выбранными"
        className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-pill bg-inverse py-2 ps-5 pe-2 text-on-inverse shadow-floating"
      >
        <span className="type-label">Выбрано: {selected.size}</span>
        <span className="ms-auto flex items-center gap-2">{batch(selected)}</span>
      </div>
    ) : null;

  if (!desktop) {
    return (
      <div>
        {batchBar}
        <ul aria-label={label} className="mono-card flex flex-col divide-y divide-line p-0 lg:p-0">
          {rows.map((row) => {
            const id = rowId(row);
            return (
              <li key={id} className="flex items-center">
                {selectable ? (
                  <label className="grid min-h-16 min-w-12 place-items-center ps-2">
                    <Checkbox
                      checked={selected.has(id)}
                      onCheckedChange={() => onSelectedChange(toggleSelected(selected, id))}
                      aria-label="Выбрать строку"
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpen?.(id)}
                  aria-current={openId === id ? "true" : undefined}
                  className="mono-row min-w-0 flex-1 text-left focus-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate type-text font-medium">{title(row)}</span>
                    {meta ? (
                      <span className="block truncate type-small text-ink-3">{meta(row)}</span>
                    ) : null}
                  </span>
                  {aside ? (
                    <span className="shrink-0 text-end type-label">{aside(row)}</span>
                  ) : null}
                  <Chevron className="size-4 shrink-0 text-ink-3" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const all = selectable ? allState(selected, ids) : false;
  return (
    <div>
      {batchBar}
      <div className="mono-card overflow-x-auto p-0 lg:p-0">
        <table aria-label={label} className="w-full border-collapse type-text">
          <thead>
            <tr className="border-b border-line text-start">
              {selectable ? (
                <th scope="col" className="w-12 ps-5">
                  <Checkbox
                    checked={all}
                    onCheckedChange={() => onSelectedChange(toggleAll(selected, ids))}
                    aria-label="Выбрать все строки"
                  />
                </th>
              ) : null}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    "h-12 px-5 type-small font-medium text-ink-3",
                    column.align === "end" ? "text-end" : "text-start",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const id = rowId(row);
              const active = openId === id;
              return (
                <tr
                  key={id}
                  data-row-id={id}
                  aria-selected={selectable ? selected.has(id) : undefined}
                  data-cursor={cursor === index ? "" : undefined}
                  data-open={active ? "" : undefined}
                  onClick={() => {
                    setCursor(index);
                    onOpen?.(id);
                  }}
                  className="cursor-pointer border-b border-line last:border-0 is-hover:bg-panel-2 data-[cursor]:bg-panel-2 data-[open]:bg-panel-2 data-[open]:shadow-[inset_3px_0_0_var(--ink)]"
                >
                  {selectable ? (
                    <td className="ps-5" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(id)}
                        onCheckedChange={() => onSelectedChange(toggleSelected(selected, id))}
                        aria-label="Выбрать строку"
                      />
                    </td>
                  ) : null}
                  {columns.map((column, c) => (
                    <td
                      key={column.key}
                      className={cn(
                        "h-14 px-5",
                        column.align === "end" ? "text-end tnum" : "text-start",
                      )}
                    >
                      {c === 0 && onOpen ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCursor(index);
                            onOpen(id);
                          }}
                          className="text-start focus-ring"
                        >
                          {column.cell(row)}
                        </button>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {keyboard ? (
        <p className="mt-2 sr-only">
          Клавиши: J и K — по строкам, Enter — открыть, Esc — закрыть, X — отметить строку.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Деталь: панель справа 440 на компьютере (немодальная, Esc закрывает, стрелки листают)
 * и шторка 92 % на телефоне. Одно API, экран не выбирает сам
 */
export function DetailPanel({
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
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  if (!desktop) {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        eyebrow={eyebrow}
        size="full"
        actions={actions}
      >
        {children}
      </Sheet>
    );
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
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
          className="mono-panel fixed inset-y-4 end-4 z-50 flex flex-col overflow-hidden rounded-surface bg-card text-ink shadow-floating outline-none"
        >
          <div className="flex items-start gap-1 px-6 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              {eyebrow ? <p className="truncate type-small text-ink-3">{eyebrow}</p> : null}
              <Dialog.Title className="type-card">{title}</Dialog.Title>
            </div>
            {onPrev ? (
              <Button variant="quiet" aria-label="Предыдущая" onClick={onPrev}>
                <ChevronLeft aria-hidden />
              </Button>
            ) : null}
            {onNext ? (
              <Button variant="quiet" aria-label="Следующая" onClick={onNext}>
                <ChevronRight aria-hidden />
              </Button>
            ) : null}
            <Button variant="quiet" aria-label="Закрыть" onClick={() => onOpenChange(false)}>
              <X aria-hidden />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2 border-t border-line px-6 py-4">
              {actions}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
