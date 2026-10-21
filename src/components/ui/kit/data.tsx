/**
 * Данные ADR-045: карточка показателя (4.14), поля детали (4.15), таблица компьютера (4.16).
 */
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- MetricCard */

/**
 * Поверхность уровня 1, отступ 16, подпись text-meta сверху, число text-title (или text-hero
 * у главного показателя экрана, только одного), единица тише, одна строка пояснения.
 */
export function MetricCard({
  label,
  value,
  unit,
  note,
  hero = false,
  source,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  hero?: boolean;
  /** «Факт» или «Демо» тихим словом */
  source?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface-1 p-card", className)}>
      <p className="flex items-center justify-between gap-2 text-meta text-text-2">
        <span className="truncate">{label}</span>
        {source ? <span className="shrink-0 text-text-3">{source}</span> : null}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={cn("tnum text-text", hero ? "text-hero" : "text-title")}>{value}</span>
        {unit ? <span className="text-meta text-text-3">{unit}</span> : null}
      </p>
      {note ? <p className="mt-1 truncate text-meta text-text-3">{note}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- FieldRow */

/** Строка детали 48-52: иконка 20 без круга, подпись text-meta над значением text-body */
export function FieldRow({
  icon: Icon,
  label,
  value,
  aside,
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  /** Справа тихо: «Демо», «версия 2» */
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-start gap-3 py-1.5">
      {Icon ? (
        <Icon className="mt-2.5 size-5 shrink-0 text-text-3" strokeWidth={1.75} aria-hidden />
      ) : null}
      <div className="min-w-0 flex-1">
        <dt className="text-meta text-text-3">{label}</dt>
        <dd className="text-body break-words text-text">{value}</dd>
      </div>
      {aside ? <span className="mt-4 shrink-0 text-meta text-text-3">{aside}</span> : null}
    </div>
  );
}

/** Группа полей с заголовком text-meta, без заливки на всю ширину */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-2">
      <h3 className="text-meta-strong text-text-2">{title}</h3>
      <dl className="mt-1 divide-y divide-line">{children}</dl>
    </section>
  );
}

/* ---------------------------------------------------------------- DataTable */

export interface TableColumn<T> {
  key: string;
  title: string;
  cell: (row: T) => ReactNode;
  /** Числа вправо */
  numeric?: boolean;
}

/**
 * Таблица компьютера: шапка липкая (text-meta, surface-2), строка 44-48, text-table, числа
 * вправо, первый столбец закреплён с границей 1 px, выбор строк флажками, строка действий
 * над таблицей. Нажатие на строку открывает деталь панелью справа (обработчик экрана).
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  activeKey,
  selectable = false,
  bulkActions,
  label,
  dense = false,
}: {
  rows: readonly T[];
  columns: readonly TableColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  activeKey?: string | null;
  selectable?: boolean;
  /** Строка действий для выбранных: получает их ключи */
  bulkActions?: (selected: string[], clear: () => void) => ReactNode;
  label: string;
  /** Строки 40 для отчёта «как Excel» */
  dense?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const all = rows.length > 0 && selected.length === rows.length;
  const toggle = (key: string) =>
    setSelected((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  return (
    <div className="surface-1 overflow-hidden">
      {selectable && selected.length && bulkActions ? (
        <div className="flex h-control items-center gap-2 border-b border-line bg-surface-2 px-row text-body">
          <span className="text-body-strong">Выбрано {selected.length}</span>
          <span className="flex-1" />
          {bulkActions(selected, () => setSelected([]))}
        </div>
      ) : null}
      <div className="overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-table" aria-label={label}>
          <thead>
            <tr>
              {selectable ? (
                <th className="sticky top-0 left-0 z-20 w-11 border-b border-line bg-surface-2 px-3">
                  <input
                    type="checkbox"
                    checked={all}
                    onChange={() => setSelected(all ? [] : rows.map(rowKey))}
                    aria-label="Выбрать все"
                    className="size-4 accent-[var(--orange-strong)]"
                  />
                </th>
              ) : null}
              {columns.map((column, i) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 h-10 border-b border-line bg-surface-2 px-3 text-meta font-normal whitespace-nowrap text-text-2",
                    column.numeric ? "text-right" : "text-left",
                    i === 0 && "left-0 z-20 border-e",
                    i === 0 && selectable && "left-11",
                  )}
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const on = selected.includes(key);
              const active = activeKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  aria-selected={selectable ? on : undefined}
                  className={cn(
                    "group",
                    onRowClick && "cursor-pointer",
                    active ? "[&>td]:bg-surface-2" : "is-hover:[&>td]:bg-surface-2",
                  )}
                >
                  {selectable ? (
                    <td
                      className="sticky left-0 z-10 border-b border-line bg-surface px-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(key)}
                        aria-label={`Выбрать строку ${key}`}
                        className="size-4 accent-[var(--orange-strong)]"
                      />
                    </td>
                  ) : null}
                  {columns.map((column, i) => (
                    <td
                      key={column.key}
                      className={cn(
                        "border-b border-line bg-surface px-3 whitespace-nowrap text-text",
                        dense ? "h-10" : "h-12",
                        column.numeric && "text-right tnum",
                        i === 0 && "sticky left-0 z-10 border-e",
                        i === 0 && selectable && "left-11",
                      )}
                    >
                      {i === 0 && onRowClick ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRowClick(row);
                          }}
                          className="text-left focus-ring"
                        >
                          {column.cell(row)}
                        </button>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
