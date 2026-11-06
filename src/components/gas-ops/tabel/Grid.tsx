/**
 * Сетка «Табеля» (ADR-061, 11; раздел 4.5), работает как Google Таблицы:
 * - выделение ячейки, диапазона (мышь, Shift+стрелки), строки и столбца по заголовку;
 * - Ctrl/Cmd+C копирует выделенное в TSV, Ctrl/Cmd+A выделяет всё;
 * - строка внизу: «Сумма / Среднее / Количество» по числам выделенного;
 * - Enter или двойной клик открывает ячейку (исходные записи);
 * - закреплены первый столбец и две строки шапки, подсветка строки и столбца под мышью;
 * - ширина колонок мышью за край заголовка, плотность строк;
 * - строки виртуализируются от 200: рисуется только видимое окно.
 * Цвет ячейки — статус данных вместо переключателя «Подтверждённые / Предварительный».
 */
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  inRect,
  moveSelection,
  rectOf,
  selectionStats,
  toTsv,
  tsvNumber,
  wholeColumn,
  wholeRow,
  type CellStatus,
  type Selection,
} from "@/api/gas-ops";
import { cn } from "@/lib/utils";

export interface GridRow {
  id: string;
  label: string;
  level: number;
  /** group, brigade, employee, address, total, person */
  kind: string;
  collapsible: boolean;
  collapsed: boolean;
  /** Строка записи из сценария (`?highlight=`): метка для показа */
  tour?: boolean;
}

export interface GridColumn {
  key: string;
  /** Верхняя строка шапки: день или «Итого недели» */
  group: string;
  /** Нижняя строка шапки: показатель */
  title: string;
  width: number;
}

export interface GridCell {
  value: number | null;
  text: string;
  status: CellStatus | null;
  manual?: boolean;
  noEstimate?: boolean;
  entryIds: string[];
}

/** Порог виртуализации строк (4.5) */
export const VIRTUAL_FROM = 200;

const STATUS_CLASS: Record<CellStatus, string> = {
  ok: "",
  draft: "bg-warn-bg italic",
  missing: "shadow-[inset_0_0_0_1.5px_var(--danger)]",
  off: "bg-surface-2 text-text-3",
};

const STATUS_HINT: Record<CellStatus, string> = {
  ok: "Все записи приняты",
  draft: "Черновик: есть непроверенные записи",
  missing: "По графику ждали запись, её нет",
  off: "Выходной или день без графика",
};

