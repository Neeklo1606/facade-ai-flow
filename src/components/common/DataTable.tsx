import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
            <tr className="h-10 border-b border-line text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn("px-4 text-[13px] font-normal text-text-3", c.className)}
                >
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
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "h-14 border-b border-line transition-fast last:border-0 is-hover:bg-surface-2 focus-ring",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 align-middle text-text-2 first:font-medium first:text-text",
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
            <section
              key={row.id}
              className="min-h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface p-4"
            >
              <div className="min-w-0 break-words text-[16px] leading-6 font-medium">{primary.cell(row)}</div>
              <dl className="mt-3 grid gap-2">
                {rest.map((c) => (
                  <div
                    key={c.key}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3"
                  >
                    <dt className="text-[13px] text-text-muted">{c.header}</dt>
                    <dd className="min-w-0 break-words text-caption">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
              {onRowClick && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => onRowClick(row)}
                >
                  Открыть
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
