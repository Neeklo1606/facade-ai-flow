/**
 * Сетка «Табеля» (ADR-061, 11; раздел 4.5), работает как Google Таблицы:
 * - выделение ячейки, диапазона (мышь, Shift+стрелки), строки и столбца по заголовку;
 * - Ctrl/Cmd+C копирует выделенное в TSV, Ctrl/Cmd+A выделяет всё;
 * - строка внизу: «Сумма / Среднее / Количество» по числам выделенного;
 * - Enter или двойной клик открывает ячейку (исходные записи);
 * - закреплены первый столбец и две строки шапки, подсветка строки и столбца под мышью;
 * - ширина колонок мышью за край заголовка, плотность строк;
 * - строки виртуализируются от 200: рисуется только видимое окно.
 * Телефон (`touch`), как в мобильных Google Таблицах: узкий закреплённый столбец, строки
 * от 44 px, касание выделяет ячейку и показывает итог внизу, второе касание открывает записи.
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
  statsValues,
  toTsv,
  tsvNumber,
  wholeColumn,
  wholeRow,
  type CellStatus,
  type Selection,
} from "@/api/gas-ops";
import { cn } from "@/lib/utils";
import { useGasContour } from "@/lib/gas-ops/contour";
import { toast } from "@/lib/toast";

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
  touch = false,
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
  /** Телефон: отступы уровней меньше, подсказка про касания, итоги одной строкой */
  touch?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const scroller = useRef<HTMLDivElement>(null);
  const markBar = useRef<HTMLDivElement>(null);
  const [markBarHeight, setMarkBarHeight] = useState(56);
  useLayoutEffect(() => {
    const el = markBar.current;
    if (!el) return;
    const measure = () => setMarkBarHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const contour = useGasContour().kind;
  const marksKey = `gaika-grid-marks-v1:${contour}`;
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [marksReady, setMarksReady] = useState(false);
  useEffect(() => {
    setMarksReady(false);
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(marksKey) ?? "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        setMarks(
          Object.fromEntries(
            Object.entries(saved).filter(
              ([, v]) => typeof v === "string" && ["amber", "green", "violet"].includes(v),
            ),
          ),
        );
      } else setMarks({});
    } catch {
      setMarks({});
      toast.error("Не удалось прочитать пометки таблицы");
    }
    setMarksReady(true);
  }, [marksKey]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(800);
  const dragging = useRef(false);
  const size = { rows: rows.length, cols: columns.length };
  const rect = selection ? rectOf(selection) : null;

  const markSelection = (color: string | null) => {
    if (!rect || !marksReady) return;
    const next = { ...marks };
    for (let r = rect.top; r <= rect.bottom; r += 1) {
      for (let c = rect.left; c <= rect.right; c += 1) {
        const row = rows[r];
        const column = columns[c];
        if (!row || !column) continue;
        const key = JSON.stringify([row.id, column.key]);
        if (color) next[key] = color;
        else delete next[key];
      }
    }
    try {
      localStorage.setItem(marksKey, JSON.stringify(next));
      setMarks(next);
    } catch {
      toast.error("Пометки не сохранены: хранилище браузера недоступно");
    }
  };

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
    const cells: { value: number | null; kind: string }[] = [];
    for (let r = rect.top; r <= rect.bottom; r += 1)
      for (let c = rect.left; c <= rect.right; c += 1)
        cells.push({ value: cell(r, c).value, kind: rows[r]?.kind ?? "address" });
    const { values, skipped } = statsValues(cells);
    return { ...selectionStats(values), cells: cells.length, skipped };
  }, [rect?.top, rect?.bottom, rect?.left, rect?.right, cell, rows]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Касание по уже выделенной ячейке открывает её записи: двойного клика на телефоне нет
    if (
      event.pointerType !== "mouse" &&
      rect &&
      rect.top === row &&
      rect.bottom === row &&
      rect.left === col &&
      rect.right === col
    ) {
      onOpen(row, col);
      return;
    }
    // Палец ведёт прокрутку, а не диапазон: протяжка выделяет только мышью
    dragging.current = event.pointerType === "mouse";
    setSelection((current) =>
      event.shiftKey && current
        ? { anchor: current.anchor, focus: { row, col } }
        : { anchor: { row, col }, focus: { row, col } },
    );
    scroller.current?.focus({ preventScroll: true });
  };
  const extendCell = (row: number, col: number) => {
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
  const indent = touch ? 10 : 16;

  return (
    <div className="flex min-h-0 flex-col">
      {/*
       * Подсветка столбца под мышью убрана (обратная связь 20.11.2026): при движении курсора
       * по таблице мигали целые столбцы. Остаётся подсветка строки и выделение ячеек
       */}
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
        className="surface-1 relative overflow-auto overscroll-contain focus-ring select-none"
        style={{ height: `calc(${height} - ${markBarHeight}px)` }}
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
                      "sticky left-0 z-[1] cursor-pointer border-e border-b border-line bg-surface px-2 text-left font-normal group-hover/row:bg-surface-2",
                      // Телефон: название в две строки мельче, иначе в узком столбце видно «Брига…»
                      touch ? "pe-1" : "truncate",
                      touch
                        ? strong
                          ? "text-meta-strong"
                          : "text-meta"
                        : strong
                          ? "text-body-strong"
                          : "text-body",
                      row.kind === "total" && "bg-surface-2",
                      rowSelected && "bg-orange-dim",
                    )}
                    style={{ paddingInlineStart: (touch ? 4 : 8) + row.level * indent }}
                    title={row.label}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      {row.collapsible ? (
                        <button
                          type="button"
                          aria-expanded={!row.collapsed}
                          aria-label={`${row.collapsed ? "Развернуть" : "Свернуть"}: ${row.label}`}
                          onClick={() => onToggle(row.id)}
                          className={cn(
                            "grid w-[32px] shrink-0 place-items-center rounded-control text-text-3 focus-ring is-hover:bg-surface-3",
                            touch ? "h-11" : "h-control-sm",
                          )}
                        >
                          {row.collapsed ? (
                            <ChevronRight className="size-4" aria-hidden />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <span className={cn("shrink-0", touch ? "w-1" : "w-[32px]")} aria-hidden />
                      )}
                      <span
                        className={touch ? "line-clamp-2 leading-tight break-words" : "truncate"}
                      >
                        {row.label}
                      </span>
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
                      marks[JSON.stringify([row.id, column.key])]
                        ? "Личная цветовая пометка"
                        : null,
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
                        data-mark={marks[JSON.stringify([row.id, column.key])]}
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

      <div
        role="group"
        aria-label="Цвет выделенных ячеек"
        ref={markBar}
        className="flex flex-wrap items-center gap-1 border-b border-line py-1 text-meta"
      >
        <span className="mr-1 text-text-2">Цвет:</span>
        {(
          [
            ["amber", "Жёлтая"],
            ["green", "Зелёная"],
            ["violet", "Сиреневая"],
          ] as const
        ).map(([color, title]) => (
          <button
            key={color}
            type="button"
            disabled={!rect || !marksReady}
            onClick={() => markSelection(color)}
            aria-label={`${title} пометка`}
            className="grid min-h-12 min-w-12 place-items-center rounded-control focus-ring disabled:opacity-40"
          >
            <span
              aria-hidden
              className="grid-mark-swatch size-5 rounded-sm border border-line-2"
              data-mark={color}
            />
          </button>
        ))}
        <button
          type="button"
          disabled={!rect || !marksReady}
          onClick={() => markSelection(null)}
          aria-label="Очистить пометку"
          className="min-h-12 rounded-control px-2 focus-ring disabled:opacity-40"
        >
          Очистить
        </button>
        <span className="sr-only text-text-3 sm:not-sr-only">
          Личные · в этом браузере · без изменения сумм
        </span>
      </div>

      {/* Итоги выделенного, как внизу справа в Google Таблицах */}
      <p
        className={cn(
          "flex min-h-control-sm items-center gap-x-4 px-1 text-meta text-text-2 tnum",
          touch ? "justify-start overflow-x-auto whitespace-nowrap" : "flex-wrap justify-end",
        )}
        data-testid="selection-stats"
        aria-live="polite"
      >
        {stats && stats.cells > 0 ? (
          touch ? (
            <>
              <span className="text-body-strong text-text">
                Сумма: {stats.sum.toLocaleString("ru-RU")}
              </span>
              <span>Среднее: {stats.avg === null ? "–" : stats.avg.toLocaleString("ru-RU")}</span>
              <span>Ячеек: {stats.cells}</span>
              {stats.skipped ? <span className="text-text-3">без итогов групп</span> : null}
            </>
          ) : (
            <>
              <span>Выделено ячеек: {stats.cells}</span>
              <span>Сумма: {stats.sum.toLocaleString("ru-RU")}</span>
              <span>Среднее: {stats.avg === null ? "–" : stats.avg.toLocaleString("ru-RU")}</span>
              <span>Количество: {stats.count}</span>
              {stats.skipped ? (
                <span className="text-text-3">итоги групп не складываются</span>
              ) : null}
            </>
          )
        ) : (
          <span className={touch ? "py-1 whitespace-normal text-text-3" : "text-text-3"}>
            {touch
              ? "Коснитесь ячейки: итог тут, ещё раз: записи"
              : "Выделите ячейки: мышью, Shift+стрелки, заголовок строки или столбца. Ctrl+C копирует."}
          </span>
        )}
      </p>
    </div>
  );
}
