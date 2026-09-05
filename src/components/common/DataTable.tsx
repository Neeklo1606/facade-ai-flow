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
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-table">
          <thead>
            <tr className="border-b border-border text-left">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-2.5 text-caption font-medium text-text-muted", c.className)}>
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
                  "border-b border-border last:border-0 transition-fast",
                  onRowClick && "cursor-pointer hover:bg-subtle",
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-2.5 align-top", c.className)}>
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
          const rest = columns.filter((c) => c !== primary && !c.hideOnCard);
          return (
            <button
              key={row.id}
              type="button"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className="card-surface w-full min-h-11 p-4 text-left transition-fast hover:bg-subtle"
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
