import { completePageHead } from "@/lib/page-head";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { BottomSheet } from "@/components/common/BottomSheet";
import {
  EntryStatusBadge,
  HoursCell,
  MarkList,
  MoneyCell,
  Num,
  RateCell,
  SourceMark,
} from "@/components/gas-ops/marks";
import { QueueCard } from "@/components/gas-ops/review/QueueCard";
import { entryFrame, fmtShortDay, marksOf, type Mark } from "@/components/gas-ops/review/rules";
import { ReviewPanel } from "@/components/gas-ops/review/ReviewPanel";
import { PhoneSheet } from "@/components/gas-ops/review/PhoneSheet";
import { useFloatingBottom, useIsDesktop } from "@/components/gas-ops/review/use-layout";
import { ScreenHint } from "@/components/gas-ops/page";
import {
  ENTRY_STATUS_LABEL,
  useGasActor,
  useGasDirectory,
  useGasEntries,
  useGasEntry,
  type EntryStatus,
  type EntryView,
} from "@/api/gas-ops";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Журнал записей времени (ADR-044): всё, что заведено, с поиском, фильтрами и историей.
 * Строка поиска в шапке ведёт сюда с `?q=`. На телефоне карточки вместо таблицы, фильтры
 * в шторке. Бригадир видит только свою бригаду и без сумм.
 */
interface EntriesSearch {
  q?: string | undefined;
}

export const Route = createFileRoute("/gas/entries")({
  validateSearch: (search: Record<string, unknown>): EntriesSearch => {
    const raw = search["q"];
    const q = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
    return { q: q.trim() ? q.trim().slice(0, 120) : undefined };
  },
  head: () =>
    completePageHead(
      { meta: [{ title: "Журнал записей времени — гайка" }] },
      "Журнал записей времени — гайка",
      "Все записи времени с поиском, фильтрами, статусами и историей изменений.",
    ),
  component: EntriesPage,
});

type StatusFilter = EntryStatus | "all";
type SourceFilter = "all" | "fact-report" | "mock";

const STATUS_TABS: StatusFilter[] = ["all", "pending", "confirmed", "clarify", "rejected", "draft"];

interface Row {
  id: string;
  view: EntryView;
  marks: Mark[];
}

