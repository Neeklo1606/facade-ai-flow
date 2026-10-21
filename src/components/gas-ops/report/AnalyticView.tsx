/**
 * Аналитическая таблица отчёта (ТЗ, п. 9): плоские записи с фильтрами. На десктопе фильтры
 * над таблицей, на телефоне в шторке «Фильтры (N)», записи карточками вместо таблицы.
 */
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { EntryStatusBadge, HoursCell, MoneyCell, Num, RateCell } from "@/components/gas-ops/marks";
import { fmtHours, fmtRate, fmtRub, type AnalyticRow } from "@/api/gas-ops";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type SourceFilter = "all" | "fact-report" | "mock";

interface Filters {
  day: string;
  brigade: string;
  source: SourceFilter;
}

const NONE: Filters = { day: "all", brigade: "all", source: "all" };

export function AnalyticView({
  rows,
  days,
  phone,
}: {
  rows: AnalyticRow[];
  days: { iso: string; label: string }[];
  phone: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(NONE);
  const [sheet, setSheet] = useState(false);
  const brigades = useMemo(
    () =>
      [...new Set(rows.map((r) => r.brigadeName))].sort((a, b) =>
        a.localeCompare(b, "ru", { numeric: true }),
      ),
    [rows],
  );
  const active = (Object.keys(NONE) as (keyof Filters)[]).filter(
    (key) => filters[key] !== NONE[key],
  ).length;

  const shown = rows
    .filter((r) => filters.day === "all" || r.day === filters.day)
    .filter((r) => filters.brigade === "all" || r.brigadeName === filters.brigade)
    .filter((r) => filters.source === "all" || r.source === filters.source)
    .sort((a, b) => a.day.localeCompare(b.day) || a.number.localeCompare(b.number));

  const controls = (
    <FilterControls filters={filters} onChange={setFilters} days={days} brigades={brigades} />
  );

  const columns: WidgetColumn<AnalyticRow & { id: string }>[] = [
    { key: "number", header: "Номер", cell: (row) => <Num>{row.number}</Num> },
    { key: "day", header: "Дата", cell: (row) => <Num>{fmtDate(row.day)}</Num> },
    { key: "brigade", header: "Бригада", cell: (row) => row.brigadeName },
    { key: "employee", header: "Сотрудник", cell: (row) => row.employeeName },
    {
      key: "object",
      header: "Объект",
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="max-w-[320px] truncate" title={row.objectLabel}>
            {row.objectLabel}
          </span>
          {row.source === "mock" ? <span className="text-meta text-text-3">Демо</span> : null}
        </span>
      ),
    },
    { key: "minutes", header: "Минуты", align: "right", cell: (row) => <Num>{row.minutes}</Num> },
    {
      key: "hours",
      header: "Часы",
      align: "right",
      cell: (row) => <HoursCell minutes={row.minutes} />,
    },
    {
      key: "amount",
      header: "Сумма",
      align: "right",
      cell: (row) => <MoneyCell value={row.amountRub} />,
    },
    {
      key: "rate",
      header: "Доходность",
      align: "right",
      cell: (row) => <RateCell value={row.revenue} />,
    },
    { key: "status", header: "Статус", cell: (row) => <EntryStatusBadge status={row.status} /> },
  ];

  return (
    <section aria-labelledby="analytic-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="analytic-title" className="text-heading">
          Записи недели <span className="font-normal text-text-3 tnum">{shown.length}</span>
        </h2>
        {phone ? (
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="text-body-strong inline-flex min-h-11 items-center gap-2 rounded-control border border-line-2 bg-surface px-4 font-medium focus-ring"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Фильтры ({active})
          </button>
        ) : null}
      </div>

      {phone ? (
        <BottomSheet open={sheet} onOpenChange={setSheet} title={`Фильтры (${active})`}>
          {controls}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setFilters(NONE)}
              className="text-body-strong min-h-12 flex-1 rounded-full bg-surface-2 font-medium focus-ring"
            >
              Сбросить
            </button>
            <button
              type="button"
              onClick={() => setSheet(false)}
              className="pill-action flex-1 focus-ring"
            >
              Показать {shown.length}
            </button>
          </div>
        </BottomSheet>
      ) : (
        controls
      )}

      {phone ? (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li key={row.entryId} className="card-v3 px-4 py-3">
              <div className="text-meta flex items-center justify-between gap-2 text-text-3 tnum">
                <span>
                  {row.number} · {fmtDate(row.day)}
                </span>
                <EntryStatusBadge status={row.status} />
              </div>
              <p className="text-body-strong mt-1 font-medium">{row.objectLabel}</p>
              <p className="text-meta mt-0.5 text-text-2">
                {row.brigadeName}
                {row.source === "mock" ? <span className="text-text-3"> · Демо</span> : null}
              </p>
              <p className="text-body mt-1.5 tnum">
                {row.amountRub === null ? "—" : fmtRub(row.amountRub)} ·{" "}
                {fmtHours(row.minutes / 60)} · {fmtRate(row.revenue)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card-v3 px-6 py-2">
          <WidgetTable columns={columns} rows={shown.map((row) => ({ ...row, id: row.entryId }))} />
        </div>
      )}
    </section>
  );
}

function FilterControls({
  filters,
  onChange,
  days,
  brigades,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  days: { iso: string; label: string }[];
  brigades: string[];
}) {
  const set = (part: Partial<Filters>) => onChange({ ...filters, ...part });
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="-mx-gutter overflow-x-auto px-gutter lg:mx-0 lg:px-0">
        <div role="group" aria-label="День" className="seg">
          {[{ iso: "all", label: "Все дни" }, ...days].map((day) => (
            <button
              key={day.iso}
              type="button"
              data-active={filters.day === day.iso}
              aria-pressed={filters.day === day.iso}
              onClick={() => set({ day: day.iso })}
              className="seg-item tnum focus-ring"
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>
      <label className="text-body flex items-center gap-2 text-text-2">
        <span className="shrink-0">Бригада</span>
        <select
          value={filters.brigade}
          onChange={(event) => set({ brigade: event.target.value })}
          className="text-body min-h-11 flex-1 rounded-control border border-line-2 bg-surface px-4 text-text focus-ring lg:min-h-10 lg:flex-none"
        >
          <option value="all">Все бригады</option>
          {brigades.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div role="group" aria-label="Данные" className={cn("seg self-start")}>
        {(
          [
            ["all", "Все данные"],
            ["fact-report", "Факт"],
            ["mock", "Демо"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-active={filters.source === value}
            aria-pressed={filters.source === value}
            onClick={() => set({ source: value })}
            className="seg-item focus-ring"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
