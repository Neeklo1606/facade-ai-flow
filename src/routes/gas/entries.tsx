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
import { fmtDate } from "@/lib/format";

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

  const columns: WidgetColumn<Row>[] = [
    { key: "number", header: "Номер", cell: (row) => <Num>{row.number}</Num> },
    { key: "day", header: "Дата", cell: (row) => <Num>{fmtDate(row.day)}</Num> },
    { key: "brigade", header: "Бригада", cell: (row) => row.brigade },
    { key: "object", header: "Объект", cell: (row) => row.object },
    { key: "frame", header: "Смена", align: "right", cell: (row) => <Num>{row.frame}</Num> },
    {
      key: "minutes",
      header: "Минуты",
      align: "right",
      cell: (row) => <Num>{row.minutes}</Num>,
    },
    {
      key: "hours",
      header: "Часы",
      align: "right",
      cell: (row) => <HoursCell minutes={row.minutes} />,
    },
    ...(actor.canSeeMoney
      ? [
          {
            key: "amount",
            header: "Сумма",
            align: "right" as const,
            cell: (row: Row) => <MoneyCell value={row.amountRub} />,
          },
          {
            key: "rate",
            header: "Доходность",
            align: "right" as const,
            cell: (row: Row) => <RateCell value={row.revenue} />,
          },
        ]
      : []),
    { key: "status", header: "Статус", cell: (row) => <EntryStatusBadge status={row.status} /> },
    { key: "flags", header: "Признаки", cell: (row) => <FlagList flags={row.flags} /> },
    { key: "source", header: "Данные", cell: (row) => <SourceMark source={row.source} /> },
  ];

  const current = useGasEntry(open);

  return (
    <div className="flex flex-col gap-6">
      <WidgetCard>
        <WidgetCardHeader
          icon={ListFilter}
          title="Журнал записей"
          hint={`${rows.length} записей по текущим фильтрам`}
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
              className="h-10 w-full rounded-[var(--r-sm)] border border-line bg-surface ps-9 pe-3 text-[13px] focus-ring"
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
    <label className="block text-[13px] text-text-3">
      <span className="mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-[150px] rounded-[var(--r-sm)] border border-line bg-surface px-2 text-[13px] text-text focus-ring"
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
