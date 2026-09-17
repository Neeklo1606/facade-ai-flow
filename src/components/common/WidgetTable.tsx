import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface WidgetColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Числовые колонки — вправо */
  align?: "left" | "right";
  className?: string;
}

/**
 * Таблица внутри карточки, без своей границы и зебры. Шапка 40px, строка 56px.
 * rowActions появляются справа при наведении на строку и при фокусе внутри неё.
 */
export function WidgetTable<T extends { id: string }>({
  columns,
  rows,
  rowActions,
  onRowClick,
  forceHoverRowId,
  className,
}: {
  columns: WidgetColumn<T>[];
  rows: T[];
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Только для витрины: показать строку в состоянии наведения */
  forceHoverRowId?: string;
  className?: string;
}) {
  return (
    // Таблица выходит на поля карточки (24px), чтобы подсветка строки шла от края до края
    <div className={cn("-mx-6 overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px] leading-[1.45]">
        <thead>
          <tr className="h-10 border-b border-line text-left">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-4 text-[12px] font-normal whitespace-nowrap text-text-3 first:pl-6 last:pr-6",
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
            {rowActions && (
              <th scope="col" className="w-px pr-6">
                <span className="sr-only">Действия</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-force={forceHoverRowId === row.id ? "hover" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "group h-14 border-b border-line transition-fast last:border-0 is-hover:bg-surface-2 focus-within:bg-surface-2",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 align-middle text-text first:pl-6 last:pr-6",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
              {rowActions && (
                <td className="pr-6 pl-2 text-right align-middle">
                  <div
                    className={cn(
                      "flex items-center justify-end gap-1 opacity-0 transition-fast group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
                      forceHoverRowId === row.id && "opacity-100",
                      "[@media(hover:none)]:opacity-100",
                    )}
                  >
                    {rowActions(row)}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Первая колонка: значение 14px и подпись 12px, опционально аватар-инициалы */
export function PrimaryCell({
  title,
  caption,
  avatarName,
}: {
  title: ReactNode;
  caption?: ReactNode;
  avatarName?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {avatarName && <InitialsAvatar name={avatarName} />}
      <div className="min-w-0">
        <div className="truncate text-[14px] leading-[1.35] font-medium text-text">{title}</div>
        {caption && <div className="truncate text-[12px] leading-[1.4] text-text-3">{caption}</div>}
      </div>
    </div>
  );
}

/** Число с единицей: единица на 2px меньше и приглушена */
export function NumberValue({
  value,
  unit,
  className,
}: {
  value: ReactNode;
  unit?: string;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {value}
      {unit && <span className="ml-1 text-[11px] text-text-3">{unit}</span>}
    </span>
  );
}

const avatarPalette = [
  "bg-orange-dim text-orange-hot",
  "bg-sand-dim text-sand",
  "bg-surface-3 text-text-2",
  "bg-info-bg text-info",
] as const;

/** Цвет аватара детерминирован: один и тот же человек всегда одного цвета */
function hashName(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function InitialsAvatar({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full leading-none font-medium",
        avatarPalette[hashName(name) % avatarPalette.length],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
