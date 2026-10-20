/**
 * Недельный отчёт в структуре Excel заказчика, десктоп (ADR-043; ADR-044, F6).
 *
 * Первый столбец «Бригада и адрес» и обе строки шапки дней закреплены, таблица
 * прокручивается внутри своей карточки, у закреплённого края при прокрутке появляется тень.
 * В режиме дня три столбца показателей дня и итог недели: ничего не прокручивается.
 *
 * Инварианты видны прямо на экране: агрегат не складывается с детьми, строка без суммы
 * остаётся с прочерком, строка рамки смены не несёт денег.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReportRow } from "@/api/gas-ops";
import type { ReportPeriod } from "@/api/gas-report";
import { cn } from "@/lib/utils";
import {
  amountText,
  hoursText,
  isNewRow,
  rateText,
  type ReportCellValue,
} from "./report/cell-text";
import { DemoMark, NewDot, Value } from "./report/cells";

const HEAD = [
  { short: "Сумма", full: "Сумма начислений" },
  { short: "Часы", full: "Эффективное рабочее время (ч.)" },
  { short: "Доходность", full: "Доходность часа" },
];

export interface CustomerReportProps {
  rows: ReportRow[];
  days: { iso: string; label: string }[];
  period: ReportPeriod;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  changed: Set<string>;
  /** Строка из сценария: подсвечена 4 секунды */
  flashRowId: string | null;
  /** Строка, на которую указывает шаг показа */
  tourRowId: string | null;
}

/** Фон строки непрозрачный: под закреплённым столбцом не должны просвечивать числа */
function rowTone(row: ReportRow, flash: boolean): string {
  if (flash) return "bg-[color-mix(in_oklab,var(--orange)_16%,var(--surface))]";
  if (row.kind === "group") return "bg-surface-2";
  if (row.kind === "total") return "bg-surface-3";
  return "bg-surface";
}