function EntriesPage() {
  const actor = useGasActor();
  const directory = useGasDirectory();
  const desktop = useIsDesktop();
  const floatingBottom = useFloatingBottom();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q } = Route.useSearch();

  const [search, setSearch] = useState(q ?? "");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [brigade, setBrigade] = useState("all");
  const [day, setDay] = useState("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Поиск из шапки: новый запрос заменяет строку поиска экрана
  useEffect(() => setSearch(q ?? ""), [q]);

  const views = useGasEntries({
    brigadeId: brigade === "all" ? undefined : brigade,
    status: status === "all" ? undefined : status,
    day: day === "all" ? undefined : day,
    source: source === "all" ? undefined : source,
    search,
    ownBrigadeOnly: actor.role === "foreman",
  });

  const rows: Row[] = useMemo(
    () => views.map((view) => ({ id: view.entry.id, view, marks: marksOf(view) })),
    [views],
  );

  const extraFilters = Number(brigade !== "all") + Number(day !== "all") + Number(source !== "all");

  const reset = () => {
    setBrigade("all");
    setStatus("all");
    setDay("all");
    setSource("all");
    setSearch("");
    if (q) void navigate({ search: {}, replace: true });
  };

  /*
   * Колонок меньше, чем полей: смена и время, статус и признаки идут парами в одной ячейке.
   * Одиннадцать столбцов ломали числа на две строки, а читать таблицу нужно взглядом.
   */
  const columns: WidgetColumn<Row>[] = [
    {
      key: "number",
      header: "Номер и день",
      cell: ({ view }) => (
        <span className="whitespace-nowrap">
          <Num className="block">{view.entry.number}</Num>
          <Num className="block text-text-3">{fmtShortDay(view.entry.day)}</Num>
        </span>
      ),
    },
    {
      key: "object",
      header: "Объект и бригада",
      cell: ({ view }) => (
        <span className="block min-w-[220px]">
          <span className="block font-medium">{view.object?.label ?? "—"}</span>
          <span className="block text-text-3">
            {view.brigade?.name ?? "—"}
            {view.employee ? ` · ${view.employee.name}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "time",
      header: "Смена и время",
      align: "right",
      cell: ({ view }) => (
        <span className="block whitespace-nowrap">
          <Num className="block">{entryFrame(view) ?? "—"}</Num>
          <Num className="block text-text-3">
            {view.entry.minutes} мин · <HoursCell minutes={view.entry.minutes} />
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
            cell: ({ view }: Row) => (
              <span className="block whitespace-nowrap">
                <MoneyCell value={view.entry.amountRub} />
                <span className="block text-text-3">
                  <RateCell value={view.revenue} />
                </span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: "status",
      header: "Статус и признаки",
      cell: ({ view, marks }) => (
        <span className="flex flex-col items-start gap-1.5">
          <span className="flex items-center gap-2">
            <EntryStatusBadge status={view.entry.status} />
            <SourceMark source={view.entry.source} />
          </span>
          <MarkList marks={marks} />
        </span>
      ),
    },
  ];

  const current = useGasEntry(open);

  const filters = (
    <>
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
        label="День"
        value={day}
        onChange={setDay}
        options={[
          { value: "all", label: "Вся неделя" },
          ...directory.days.map((d) => ({ value: d, label: fmtShortDay(d) })),
        ]}
      />
      <Select
        label="Данные"
        value={source}
        onChange={(value) => setSource(value as SourceFilter)}
        options={[
          { value: "all", label: "Факт и демо" },
          { value: "fact-report", label: "Факт из отчёта" },
          { value: "mock", label: "Демо-сценарии" },
        ]}
      />
    </>
  );

  const panel = current ? (
    <ReviewPanel
      key={current.entry.id}
      view={current}
      layout={desktop ? "panel" : "sheet"}
      floatingBottom={floatingBottom}
      canDecide={false}
      showKeys={false}
      onConfirm={() => undefined}
      onDecide={() => Promise.resolve({ ok: true })}
      onCorrect={() => Promise.resolve({ ok: true })}
      onClose={() => setOpen(null)}
    />
  ) : null;

  return (
    <div className="min-w-0">
      <ScreenHint screen="entries" />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Поиск по журналу</span>
          <Search
            className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-text-3"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Номер, объект, бригада"
            className="h-12 w-full rounded-[14px] bg-surface ps-11 pe-11 text-[16px] text-text shadow-[var(--lift-1)] focus-ring lg:text-[15px]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                if (q) void navigate({ search: {}, replace: true });
              }}
              aria-label="Очистить поиск"
              className="absolute end-0 top-0 grid size-12 place-items-center rounded-full text-text-3 focus-ring is-hover:text-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </label>
        {desktop ? <div className="flex items-end gap-2">{filters}</div> : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          <div role="tablist" aria-label="Статус записи" className="seg">
            {STATUS_TABS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                onClick={() => setStatus(value)}
                className="seg-item focus-ring"
              >
                {value === "all" ? "Все" : ENTRY_STATUS_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
        {desktop ? null : (
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            className="relative inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-surface-2 px-4 text-[14px] font-medium text-text focus-ring press"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Фильтры
            {extraFilters > 0 ? (
              <span className="grid size-5 place-items-center rounded-full bg-pill text-[11px] text-pill-text tnum">
                {extraFilters}
              </span>
            ) : null}
          </button>
        )}
      </div>

      <div className="mt-4 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">
          {rows.length} {plural(rows.length, "запись", "записи", "записей")}
          <span className="font-normal text-text-3">
            {search || status !== "all" || extraFilters > 0 ? " по фильтрам" : " за неделю"}
          </span>
        </h2>
        {search || status !== "all" || extraFilters > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="min-h-12 rounded-full px-3 text-[14px] text-text-2 focus-ring is-hover:text-text"
          >
            Сбросить
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="card-v3 px-6 py-10 text-center">
          <h3 className="text-[17px] font-semibold">Ничего не найдено</h3>
          <p className="mx-auto mt-1 max-w-[340px] text-[14px] leading-5 text-text-2">
            Проверьте номер записи или адрес. Можно сбросить фильтры и увидеть всю неделю.
          </p>
          <button type="button" onClick={reset} className="pill-action mt-5 focus-ring press">
            Сбросить фильтры
          </button>
        </div>
      ) : desktop ? (
        <div className="card-v3 overflow-hidden px-2 py-1">
          <WidgetTable columns={columns} rows={rows} onRowClick={(row) => setOpen(row.id)} />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <QueueCard
                view={row.view}
                marks={row.marks}
                active={false}
                fresh={false}
                highlight={false}
                showStatus
                onOpen={() => setOpen(row.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {desktop ? (
        current ? (
          <SidePanel onClose={() => setOpen(null)}>{panel}</SidePanel>
        ) : null
      ) : (
        <PhoneSheet open={!!current} onClose={() => setOpen(null)} labelledBy="review-title">
          {panel}
        </PhoneSheet>
      )}

      <BottomSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Фильтры журнала">
        <div className="flex flex-col gap-3 pt-1">
          {filters}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="pill-action flex-1 focus-ring press"
            >
              Показать {rows.length}
            </button>
            <button
              type="button"
              onClick={() => {
                setBrigade("all");
                setDay("all");
                setSource("all");
              }}
              className="inline-flex min-h-14 items-center rounded-full bg-surface-2 px-5 text-[15px] font-medium focus-ring press"
            >
              Сбросить
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

/** Детали записи на десктопе: панель справа поверх журнала, Esc и щелчок мимо закрывают */
function SidePanel({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-[34] bg-[var(--overlay)] animate-in fade-in-0"
      />
      <aside
        role="dialog"
        aria-labelledby="review-title"
        className="card-v3 fixed top-4 right-4 bottom-4 z-[35] flex w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-[var(--r-2xl)] animate-in slide-in-from-right-8 fade-in-0 duration-300"
      >
        {children}
      </aside>
    </>
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
    <label className="block min-w-0 text-[13px] text-text-3">
      <span className="mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-12 w-full min-w-[150px] rounded-[14px] bg-surface px-4 text-[15px] text-text shadow-[var(--lift-1)] focus-ring",
          value !== "all" && "ring-1 ring-text/40",
        )}
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