export function Grid({
  label,
  rows,
  columns,
  cell,
  labelTitle,
  labelWidth,
  onLabelWidth,
  onColumnWidth,
  rowHeight,
  onToggle,
  onOpen,
  focus,
  height,
}: {
  label: string;
  rows: GridRow[];
  columns: GridColumn[];
  cell: (row: number, col: number) => GridCell;
  labelTitle: string;
  labelWidth: number;
  onLabelWidth: (width: number) => void;
  onColumnWidth: (key: string, width: number) => void;
  rowHeight: number;
  onToggle: (rowId: string) => void;
  onOpen: (row: number, col: number) => void;
  /** Ячейка, которую нужно выделить и показать (переход из сценария) */
  focus?: { row: number; col: number } | null;
  /** Высота области прокрутки: сетка занимает окно до низа */
  height: string;
}) {
  const id = useId().replace(/:/g, "");
  const scroller = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(800);
  const dragging = useRef(false);
  const size = { rows: rows.length, cols: columns.length };
  const rect = selection ? rectOf(selection) : null;

  // Переход к ячейке: выделить и прокрутить
  useEffect(() => {
    if (!focus) return;
    setSelection({ anchor: focus, focus });
    window.setTimeout(() => {
      scroller.current
        ?.querySelector(`[data-cell="${focus.row}:${focus.col}"]`)
        ?.scrollIntoView({ block: "center", inline: "center" });
    }, 50);
  }, [focus]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    setViewport(el.clientHeight);
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Выделение не должно указывать за пределы сетки после сворачивания групп
  useEffect(() => {
    setSelection((current) =>
      current && (current.focus.row >= rows.length || current.anchor.row >= rows.length)
        ? null
        : current,
    );
  }, [rows.length]);

  /* ---------------- Виртуализация ---------------- */
  const virtual = rows.length >= VIRTUAL_FROM;
  const overscan = 10;
  const first = virtual ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const last = virtual
    ? Math.min(rows.length, Math.ceil((scrollTop + viewport) / rowHeight) + overscan)
    : rows.length;

  /* ---------------- Выделенное: итоги и TSV ---------------- */
  const stats = useMemo(() => {
    if (!rect) return null;
    const values: (number | null)[] = [];
    for (let r = rect.top; r <= rect.bottom; r += 1)
      for (let c = rect.left; c <= rect.right; c += 1) values.push(cell(r, c).value);
    return { ...selectionStats(values), cells: values.length };
  }, [rect?.top, rect?.bottom, rect?.left, rect?.right, cell]); // eslint-disable-line react-hooks/exhaustive-deps

  const tsv = useCallback(() => {
    if (!rect) return "";
    const whole = rect.left === 0 && rect.right === columns.length - 1;
    const matrix: string[][] = [];
    for (let r = rect.top; r <= rect.bottom; r += 1) {
      const line: string[] = whole ? [rows[r]!.label] : [];
      for (let c = rect.left; c <= rect.right; c += 1) line.push(tsvNumber(cell(r, c).value));
      matrix.push(line);
    }
    return toTsv(matrix);
  }, [rect, rows, columns.length, cell]);

  const ensureVisible = (row: number, col: number) => {
    scroller.current
      ?.querySelector(`[data-cell="${row}:${col}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const el = scroller.current;
    if (el && virtual) {
      const top = row * rowHeight;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowHeight * 3 > el.scrollTop + el.clientHeight)
        el.scrollTop = top - el.clientHeight + rowHeight * 3;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection({
        anchor: { row: 0, col: 0 },
        focus: { row: rows.length - 1, col: columns.length - 1 },
      });
      return;
    }
    if (!selection) {
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
      }
      return;
    }
    const deltas: Record<string, { row: number; col: number }> = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    };
    const delta = deltas[event.key];
    if (delta) {
      event.preventDefault();
      const next = moveSelection(selection, delta, event.shiftKey, size);
      setSelection(next);
      ensureVisible(next.focus.row, next.focus.col);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onOpen(selection.focus.row, selection.focus.col);
      return;
    }
    if (event.key === "Escape" && rect && (rect.top !== rect.bottom || rect.left !== rect.right)) {
      event.preventDefault();
      setSelection({ anchor: selection.focus, focus: selection.focus });
    }
  };

  // Ctrl/Cmd+C: событие «copy» срабатывает и без выделенного текста, кладём TSV в буфер
  const onCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!rect) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", tsv());
  };

  const startCell = (event: PointerEvent, row: number, col: number) => {
    if (event.button !== 0) return;
    dragging.current = true;
    setSelection((current) =>
      event.shiftKey && current
        ? { anchor: current.anchor, focus: { row, col } }
        : { anchor: { row, col }, focus: { row, col } },
    );
    scroller.current?.focus({ preventScroll: true });
  };
  const extendCell = (row: number, col: number) => {
    setHoverCol(col);
    if (!dragging.current) return;
    setSelection((current) =>
      current ? { anchor: current.anchor, focus: { row, col } } : current,
    );
  };
  useEffect(() => {
    const stop = () => (dragging.current = false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  /* ---------------- Ширина колонок за край заголовка ---------------- */
  const resize = (start: number, apply: (width: number) => void) => (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const from = event.clientX;
    const move = (e: globalThis.PointerEvent) => apply(Math.max(48, start + e.clientX - from));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Колонки дня одной группой в верхней строке шапки
  const groups: { title: string; span: number; start: number }[] = [];
  columns.forEach((column, index) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.title === column.group) lastGroup.span += 1;
    else groups.push({ title: column.group, span: 1, start: index });
  });
  const tableWidth = labelWidth + columns.reduce((a, c) => a + c.width, 0);
  const headRow = 32;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Подсветка столбца под мышью: правило на весь столбец, без перерисовки ячеек */}
      {hoverCol !== null ? (
        <style>{`#${id} td[data-col="${hoverCol}"]:not([data-selected]):not([data-status="draft"]){background-color:var(--color-surface-2)}`}</style>
      ) : null}
      <div
        id={id}
        ref={scroller}
        role="grid"
        aria-label={label}
        aria-rowcount={rows.length + 2}
        aria-colcount={columns.length + 1}
        aria-multiselectable
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onPointerLeave={() => setHoverCol(null)}
        className="surface-1 relative overflow-auto overscroll-contain focus-ring select-none"
        style={{ height }}
      >
        {/*
         * Сетка — у прокручиваемого блока: таблица внутри только раскладка (role="presentation"),
         * а строки, группы строк и заголовки названы ролями сетки явно (axe, aria-required-children)
         */}
        <table
          role="presentation"
          className="gas-grid border-separate border-spacing-0 text-body tnum"
          style={{ width: tableWidth, tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: labelWidth }} />
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead role="rowgroup">
            <tr role="row" style={{ height: headRow }}>
              <th
                rowSpan={2}
                scope="col"
                role="columnheader"
                className="sticky top-0 left-0 z-[3] border-e border-b border-line bg-surface px-3 text-left text-meta font-normal text-text-3"
              >
                <span className="relative block">
                  {labelTitle}
                  <span
                    role="separator"
                    aria-label="Ширина первого столбца"
                    onPointerDown={resize(labelWidth, onLabelWidth)}
                    className="absolute inset-y-0 -end-3 w-2 cursor-col-resize"
                  />
                </span>
              </th>
              {groups.map((group) => (
                <th
                  key={`${group.title}-${group.start}`}
                  colSpan={group.span}
                  scope="colgroup"
                  role="columnheader"
                  className="sticky top-0 z-[2] border-e border-b border-line bg-surface px-2 text-center text-meta-strong text-text-2"
                >
                  {group.title}
                </th>
              ))}
            </tr>
            <tr role="row" style={{ height: headRow }}>
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  role="columnheader"
                  data-col={index}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    setSelection(wholeColumn(index, rows.length));
                    scroller.current?.focus({ preventScroll: true });
                  }}
                  className="sticky z-[2] cursor-pointer border-e border-b border-line bg-surface px-2 text-right text-meta font-normal text-text-3"
                  style={{ top: headRow }}
                >
                  <span className="relative block truncate">
                    {column.title}
                    <span
                      role="separator"
                      aria-label={`Ширина: ${column.group}, ${column.title}`}
                      onPointerDown={resize(column.width, (w) => onColumnWidth(column.key, w))}
                      className="absolute inset-y-0 -end-2 w-2 cursor-col-resize"
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {virtual && first > 0 ? (
              <tr aria-hidden style={{ height: first * rowHeight }}>
                <td colSpan={columns.length + 1} />
              </tr>
            ) : null}
            {rows.slice(first, last).map((row, offset) => {
              const r = first + offset;
              const strong = row.kind !== "address" && row.kind !== "person";
              const rowSelected =
                rect &&
                rect.left === 0 &&
                rect.right === columns.length - 1 &&
                r >= rect.top &&
                r <= rect.bottom;
              return (
                <tr
                  key={row.id}
                  role="row"
                  aria-rowindex={r + 3}
                  data-tabel-row={row.id}
                  data-kind={row.kind}
                  data-tour={row.tour ? "report-row" : undefined}
                  className="group/row"
                  style={{ height: rowHeight }}
                >
                  <th
                    scope="row"
                    role="rowheader"
                    onPointerDown={(event) => {
                      if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
                        return;
                      setSelection(wholeRow(r, columns.length));
                      scroller.current?.focus({ preventScroll: true });
                    }}
                    className={cn(
                      "sticky left-0 z-[1] cursor-pointer truncate border-e border-b border-line bg-surface px-2 text-left font-normal group-hover/row:bg-surface-2",
                      strong ? "text-body-strong" : "text-body",
                      row.kind === "total" && "bg-surface-2",
                      rowSelected && "bg-orange-dim",
                    )}
                    style={{ paddingInlineStart: 8 + row.level * 16 }}
                    title={row.label}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      {row.collapsible ? (
                        <button
                          type="button"
                          aria-expanded={!row.collapsed}
                          aria-label={`${row.collapsed ? "Развернуть" : "Свернуть"}: ${row.label}`}
                          onClick={() => onToggle(row.id)}
                          className="grid h-control-sm w-[32px] shrink-0 place-items-center rounded-control text-text-3 focus-ring is-hover:bg-surface-3"
                        >
                          {row.collapsed ? (
                            <ChevronRight className="size-4" aria-hidden />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <span className="w-[32px] shrink-0" aria-hidden />
                      )}
                      <span className="truncate">{row.label}</span>
                    </span>
                  </th>
                  {columns.map((column, c) => {
                    const value = cell(r, c);
                    const selected = rect ? inRect(rect, r, c) : false;
                    const focused = selection?.focus.row === r && selection.focus.col === c;
                    const status = value.status;
                    const hint = [
                      status ? STATUS_HINT[status] : null,
                      value.manual ? "✎ ручная сумма" : null,
                      value.noEstimate ? "нет сметы" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <td
                        key={column.key}
                        role="gridcell"
                        aria-selected={selected}
                        data-cell={`${r}:${c}`}
                        data-col={c}
                        data-status={status ?? undefined}
                        data-selected={selected || undefined}
                        title={hint || undefined}
                        onPointerDown={(event) => startCell(event, r, c)}
                        onPointerEnter={() => extendCell(r, c)}
                        onDoubleClick={() => onOpen(r, c)}
                        className={cn(
                          "cursor-cell truncate border-e border-b border-line px-2 text-right group-hover/row:bg-surface-2",
                          status ? STATUS_CLASS[status] : "",
                          strong && "text-body-strong",
                          row.kind === "total" && "bg-surface-2",
                          selected && "bg-orange-dim",
                          focused && "outline-2 -outline-offset-2 outline-orange",
                        )}
                      >
                        {value.manual ? (
                          <span className="me-1 text-text-3" aria-label="ручная сумма">
                            ✎
                          </span>
                        ) : null}
                        {value.noEstimate ? (
                          <TriangleAlert
                            className="me-1 inline size-3.5 align-[-2px] text-warn"
                            aria-label="нет сметы"
                          />
                        ) : null}
                        {value.text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {virtual && last < rows.length ? (
              <tr aria-hidden style={{ height: (rows.length - last) * rowHeight }}>
                <td colSpan={columns.length + 1} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Итоги выделенного, как внизу справа в Google Таблицах */}
      <p
        className="flex min-h-control-sm flex-wrap items-center justify-end gap-x-4 px-1 text-meta text-text-2 tnum"
        data-testid="selection-stats"
        aria-live="polite"
      >
        {stats && stats.cells > 0 ? (
          <>
            <span>Выделено ячеек: {stats.cells}</span>
            <span>Сумма: {stats.sum.toLocaleString("ru-RU")}</span>
            <span>Среднее: {stats.avg === null ? "–" : stats.avg.toLocaleString("ru-RU")}</span>
            <span>Количество: {stats.count}</span>
          </>
        ) : (
          <span className="text-text-3">
            Выделите ячейки: мышью, Shift+стрелки, заголовок строки или столбца. Ctrl+C копирует.
          </span>
        )}
      </p>
    </div>
  );
}