export function CustomerReport({
  rows,
  days,
  period,
  collapsed,
  onToggle,
  changed,
  flashRowId,
  tourRowId,
}: CustomerReportProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onScroll = () => setScrolled(element.scrollLeft > 2);
    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [period]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const parents = new Set(rows.map((r) => r.parentId).filter(Boolean));
  const hidden = (row: ReportRow): boolean => {
    let parent = row.parentId;
    while (parent) {
      if (collapsed.has(parent)) return true;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return false;
  };
  const visible = rows.filter((row) => !hidden(row));

  // Колонки вида: все дни и «Итого», один день и «Итого» или только «Итого»
  const columns: { key: string; title: string; cell: (row: ReportRow) => ReportCellValue }[] =
    period === "week"
      ? [
          ...days.map((day, index) => ({
            key: day.iso,
            title: day.label,
            cell: (row: ReportRow) => row.days[index]!,
          })),
          { key: "total", title: "Итого недели", cell: (row: ReportRow) => row.total },
        ]
      : period === "total"
        ? [{ key: "total", title: "Итого недели", cell: (row: ReportRow) => row.total }]
        : [
            {
              key: days[period]?.iso ?? "day",
              title: days[period]?.label ?? "",
              cell: (row: ReportRow) => row.days[period]!,
            },
            { key: "total", title: "Итого недели", cell: (row: ReportRow) => row.total },
          ];
  const wide = period === "week";

  const stickyEdge = cn(
    "sticky start-0 z-10 transition-shadow",
    scrolled && "shadow-[10px_0_14px_-10px_rgba(0,0,0,0.35)]",
  );

  return (
    <div
      ref={scroller}
      data-testid="report-table"
      className={cn(
        "card-v3 relative max-h-[min(72dvh,820px)] overflow-auto overscroll-x-contain",
        !wide && "overflow-x-hidden",
      )}
    >
      <table
        className={cn(
          "border-separate border-spacing-0 text-[13px]",
          wide ? "min-w-max" : "w-full",
        )}
      >
        <thead>
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={cn(
                stickyEdge,
                "top-0 z-30 h-[84px] min-w-[300px] border-b border-line bg-surface px-5 text-start align-bottom pb-3 font-normal text-text-3",
              )}
            >
              Бригада и адрес
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="colgroup"
                colSpan={3}
                className={cn(
                  "sticky top-0 z-20 h-11 border-s border-b border-line bg-surface px-4 text-center text-[14px] font-semibold whitespace-nowrap tnum",
                  column.key === "total" && "bg-surface-2",
                )}
              >
                {column.title}
              </th>
            ))}
          </tr>
          <tr>
            {columns.flatMap((column) =>
              HEAD.map((head, index) => (
                <th
                  key={`${column.key}-${head.short}`}
                  scope="col"
                  title={head.full}
                  className={cn(
                    "sticky top-11 z-20 h-10 border-b border-line bg-surface px-4 text-end text-[12px] font-normal whitespace-nowrap text-text-3",
                    index === 0 && "border-s",
                    column.key === "total" && "bg-surface-2",
                  )}
                >
                  {head.short}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const expandable = parents.has(row.id) && row.kind !== "frame";
            const open = !collapsed.has(row.id);
            const flash = flashRowId === row.id;
            const tone = rowTone(row, flash);
            const strong = row.kind === "group" || row.kind === "total";
            return (
              <tr
                key={row.id}
                data-report-row={row.id}
                data-kind={row.kind}
                data-flash={flash ? "true" : undefined}
                data-tour={tourRowId === row.id ? "report-row" : undefined}
                className={cn(
                  strong && "font-semibold",
                  row.kind === "brigade" && "font-medium",
                  row.kind === "frame" && "text-[12px] text-text-3",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    stickyEdge,
                    tone,
                    row.kind === "total" && "bottom-0 z-[25] border-t",
                    wide ? "max-w-[360px]" : "max-w-[560px]",
                    "border-b border-line px-5 py-0 text-start font-[inherit] transition-colors duration-500",
                  )}
                >
                  <RowLabel
                    row={row}
                    expandable={expandable}
                    open={open}
                    onToggle={onToggle}
                    isNew={isNewRow(row, changed)}
                  />
                </th>
                {columns.map((column) => {
                  const cell = column.cell(row);
                  const tint =
                    column.key === "total" &&
                    !flash &&
                    row.kind !== "group" &&
                    row.kind !== "total";
                  const td = cn(
                    "h-11 border-b border-line px-4 text-end whitespace-nowrap transition-colors duration-500",
                    tint ? "bg-[color-mix(in_oklab,var(--surface-2)_45%,var(--surface))]" : tone,
                    // «Итого» прилипает к низу карточки: итог виден при любой прокрутке
                    row.kind === "total" && "sticky bottom-0 z-[15] border-t",
                  );
                  if (row.kind === "frame") {
                    const text = column.key === "total" ? row.frameTotalText : cell.frame;
                    return (
                      <td
                        key={column.key}
                        colSpan={3}
                        className={cn(td, "border-s text-center tnum")}
                      >
                        {text ?? ""}
                      </td>
                    );
                  }
                  return (
                    <Fragment key={column.key}>
                      <td className={cn(td, "border-s")}>
                        <Value text={amountText(cell)} />
                      </td>
                      <td className={td}>
                        <Value text={hoursText(cell)} />
                      </td>
                      <td className={td}>
                        <Value text={rateText(cell)} />
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowLabel({
  row,
  expandable,
  open,
  onToggle,
  isNew,
}: {
  row: ReportRow;
  expandable: boolean;
  open: boolean;
  onToggle: (id: string) => void;
  isNew: boolean;
}) {
  const indent = { paddingInlineStart: `${row.level * 16}px` };
  const label = row.kind === "frame" ? "Рамка смены" : row.label;
  const tail = (
    <>
      {isNew ? <NewDot /> : null}
      {row.kind !== "frame" && row.kind !== "total" && row.source === "mock" ? <DemoMark /> : null}
    </>
  );
  if (!expandable) {
    return (
      <span className="flex min-h-11 items-center gap-2" style={indent}>
        <span className="size-5 shrink-0" aria-hidden />
        <span className="truncate" title={label}>
          {label}
        </span>
        {tail}
      </span>
    );
  }
  // Сворачивает вся подпись строки, а не значок: в значок мышью и пальцем не попасть
  return (
    <button
      type="button"
      onClick={() => onToggle(row.id)}
      aria-expanded={open}
      style={indent}
      className="flex min-h-11 w-full items-center gap-2 rounded-[10px] text-start focus-ring is-hover:text-orange"
    >
      <span className="grid size-5 shrink-0 place-items-center text-text-3">
        {open ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
      </span>
      <span className="truncate" title={label}>
        {label}
      </span>
      {tail}
      <span className="sr-only">{open ? ". Свернуть" : ". Развернуть"}</span>
    </button>
  );
}
