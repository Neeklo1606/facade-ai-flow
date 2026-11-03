/**
 * Таблица «Журнала» по образцу «Ведомости работ» ПТО Онлайн (ADR-061, 10; раздел 4.4):
 * флажки, шестерёнка настройки колонок, строки 40 px, группировка по дням с липкой строкой
 * «Сб 03.10 · 18 записей · 312 450 ₽», внизу «Строк на странице 25/50/100».
 * Пустое — «—» с подсказкой, а не ноль (2.3, п. 2).
 */
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtShortDay, sumText } from "../review/rules";
import { COLUMNS, PAGE_SIZES, type ColumnKey, type JournalRow } from "./columns";
import { useMediaQuery } from "@/hooks/use-media-query";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export function JournalTable({
  rows,
  visible,
  onVisible,
  columnsOpen,
  onColumnsOpen,
  money,
  selected,
  onSelect,
  activeId,
  onOpen,
  pageSize,
  onPageSize,
  page,
  onPage,
  total,
}: {
  /** Строки текущей страницы */
  rows: JournalRow[];
  visible: ColumnKey[];
  onVisible: (keys: ColumnKey[]) => void;
  /** Шестерёнку открывает и пункт «⋮ → Настроить колонки» панели */
  columnsOpen: boolean;
  onColumnsOpen: (open: boolean) => void;
  money: boolean;
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
  activeId: string | null;
  onOpen: (id: string) => void;
  pageSize: number;
  onPageSize: (size: number) => void;
  page: number;
  onPage: (page: number) => void;
  total: number;
}) {
  // Узкий компьютер (1024–1279): широкие колонки не выводятся вовсе, а не прячутся стилем,
  // иначе строка дня с colSpan на все колонки достраивает пустые и сжимает «Объект»
  const narrow = useMediaQuery("(max-width: 1279px)", false);
  const columns = COLUMNS.filter(
    (c) => visible.includes(c.key) && (money || !c.money) && !(narrow && c.wide),
  );
  const pageIds = rows.map((r) => r.id);
  const allOn = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOn = pageIds.some((id) => selected.has(id));

  // Группы по дням внутри страницы: свежий день сверху
  const groups: [string, JournalRow[]][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0] === row.view.entry.day) last[1].push(row);
    else groups.push([row.view.entry.day, [row]]);
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="surface-1">
      <table
        aria-label="Журнал записей"
        data-tour="journal-table"
        className="w-full table-fixed text-body tnum"
      >
        <thead>
          <tr className="h-row-table border-b border-line text-left text-meta text-text-3">
            <th scope="col" className="w-[36px] ps-3">
              <input
                type="checkbox"
                aria-label="Выбрать все на странице"
                checked={allOn}
                ref={(node) => {
                  if (node) node.indeterminate = !allOn && someOn;
                }}
                onChange={(event) => onSelect(pageIds, event.target.checked)}
                className="size-4 cursor-pointer accent-[var(--orange-strong)]"
              />
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-2 font-normal whitespace-nowrap",
                  column.width,
                  column.numeric && "text-right",
                )}
              >
                {column.title}
              </th>
            ))}
            <th scope="col" className="w-[36px] pe-1 text-right">
              <ColumnsPicker
                visible={visible}
                onVisible={onVisible}
                money={money}
                open={columnsOpen}
                onOpenChange={onColumnsOpen}
              />
            </th>
          </tr>
        </thead>
        {groups.map(([day, list]) => {
          return (
            <tbody key={day}>
              <tr className="sticky top-[var(--topbar-h)] z-[1] bg-surface-2">
                <th
                  colSpan={columns.length + 2}
                  scope="rowgroup"
                  className="h-control-sm px-3 text-left text-meta font-normal text-text-2"
                >
                  {fmtShortDay(day)} · {list.length}{" "}
                  {plural(list.length, "запись", "записи", "записей")}
                  {money ? ` · ${sumText(list.map((row) => row.view))}` : ""}
                </th>
              </tr>
              {list.map((row) => {
                const on = selected.has(row.id);
                return (
                  <tr
                    key={row.id}
                    data-entry-row={row.id}
                    aria-selected={on}
                    onClick={() => onOpen(row.id)}
                    className={cn(
                      "h-row-table cursor-pointer border-t border-line transition-fast",
                      activeId === row.id ? "bg-surface-2" : "is-hover:bg-surface-2",
                      on && "bg-orange-dim",
                    )}
                  >
                    <td className="ps-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${row.view.entry.number}`}
                        checked={on}
                        onChange={(event) => onSelect([row.id], event.target.checked)}
                        className="size-4 cursor-pointer accent-[var(--orange-strong)]"
                      />
                    </td>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "overflow-hidden px-2 whitespace-nowrap",
                          column.numeric && "text-right",
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                    <td />
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line px-3 py-2 text-meta text-text-2">
        <span className="flex items-center gap-1.5">
          Строк на странице
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={pageSize === size}
              onClick={() => onPageSize(size)}
              className={cn(
                "inline-flex h-control-sm min-w-[32px] items-center justify-center rounded-control px-2 tnum focus-ring",
                pageSize === size ? "bg-pill text-pill-text" : "text-text-2 is-hover:bg-surface-2",
              )}
            >
              {size}
            </button>
          ))}
        </span>
        <span className="tnum" data-testid="journal-range">
          {from}–{to} из {total}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Предыдущая страница"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
            className="grid size-[32px] place-items-center rounded-control focus-ring is-hover:bg-surface-2 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Следующая страница"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
            className="grid size-[32px] place-items-center rounded-control focus-ring is-hover:bg-surface-2 disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </span>
      </div>
    </div>
  );
}

/** Шестерёнка в шапке таблицы: какие колонки видны */
export function ColumnsPicker({
  visible,
  onVisible,
  money,
  open,
  onOpenChange,
}: {
  visible: ColumnKey[];
  onVisible: (keys: ColumnKey[]) => void;
  money: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const toggle = (key: ColumnKey, on: boolean) =>
    onVisible(COLUMNS.map((c) => c.key).filter((k) => (k === key ? on : visible.includes(k))));
  return (
    <Popover {...(open === undefined ? {} : { open })} {...(onOpenChange ? { onOpenChange } : {})}>
      <PopoverTrigger
        aria-label="Настроить колонки"
        className="inline-grid size-[32px] place-items-center rounded-control text-text-2 focus-ring is-hover:bg-surface-2"
      >
        <Settings2 className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 rounded-inset p-2 shadow-floating">
        <p className="px-2 pt-1 pb-2 text-meta-strong text-text-2">Колонки</p>
        <ul aria-label="Колонки журнала">
          {COLUMNS.filter((c) => money || !c.money).map((column) => (
            <li key={column.key}>
              <label className="flex min-h-segment cursor-pointer items-center gap-2 rounded-control px-2 text-body is-hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={visible.includes(column.key)}
                  onChange={(event) => toggle(column.key, event.target.checked)}
                  className="size-4 accent-[var(--orange-strong)]"
                />
                {column.key === "end"
                  ? "Окончание"
                  : column.key === "number"
                    ? "Номер"
                    : column.title}
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
