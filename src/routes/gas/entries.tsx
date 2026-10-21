import { completePageHead } from "@/lib/page-head";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, SearchX } from "lucide-react";
import { EntryStatusBadge, SourceMark } from "@/components/gas-ops/marks";
import { QueueCard } from "@/components/gas-ops/review/QueueCard";
import { fmtShortDay, marksOf, type Mark } from "@/components/gas-ops/review/rules";
import { Button } from "@/components/ui/button";
import { FiltersButton, SearchBar } from "@/components/ui/kit/controls";
import { CalendarSheet, FiltersSheet } from "@/components/ui/kit/sheet";
import { Chip } from "@/components/ui/kit/status";
import { DataTable, type TableColumn } from "@/components/ui/kit/data";
import { WeekStrip } from "@/components/ui/kit/date";
import { EmptyBlock } from "@/components/ui/kit/states";
import { ReviewPanel } from "@/components/gas-ops/review/ReviewPanel";
import { PhoneSheet } from "@/components/gas-ops/review/PhoneSheet";
import { useFloatingBottom, useIsDesktop, useIsWide } from "@/components/gas-ops/review/use-layout";
import { ScreenHint } from "@/components/gas-ops/page";
import {
  ENTRY_STATUS_LABEL,
  fmtHours,
  fmtRub,
  formatClock,
  useGasActor,
  useGasDirectory,
  useGasEntries,
  useGasEntry,
  useGasWeek,
  type EntryStatus,
  type EntryView,
} from "@/api/gas-ops";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Журнал записей времени (ADR-044; вид ADR-045, 5.6): всё, что заведено, с поиском, полосой
 * недели, календарём и фильтрами. Строка поиска в шапке ведёт сюда с `?q=`. Телефон: список
 * по дням с липким заголовком «Сб 03.10 · 18 записей · 312 450 ₽», фильтры в шторке.
 * Компьютер: таблица, деталь панелью справа. Бригадир видит только свою бригаду и без сумм.
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

const STATUSES: EntryStatus[] = ["pending", "confirmed", "clarify", "rejected", "draft"];
const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

interface Row {
  id: string;
  view: EntryView;
  marks: Mark[];
}

