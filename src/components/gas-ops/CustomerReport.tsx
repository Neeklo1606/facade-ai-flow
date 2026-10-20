/**
 * Недельный отчёт в структуре Excel заказчика: подпись строки, по каждому дню три
 * показателя и колонка «Итого». Уровни сворачиваются, как группировка строк в файле.
 *
 * Инварианты видны прямо на экране: агрегат не складывается с детьми, строка без суммы
 * остаётся с прочерком, строка рамки смены не несёт денег.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fmtHours, fmtRate, fmtRub, type ReportRow } from "@/api/gas-ops";
import { SourceMark } from "./marks";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const HEAD = ["Сумма начислений", "Эффективное рабочее время (ч.)", "Доходность часа"];

function Cell({
  value,
  kind,
}: {
  value: {
    amountRub: number | null;
    minutes: number | null;
    revenue: number | null;
    frame?: string;
  };
  kind: "amount" | "hours" | "rate";
}) {
  if (value.frame && kind === "amount") {
    return <span className="text-text-3 tabular-nums">{value.frame}</span>;
  }
  if (value.frame) return <span className="text-text-3 tabular-nums">{value.frame}</span>;
  if (kind === "amount")
    return (
      <span className={cn("tabular-nums", value.amountRub === null && "text-text-3")}>
        {value.amountRub === null ? "—" : fmtRub(value.amountRub)}
      </span>
    );
  if (kind === "hours")
    return (
      <span className={cn("tabular-nums", !value.minutes && "text-text-3")}>
        {value.minutes ? fmtHours(value.minutes / 60) : "—"}
      </span>
    );
  return (
    <span className={cn("tabular-nums", value.revenue === null && "text-text-3")}>
      {fmtRate(value.revenue)}
    </span>
  );
}

export function CustomerReport({ rows, days }: { rows: ReportRow[]; days: string[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const hidden = (row: ReportRow): boolean => {
    let parent = row.parentId;
    const byId = new Map(rows.map((r) => [r.id, r]));
    while (parent) {
      if (collapsed.has(parent)) return true;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return false;
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasChildren = (row: ReportRow) => rows.some((r) => r.parentId === row.id);
  const visible = rows.filter((row) => !hidden(row));

  return (
    // Таблица шире экрана: прокручивается внутри своего контейнера, страница не едет
    <div className="-mx-6 overflow-x-auto">
      <table className="min-w-max border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <th
              scope="col"
              rowSpan={2}
              className="sticky start-0 z-10 bg-surface px-4 py-2 text-start font-normal text-text-3 first:ps-6"
            >
              Бригада и адрес
            </th>
            {days.map((day) => (
              <th
                key={day}
                scope="colgroup"
                colSpan={3}
                className="border-s border-line px-4 py-2 text-center font-medium whitespace-nowrap tabular-nums"
              >
                {fmtDate(day)}
              </th>
            ))}
            <th
              scope="colgroup"
              colSpan={3}
              className="border-s border-line px-4 py-2 text-center font-medium"
            >
              Итого
            </th>
          </tr>
          <tr className="border-b border-line">
            {[...days, "total"].flatMap((key) =>
              HEAD.map((title, index) => (
                <th
                  key={`${key}-${title}`}
                  scope="col"
                  className={cn(
                    "px-4 py-2 text-end text-[12px] font-normal whitespace-nowrap text-text-3",
                    index === 0 && "border-s border-line",
                  )}
                >
                  {title}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const expandable = hasChildren(row) && row.kind !== "frame";
            const isOpen = !collapsed.has(row.id);
            return (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-line last:border-0",
                  row.kind === "group" && "bg-surface-2 font-medium",
                  row.kind === "total" && "bg-orange-dim font-medium",
                  row.kind === "frame" && "text-text-3",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    "sticky start-0 z-10 max-w-[320px] px-4 py-2 text-start font-normal first:ps-6",
                    row.kind === "group"
                      ? "bg-surface-2"
                      : row.kind === "total"
                        ? "bg-orange-dim"
                        : "bg-surface",
                  )}
                >
                  {/*
                    Сворачивает вся подпись строки, а не значок: значок 24 px мимо пальца
                    на телефоне. Строка без детей подписью и остаётся, кнопкой не притворяется.
                  */}
                  {expandable ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      aria-expanded={isOpen}
                      style={{ paddingInlineStart: `${row.level * 14}px` }}
                      className="flex min-h-11 w-full items-center gap-1.5 rounded-[var(--r-xs)] text-start transition-fast hover:bg-surface-2 focus-ring lg:min-h-0"
                    >
                      <span className="grid size-6 shrink-0 place-items-center text-text-3">
                        {isOpen ? (
                          <ChevronDown className="size-4" aria-hidden />
                        ) : (
                          <ChevronRight className="size-4" aria-hidden />
                        )}
                      </span>
                      <span className="truncate" title={row.label}>
                        {row.label}
                      </span>
                      {row.source === "mock" && <SourceMark source="mock" />}
                      <span className="sr-only">{isOpen ? ". Свернуть" : ". Развернуть"}</span>
                    </button>
                  ) : (
                    <span
                      className="flex min-h-11 items-center gap-1.5 lg:min-h-0"
                      style={{ paddingInlineStart: `${row.level * 14}px` }}
                    >
                      <span className="size-6 shrink-0" aria-hidden />
                      <span className="truncate" title={row.label}>
                        {row.kind === "frame" ? "Рамка смены" : row.label}
                      </span>
                      {row.kind !== "frame" && row.source === "mock" && (
                        <SourceMark source="mock" />
                      )}
                    </span>
                  )}
                </th>

                {row.days.map((cell, index) => (
                  <Fragment key={`${row.id}-${index}`}>
                    <td className="border-s border-line px-4 py-2 text-end">
                      <Cell value={cell} kind="amount" />
                    </td>
                    <td className="px-4 py-2 text-end">
                      {cell.frame ? null : <Cell value={cell} kind="hours" />}
                    </td>
                    <td className="px-4 py-2 text-end">
                      {cell.frame ? null : <Cell value={cell} kind="rate" />}
                    </td>
                  </Fragment>
                ))}

                <td className="border-s border-line px-4 py-2 text-end">
                  {row.kind === "frame" ? (
                    <span className="whitespace-nowrap text-text-3">{row.frameTotalText}</span>
                  ) : (
                    <Cell value={row.total} kind="amount" />
                  )}
                </td>
                <td className="px-4 py-2 text-end">
                  {row.kind === "frame" ? null : <Cell value={row.total} kind="hours" />}
                </td>
                <td className="px-4 py-2 text-end">
                  {row.kind === "frame" ? null : <Cell value={row.total} kind="rate" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
