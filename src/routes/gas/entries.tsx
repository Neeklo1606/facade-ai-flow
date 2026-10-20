import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ListFilter, Search } from "lucide-react";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { EmptyState } from "@/components/common/EmptyState";
import { EntryDetails } from "@/components/gas-ops/EntryDetails";
import {
  EntryStatusBadge,
  FlagList,
  HoursCell,
  MoneyCell,
  Num,
  RateCell,
  SourceMark,
} from "@/components/gas-ops/marks";
import { Button } from "@/components/ui/button";
import {
  ENTRY_STATUS_LABEL,
  formatClock,
  useGasActor,
  useGasDirectory,
  useGasEntries,
  useGasEntry,
  type EntryFlag,
  type EntryStatus,
} from "@/api/gas-ops";
import { fmtDate, plural } from "@/lib/format";

/**
 * Журнал записей времени (ТЗ, п. 8): всё, что заведено, с фильтрами и историей.
 * Бригадир видит здесь только свою бригаду и без сумм.
 */
export const Route = createFileRoute("/gas/entries")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Журнал записей времени — гайка" }] },
      "Журнал записей времени — гайка",
      "Все записи времени с фильтрами, статусами и историей изменений.",
    ),
  component: EntriesPage,
});

interface Row {
  id: string;
  number: string;
  day: string;
  brigade: string;
  employee: string;
  object: string;
  frame: string;
  minutes: number;
  amountRub: number | null;
  revenue: number | null;
  status: EntryStatus;
  source: "fact-report" | "mock";
  flags: EntryFlag[];
}

function EntriesPage() {
  const actor = useGasActor();
  const directory = useGasDirectory();
  const [brigade, setBrigade] = useState("all");
  const [status, setStatus] = useState<EntryStatus | "all">("all");
  const [day, setDay] = useState("all");
  const [source, setSource] = useState<"all" | "fact-report" | "mock">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const views = useGasEntries({
    brigadeId: brigade === "all" ? undefined : brigade,
    status: status === "all" ? undefined : status,
    day: day === "all" ? undefined : day,
    source: source === "all" ? undefined : source,
    search,
    ownBrigadeOnly: actor.role === "foreman",
  });

  const rows: Row[] = useMemo(
    () =>
      views.map((view) => ({
        id: view.entry.id,
        number: view.entry.number,
        day: view.entry.day,
        brigade: view.brigade?.name ?? "—",
        employee: view.employee?.name ?? "—",
        object: view.object?.label ?? "—",
        frame:
          view.entry.startMinutes !== null && view.entry.endMinutes !== null
            ? `${formatClock(view.entry.startMinutes)}—${formatClock(view.entry.endMinutes)}`
            : "—",
        minutes: view.entry.minutes,
        amountRub: view.entry.amountRub,
        revenue: view.revenue,
        status: view.entry.status,
        source: view.entry.source,
        flags: view.flags,
      })),
    [views],
  );

  /*
   * Колонок меньше, чем полей: смена и время, статус и признаки идут парами в одной ячейке.
   * Одиннадцать столбцов на экране ломали числа на две строки, а читать таблицу нужно
   * взглядом, а не по складам.
   */
  const columns: WidgetColumn<Row>[] = [
    {
      key: "number",
      header: "Номер и дата",
      cell: (row) => (
        <span className="whitespace-nowrap">
          <Num className="block">{row.number}</Num>
          <Num className="block text-text-3">{fmtDate(row.day)}</Num>
        </span>
      ),
    },
    {
      key: "object",
      header: "Объект и бригада",
      cell: (row) => (
        <span className="block min-w-[200px]">
          <span className="block">{row.object}</span>
          <span className="block text-text-3">
            {row.brigade}
            {row.employee === "—" ? "" : ` · ${row.employee}`}
          </span>
        </span>
      ),
    },
    {
      key: "time",
      header: "Смена и время",
      align: "right",
      cell: (row) => (
        <span className="block whitespace-nowrap">
          <Num className="block">{row.frame}</Num>
          <Num className="block text-text-3">
            {row.minutes} мин · <HoursCell minutes={row.minutes} />
          </Num>
        </span>
      ),
    },
    ...(actor.canSeeMoney
      ? [
          {
            key: "money",
            header: "Сумма и доходность",
            align: "right" as const,
            cell: (row: Row) => (
              <span className="block whitespace-nowrap">
                <MoneyCell value={row.amountRub} />
                <span className="block text-text-3">
                  <RateCell value={row.revenue} />
                </span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: "status",
      header: "Статус",
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <EntryStatusBadge status={row.status} />
          <FlagList flags={row.flags} />
        </span>
      ),
    },
    { key: "source", header: "Данные", cell: (row) => <SourceMark source={row.source} /> },
  ];

  const current = useGasEntry(open);

  return (
    <div className="flex flex-col gap-6">
      <WidgetCard>
        <WidgetCardHeader
          icon={ListFilter}
          title="Журнал записей"
          hint={`${rows.length} ${plural(rows.length, "запись", "записи", "записей")} по текущим фильтрам`}
          level={2}
        />

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="relative block min-w-[220px] flex-1">
            <span className="mb-1 block text-[13px] text-text-3">Поиск</span>
            <Search
              className="pointer-events-none absolute start-3 top-[34px] size-4 text-text-3"
              aria-hidden
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Номер, объект, бригада"
              className="h-12 w-full rounded-[var(--r-sm)] border border-line bg-surface ps-9 pe-3 text-[13px] focus-ring sm:h-10"
            />
          </label>

          <Select
            label="Бригада"
            value={brigade}
            onChange={setBrigade}
            options={[
              { value: "all", label: "Все бригады" },
              ...directory.brigades.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <Select
            label="Статус"
            value={status}
            onChange={(value) => setStatus(value as EntryStatus | "all")}
            options={[
              { value: "all", label: "Любой" },
              ...(Object.keys(ENTRY_STATUS_LABEL) as EntryStatus[]).map((key) => ({
                value: key,
                label: ENTRY_STATUS_LABEL[key],
              })),
            ]}
          />
          <Select
            label="День"
            value={day}
            onChange={setDay}
            options={[
              { value: "all", label: "Вся неделя" },
              ...directory.days.map((d) => ({ value: d, label: fmtDate(d) })),
            ]}
          />
          <Select
            label="Данные"
            value={source}
            onChange={(value) => setSource(value as "all" | "fact-report" | "mock")}
            options={[
              { value: "all", label: "Все" },
              { value: "fact-report", label: "Факт из отчёта" },
              { value: "mock", label: "Демо-сценарии" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBrigade("all");
              setStatus("all");
              setDay("all");
              setSource("all");
              setSearch("");
            }}
          >
            Сбросить фильтры
          </Button>
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState
              variant="filtered"
              title="Ничего не найдено"
              description="Измените фильтры или сбросьте их, чтобы увидеть все записи."
            />
          ) : (
            <WidgetTable columns={columns} rows={rows} onRowClick={(row) => setOpen(row.id)} />
          )}
        </div>
      </WidgetCard>

      {current && (
        <WidgetCard>
          <WidgetCardHeader
            icon={ListFilter}
            title={`Запись ${current.entry.number}`}
            hint="Исходные данные, расчёт и история"
            level={2}
            aside={
              <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                Закрыть
              </Button>
            }
          />
          <div className="mt-4">
            <EntryDetails view={current} />
          </div>
        </WidgetCard>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block w-full text-[13px] text-text-3 sm:w-auto">
      <span className="mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full min-w-[150px] rounded-[var(--r-sm)] border border-line bg-surface px-3 text-[13px] text-text focus-ring sm:h-10 sm:w-auto"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
