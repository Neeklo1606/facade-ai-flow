import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** скрыть колонку в мобильной карточке */
  hideOnCard?: boolean;
  /** заголовок карточки на мобильном */
  primary?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <>
      {/* Десктоп: таблица */}
      <div className="hidden overflow-x-auto rounded-[var(--r-md)] lg:block">
        <table className="w-full text-table">
          <thead>
            <tr className="h-10 bg-subtle text-left">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 text-overline text-text-muted", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "h-[52px] border-b border-border last:border-0 transition-fast",
                  onRowClick && "cursor-pointer hover:bg-hover",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 align-middle text-text-secondary first:font-medium first:text-text-primary",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Мобильный: карточки */}
      <div className="grid gap-3 p-3 lg:hidden">
        {rows.map((row) => {
          const primary = columns.find((c) => c.primary) ?? columns[0];
          if (!primary) return null;
          const rest = columns.filter((c) => c !== primary && !c.hideOnCard);
          return (
            <button
              key={row.id}
              type="button"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className="card-surface min-h-11 w-full p-4 text-left transition-fast hover:border-border-strong hover:bg-hover hover:shadow-[var(--shadow-sm)]"
            >
              <div className="text-[14px] font-medium">{primary.cell(row)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[11px] text-text-muted">{c.header}</dt>
                    <dd className="text-caption">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </button>
          );
        })}
      </div>
    </>
  );
}
