/**
 * Отчёт на телефоне (ADR-044, F6): не таблица, а дерево группа → бригада → адреса.
 * У строки три числа выбранного периода в одну линию: «44 847 ₽ · 6,58 ч · 6 812 ₽/ч».
 * Уровень сворачивается касанием всей строки: цель нажатия во всю ширину, от 56 px.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReportRow } from "@/api/gas-ops";
import type { ReportPeriod } from "@/api/gas-report";
import { cn } from "@/lib/utils";
import { hasValue, isNewRow, tripleText } from "./cell-text";
import { DemoMark, NewDot } from "./cells";

export function ReportTree({
  rows,
  period,
  collapsed,
  onToggle,
  changed,
  flashRowId,
  tourRowId,
}: {
  rows: ReportRow[];
  period: ReportPeriod;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  changed: Set<string>;
  flashRowId: string | null;
  tourRowId: string | null;
}) {
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
  const cellOf = (row: ReportRow) => (typeof period === "number" ? row.days[period] : row.total);
  // Рамка смены в режиме дня видна, только если в этот день она была
  const body = rows.filter(
    (row) =>
      row.kind !== "total" &&
      !hidden(row) &&
      !(row.kind === "frame" && typeof period === "number" && !row.days[period]?.frame),
  );
  const total = rows.find((row) => row.kind === "total");

  return (
    <div className="card-v3 overflow-hidden" data-testid="report-tree">
      <ul className="flex flex-col">
        {body.map((row) => {
          const expandable = parents.has(row.id) && row.kind !== "frame";
          const open = !collapsed.has(row.id);
          const cell = cellOf(row);
          const flash = flashRowId === row.id;
          const frameText =
            row.kind === "frame"
              ? typeof period === "number"
                ? cell?.frame
                : row.frameTotalText
              : undefined;
          const numbers =
            row.kind === "frame"
              ? (frameText ?? "нет рамки")
              : hasValue(cell)
                ? tripleText(cell!)
                : "нет значений";
          const content = (
            <>
              <span className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-text-3">
                  {expandable ? (
                    open ? (
                      <ChevronDown className="size-4" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4" aria-hidden />
                    )
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        "text-[15px] leading-5",
                        row.kind === "group" && "font-semibold",
                        row.kind === "brigade" && "font-medium",
                        row.kind === "frame" && "text-[13px] text-text-3",
                      )}
                    >
                      {row.kind === "frame" ? "Рамка смены" : row.label}
                    </span>
                    {isNewRow(row, changed) ? <NewDot /> : null}
                    {row.kind !== "frame" && row.source === "mock" ? <DemoMark /> : null}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-[13px] leading-5 tnum",
                      hasValue(cell) || frameText ? "text-text-2" : "text-text-3",
                      row.kind === "group" && hasValue(cell) && "text-text",
                    )}
                  >
                    {numbers}
                  </span>
                </span>
              </span>
            </>
          );
          const shared = cn(
            "flex min-h-14 w-full items-center px-4 py-2.5 text-start transition-colors duration-500",
            row.kind === "group" ? "bg-surface-2" : "bg-surface",
            flash && "bg-[color-mix(in_oklab,var(--orange)_16%,var(--surface))]",
          );
          const indent = { paddingInlineStart: `${16 + row.level * 14}px` };
          return (
            <li
              key={row.id}
              data-report-row={row.id}
              data-kind={row.kind}
              data-flash={flash ? "true" : undefined}
              data-tour={tourRowId === row.id ? "report-row" : undefined}
              className="border-b border-line last:border-0"
            >
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggle(row.id)}
                  style={indent}
                  className={cn(shared, "focus-ring")}
                >
                  {content}
                </button>
              ) : (
                <div style={indent} className={shared}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {total ? (
        <div
          data-report-row="total"
          className="flex min-h-14 flex-col justify-center gap-0.5 bg-surface-3 px-4 py-2.5"
        >
          <span className="text-[15px] font-semibold">Итого</span>
          <span className="text-[13px] text-text tnum">
            {hasValue(cellOf(total)) ? tripleText(cellOf(total)!) : "нет значений"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