function EntriesPage() {
  const actor = useGasActor();
  const directory = useGasDirectory();
  const week = useGasWeek();
  const desktop = useIsDesktop();
  // С 768 деталь панелью справа, таблица с 1024 (ADR-045, V7)
  const wide = useIsWide();
  const floatingBottom = useFloatingBottom();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q } = Route.useSearch();

  const [search, setSearch] = useState(q ?? "");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [brigade, setBrigade] = useState("all");
  const [object, setObject] = useState("all");
  const [day, setDay] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Поиск из шапки: новый запрос заменяет строку поиска экрана
  useEffect(() => setSearch(q ?? ""), [q]);

  const views = useGasEntries({
    brigadeId: brigade === "all" ? undefined : brigade,
    status: status === "all" ? undefined : status,
    day: day ?? undefined,
    source: source === "all" ? undefined : source,
    search,
    ownBrigadeOnly: actor.role === "foreman",
  });

  const rows: Row[] = useMemo(
    () =>
      views
        .filter((view) => object === "all" || view.entry.objectId === object)
        .map((view) => ({ id: view.entry.id, view, marks: marksOf(view) })),
    [views, object],
  );

  // Список по дням: свежий день сверху, итог дня в липком заголовке
  const byDay = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const row of rows)
      groups.set(row.view.entry.day, [...(groups.get(row.view.entry.day) ?? []), row]);
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const active =
    Number(brigade !== "all") +
    Number(object !== "all") +
    Number(status !== "all") +
    Number(source !== "all");

  const resetFilters = () => {
    setBrigade("all");
    setObject("all");
    setStatus("all");
    setSource("all");
  };
  const reset = () => {
    resetFilters();
    setDay(null);
    setSearch("");
    if (q) void navigate({ search: {}, replace: true });
  };

  const days = week.days.map((d) => ({
    date: d,
    weekday: WEEKDAY[new Date(`${d}T00:00:00`).getDay()] ?? "",
    day: d.slice(8, 10),
  }));

  const brigadeName = (id: string) => directory.brigades.find((b) => b.id === id)?.name ?? id;
  const objectName = (id: string) => directory.objects.find((o) => o.id === id)?.label ?? id;

  /* Активные фильтры метками под поиском, крестик снимает (4.12) */
  const chips = [
    brigade !== "all"
      ? { key: "b", label: brigadeName(brigade), clear: () => setBrigade("all") }
      : null,
    object !== "all"
      ? { key: "o", label: objectName(object), clear: () => setObject("all") }
      : null,
    status !== "all"
      ? { key: "s", label: ENTRY_STATUS_LABEL[status], clear: () => setStatus("all") }
      : null,
    source !== "all"
      ? {
          key: "src",
          label: source === "fact-report" ? "Факт" : "Демо",
          clear: () => setSource("all"),
        }
      : null,
  ].filter((c): c is { key: string; label: string; clear: () => void } => !!c);

  const current = useGasEntry(open);

  const columns: TableColumn<Row>[] = [
    { key: "day", title: "Дата", cell: ({ view }) => fmtShortDay(view.entry.day) },
    { key: "number", title: "Номер", cell: ({ view }) => view.entry.number },
    { key: "brigade", title: "Бригада", cell: ({ view }) => view.brigade?.name ?? "—" },
    {
      key: "object",
      title: "Объект",
      cell: ({ view }) => (
        <span className="block max-w-[320px] truncate" title={view.object?.label}>
          {view.object?.label ?? "—"}
        </span>
      ),
    },
    {
      key: "start",
      title: "Начало",
      numeric: true,
      cell: ({ view }) =>
        view.entry.startMinutes === null ? "—" : formatClock(view.entry.startMinutes),
    },
    {
      key: "end",
      title: "Окончание",
      numeric: true,
      cell: ({ view }) =>
        view.entry.endMinutes === null ? "—" : formatClock(view.entry.endMinutes),
    },
    {
      key: "break",
      title: "Перерыв",
      numeric: true,
      cell: ({ view }) => (view.entry.breakMinutes ? `${view.entry.breakMinutes} мин` : "—"),
    },
    { key: "hours", title: "Часы", numeric: true, cell: ({ view }) => fmtHours(view.hours) },
    ...(actor.canSeeMoney
      ? [
          {
            key: "sum",
            title: "Сумма",
            numeric: true,
            cell: ({ view }: Row) =>
              view.entry.amountRub === null ? (
                <span className="text-text-3">нет суммы</span>
              ) : (
                fmtRub(view.entry.amountRub)
              ),
          },
        ]
      : []),
    {
      key: "status",
      title: "Статус",
      cell: ({ view }) => (
        <span className="inline-flex items-center gap-2">
          <EntryStatusBadge status={view.entry.status} />
          <SourceMark source={view.entry.source} />
        </span>
      ),
    },
  ];

  const panel = current ? (
    <ReviewPanel
      key={current.entry.id}
      view={current}
      layout={wide ? "panel" : "sheet"}
      floatingBottom={floatingBottom}
      canDecide={false}
      showKeys={false}
      onConfirm={() => undefined}
      onDecide={() => Promise.resolve({ ok: true })}
      onCorrect={() => Promise.resolve({ ok: true })}
      onClose={() => setOpen(null)}
    />
  ) : null;

  const option = (on: boolean, label: string, pick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={pick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-3 text-body focus-ring",
        on ? "border-orange-strong bg-orange-dim text-text" : "border-line-2 text-text-2",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="min-w-0">
      <ScreenHint screen="entries" />

      {/* Поиск липкий при прокрутке списка (4.12) */}
      <div className="sticky top-[calc(var(--topbar-h)+env(safe-area-inset-top))] z-20 -mx-gutter bg-void px-gutter pt-1 pb-2 lg:static lg:mx-0 lg:bg-transparent lg:px-0">
        <div className="flex items-center gap-2">
          <SearchBar
            className="min-w-0 flex-1"
            label="Поиск по журналу"
            placeholder="Номер, объект, бригада"
            value={search}
            onChange={(value) => {
              setSearch(value);
              if (!value && q) void navigate({ search: {}, replace: true });
            }}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Календарь"
            className="size-11 rounded-control"
            onClick={() => setCalendarOpen(true)}
          >
            <CalendarDays aria-hidden />
          </Button>
        </div>
        {chips.length ? (
          <ul className="mt-2 flex flex-wrap gap-1" aria-label="Активные фильтры">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Chip tone="neutral" onRemove={chip.clear}>
                  {chip.label}
                </Chip>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Полоса недели на всю ширину; повторное касание выбранного дня возвращает неделю */}
      <WeekStrip
        days={days}
        value={day}
        today={week.today}
        onChange={(next) => setDay(next === day ? null : next)}
        className="gap-0"
      />

      <div className="mt-block flex min-h-7 items-center justify-between gap-3">
        <p className="text-meta text-text-2 tnum">
          {rows.length} {plural(rows.length, "запись", "записи", "записей")}
          {search || active || day ? " по фильтрам" : " за неделю"}
        </p>
        <span className="flex items-center gap-1">
          {search || active || day ? (
            <Button variant="quiet" className="px-2" onClick={reset}>
              Сбросить
            </Button>
          ) : null}
          <FiltersButton active={active} onClick={() => setFiltersOpen(true)} />
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyBlock
          icon={SearchX}
          title={search ? `Ничего не найдено по «${search}»` : "Ничего не найдено"}
          text="Проверьте номер записи или адрес. Можно сбросить фильтры и увидеть всю неделю"
          action={
            <Button variant="outline" onClick={reset}>
              Сбросить поиск
            </Button>
          }
        />
      ) : desktop ? (
        <DataTable
          label="Журнал записей"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          activeKey={open}
          onRowClick={(row) => setOpen(row.id)}
        />
      ) : (
        <div className="flex flex-col gap-block">
          {byDay.map(([d, list]) => {
            const sum = list.reduce((acc, row) => acc + (row.view.entry.amountRub ?? 0), 0);
            return (
              <section key={d} aria-label={fmtShortDay(d)}>
                <h2 className="sticky top-[calc(var(--topbar-h)+env(safe-area-inset-top)+52px)] z-10 flex h-7 items-center bg-void text-meta text-text-3 tnum">
                  {fmtShortDay(d)} · {list.length}{" "}
                  {plural(list.length, "запись", "записи", "записей")}
                  {actor.canSeeMoney ? ` · ${fmtRub(sum)}` : ""}
                </h2>
                <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
                  {list.map((row) => (
                    <li key={row.id}>
                      <QueueCard
                        view={row.view}
                        marks={row.marks}
                        active={false}
                        fresh={false}
                        highlight={false}
                        showStatus
                        showNumber
                        onOpen={() => setOpen(row.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {wide ? (
        current ? (
          <SidePanel
            onClose={() => setOpen(null)}
            onStep={(delta) => {
              const index = rows.findIndex((row) => row.id === open);
              const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))];
              if (next) setOpen(next.id);
            }}
          >
            {panel}
          </SidePanel>
        ) : null
      ) : (
        <PhoneSheet open={!!current} onClose={() => setOpen(null)} labelledBy="review-title">
          {panel}
        </PhoneSheet>
      )}

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        count={rows.length}
        onReset={resetFilters}
      >
        <section>
          <h3 className="text-meta-strong text-text-2">Бригада</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(brigade === "all", "Все", () => setBrigade("all"))}
            {directory.brigades.map((b) =>
              option(brigade === b.id, b.name, () => setBrigade(b.id)),
            )}
          </div>
        </section>
        <section>
          <h3 className="text-meta-strong text-text-2">Статус</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(status === "all", "Все", () => setStatus("all"))}
            {STATUSES.map((value) =>
              option(status === value, ENTRY_STATUS_LABEL[value], () => setStatus(value)),
            )}
          </div>
        </section>
        <section>
          <h3 className="text-meta-strong text-text-2">Источник</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(source === "all", "Факт и демо", () => setSource("all"))}
            {option(source === "fact-report", "Факт", () => setSource("fact-report"))}
            {option(source === "mock", "Демо", () => setSource("mock"))}
          </div>
        </section>
        <section>
          <h3 className="text-meta-strong text-text-2">Объект</h3>
          <div className="mt-2 flex flex-col">
            {option(object === "all", "Все объекты", () => setObject("all"))}
            {directory.objects
              .slice(0, 40)
              .map((o) => option(object === o.id, o.label, () => setObject(o.id)))}
          </div>
        </section>
      </FiltersSheet>

      <CalendarSheet
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        value={day}
        today={week.today}
        onPick={setDay}
        onWeek={() => setDay(null)}
      />
    </div>
  );
}

/**
 * Деталь записи на компьютере и планшете: панель справа 420 поверх журнала (4.16).
 * Esc закрывает, стрелки вверх и вниз листают записи списка.
 */
function SidePanel({
  onClose,
  onStep,
  children,
}: {
  onClose: () => void;
  onStep: (delta: number) => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const target = event.target as HTMLElement | null;
        if (target?.closest("input, textarea, select")) return;
        event.preventDefault();
        onStep(event.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);
  return (
    <aside
      role="dialog"
      aria-labelledby="review-title"
      className="fixed inset-y-0 right-0 z-[35] flex w-[min(420px,100vw)] flex-col overflow-hidden border-s border-line bg-surface shadow-pop animate-in slide-in-from-right-8 fade-in-0 duration-[250ms]"
    >
      {children}
    </aside>
  );
}
