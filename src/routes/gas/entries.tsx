import { completePageHead } from "@/lib/page-head";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, MessageCircleQuestion, MoreHorizontal, SearchX } from "lucide-react";
import { QueueCard } from "@/components/gas-ops/review/QueueCard";
import { fmtShortDay, sumText } from "@/components/gas-ops/review/rules";
import { Button } from "@/components/ui/button";
import { FiltersButton, SearchBar } from "@/components/ui/kit/controls";
import { CalendarSheet, FiltersSheet } from "@/components/ui/kit/sheet";
import { Chip } from "@/components/ui/kit/status";
import { WeekStrip } from "@/components/ui/kit/date";
import { EmptyBlock } from "@/components/ui/kit/states";
import { ReviewPanel, type DecideResult } from "@/components/gas-ops/review/ReviewPanel";
import { PhoneSheet } from "@/components/gas-ops/review/PhoneSheet";
import { useFloatingBottom, useIsDesktop, useIsWide } from "@/components/gas-ops/review/use-layout";
import { JournalTable } from "@/components/gas-ops/journal/JournalTable";
import {
  DEFAULT_COLUMNS,
  type ColumnKey,
  type JournalRow,
} from "@/components/gas-ops/journal/columns";
import { BulkClarifyDialog } from "@/components/gas-ops/journal/bulk";
import { downloadJournalCsv } from "@/components/gas-ops/journal/csv";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CHANNEL_LABEL,
  ENTRY_STATUS_LABEL,
  INFO_KIND_LABEL,
  entryInfo,
  fmtRub,
  headcountOf,
  isClean,
  remarksOf,
  useGasActions,
  useGasActor,
  useGasDirectory,
  useGasEntries,
  useGasEntry,
  useGasWeek,
  type EntryChannel,
  type EntryStatus,
  type EntryView,
  type InfoKind,
} from "@/api/gas-ops";
import { plural } from "@/lib/format";
import { toast, toastUndo } from "@/lib/toast";

/**
 * «Журнал» (ADR-061, 10; раздел 4.4): плотная таблица по образцу «Ведомости работ» ПТО Онлайн.
 * Панель: поиск, период, фильтры, действия с выбранными (неактивны без выбора), «⋮» с выгрузкой
 * выбранных и настройкой колонок. Клик по строке открывает ту же деталь, что в «Проверке».
 * Телефон: список по дням с липким итогом дня, фильтры в шторке. Бригадир видит свою бригаду
 * без сумм. `?crew=none` — записи без состава (ссылка «Показать записи» у «не рассчитано»).
 */
interface EntriesSearch {
  q?: string | undefined;
  crew?: "none" | undefined;
}

export const Route = createFileRoute("/gas/entries")({
  validateSearch: (search: Record<string, unknown>): EntriesSearch => {
    const raw = search["q"];
    const q = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
    return {
      q: q.trim() ? q.trim().slice(0, 120) : undefined,
      crew: search["crew"] === "none" ? "none" : undefined,
    };
  },
  head: () =>
    completePageHead(
      { meta: [{ title: "Журнал записей времени · гайка" }] },
      "Журнал записей времени · гайка",
      "Все записи времени с поиском, фильтрами, статусами и историей изменений.",
    ),
  component: EntriesPage,
});

type StatusFilter = EntryStatus | "all";
type SourceFilter = "all" | "fact-report" | "mock";
type KindFilter = InfoKind | "clean" | "all";
type ChannelFilter = EntryChannel | "all";

const STATUSES: EntryStatus[] = ["pending", "confirmed", "clarify", "rejected", "draft"];
const CHANNELS: EntryChannel[] = ["web", "bot", "manager", "import"];
const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Записи, которые можно принять или вернуть: ещё не решённые */
const OPEN_STATUSES = new Set<EntryStatus>(["pending", "clarify"]);

function channelOf(view: EntryView): EntryChannel | null {
  return view.entry.channel ?? (view.entry.source === "fact-report" ? "import" : null);
}

function EntriesPage() {
  const actor = useGasActor();
  const actions = useGasActions();
  const directory = useGasDirectory();
  const week = useGasWeek();
  const desktop = useIsDesktop();
  // С 768 деталь панелью справа, таблица с 1024 (ADR-045, V7)
  const wide = useIsWide();
  const floatingBottom = useFloatingBottom();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q, crew } = Route.useSearch();

  const [search, setSearch] = useState(q ?? "");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [brigade, setBrigade] = useState("all");
  const [object, setObject] = useState("all");
  const [day, setDay] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [noCrew, setNoCrew] = useState(crew === "none");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [clarifyOpen, setClarifyOpen] = useState(false);

  // Поиск из шапки: новый запрос заменяет строку поиска экрана
  useEffect(() => setSearch(q ?? ""), [q]);
  useEffect(() => setNoCrew(crew === "none"), [crew]);

  const views = useGasEntries({
    brigadeId: brigade === "all" ? undefined : brigade,
    status: status === "all" ? undefined : status,
    day: day ?? undefined,
    source: source === "all" ? undefined : source,
    search,
    ownBrigadeOnly: actor.role === "foreman",
  });

  const rows: JournalRow[] = useMemo(
    () =>
      views
        .filter((view) => object === "all" || view.entry.objectId === object)
        .filter((view) => channel === "all" || channelOf(view) === channel)
        .filter((view) => !noCrew || headcountOf(view.entry) === null)
        .map((view) => {
          const info = entryInfo(view);
          return { id: view.entry.id, view, remarks: remarksOf(info), clean: isClean(info) };
        })
        .filter((row) =>
          kind === "all"
            ? true
            : kind === "clean"
              ? row.clean
              : row.remarks.some((r) => r.kind === kind),
        )
        .sort(
          (a, b) =>
            b.view.entry.day.localeCompare(a.view.entry.day) ||
            b.view.entry.number.localeCompare(a.view.entry.number),
        ),
    [views, object, channel, noCrew, kind],
  );

  // Фильтр поменялся — с первой страницы; выбор из исчезнувших строк снимаем
  useEffect(() => setPage(0), [rows.length, pageSize]);
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows]);

  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  // Список по дням для телефона: свежий день сверху, итог дня в липком заголовке
  const byDay = useMemo(() => {
    const groups = new Map<string, JournalRow[]>();
    for (const row of rows)
      groups.set(row.view.entry.day, [...(groups.get(row.view.entry.day) ?? []), row]);
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const active =
    Number(brigade !== "all") +
    Number(object !== "all") +
    Number(status !== "all") +
    Number(source !== "all") +
    Number(kind !== "all") +
    Number(channel !== "all") +
    Number(noCrew);

  const resetFilters = () => {
    setBrigade("all");
    setObject("all");
    setStatus("all");
    setSource("all");
    setKind("all");
    setChannel("all");
    setNoCrew(false);
    if (crew) void navigate({ search: (prev) => ({ ...prev, crew: undefined }), replace: true });
  };
  const reset = () => {
    resetFilters();
    setDay(null);
    setSearch("");
    if (q || crew) void navigate({ search: {}, replace: true });
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
    kind !== "all"
      ? {
          key: "k",
          label: kind === "clean" ? "Без замечаний" : INFO_KIND_LABEL[kind],
          clear: () => setKind("all"),
        }
      : null,
    channel !== "all"
      ? { key: "c", label: CHANNEL_LABEL[channel], clear: () => setChannel("all") }
      : null,
    noCrew
      ? {
          key: "crew",
          label: "Без состава",
          clear: () => {
            setNoCrew(false);
            if (crew)
              void navigate({ search: (prev) => ({ ...prev, crew: undefined }), replace: true });
          },
        }
      : null,
  ].filter((c): c is { key: string; label: string; clear: () => void } => !!c);

  const current = useGasEntry(open);

  /* ---------- Решения из детали: те же действия, что в «Проверке» ---------- */
  const decide = useCallback(
    async (
      view: EntryView,
      action: "confirm" | "reject" | "clarify",
      comment?: string,
    ): Promise<DecideResult> => {
      const result = await actions.review({ id: view.entry.id, action, comment });
      if (!result.ok) {
        toast.error(result.message);
        return { ok: false, message: result.message };
      }
      const text =
        action === "confirm"
          ? "Принято"
          : action === "reject"
            ? "Отклонено"
            : "Возвращено на уточнение";
      toastUndo(text, () => void actions.undoReview(view.entry.id), view.entry.number);
      return { ok: true };
    },
    [actions],
  );

  /* ---------- Действия с выбранными ---------- */
  const chosen = rows.filter((row) => selected.has(row.id));
  const decidable = chosen.filter((row) => OPEN_STATUSES.has(row.view.entry.status));
  const select = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const bulk = async (action: "confirm" | "clarify", comment?: string) => {
    const done: string[] = [];
    let failed: string | null = null;
    for (const row of decidable) {
      const result = await actions.review({ id: row.id, action, comment });
      if (result.ok) done.push(row.id);
      else failed ??= `${row.view.entry.number}: ${result.message}`;
    }
    if (failed) toast.error(failed);
    if (!done.length) return;
    const sum = decidable
      .filter((row) => done.includes(row.id))
      .reduce((acc, row) => acc + (row.view.entry.amountRub ?? 0), 0);
    toastUndo(
      `${action === "confirm" ? "Принято" : "На уточнении"} ${done.length} ${plural(done.length, "запись", "записи", "записей")}`,
      () => {
        void (async () => {
          for (const id of done) await actions.undoReview(id);
        })();
      },
      action === "confirm" && actor.canSeeMoney ? `на ${fmtRub(sum)}` : undefined,
    );
    setSelected(new Set());
  };

  const panel = current ? (
    <ReviewPanel
      key={current.entry.id}
      view={current}
      layout={wide ? "panel" : "sheet"}
      floatingBottom={floatingBottom}
      canDecide={actor.canReview}
      onConfirm={() => void decide(current, "confirm")}
      onDecide={(action, comment) => decide(current, action, comment)}
      onCorrect={async (input) => {
        const result = await actions.updateEntry({ id: current.entry.id, ...input });
        if (!result.ok) return { ok: false, message: result.message };
        toast.success("Исправлено", {
          description: `${current.entry.number}: изменение и причина записаны в историю.`,
        });
        return { ok: true };
      }}
      onClose={() => setOpen(null)}
    />
  ) : null;

  const option = (on: boolean, label: string, pick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={pick}
      className={`inline-flex min-h-11 items-center rounded-full border px-3 text-body focus-ring ${
        on ? "border-orange-strong bg-orange-dim text-text" : "border-line-2 text-text-2"
      }`}
    >
      {label}
    </button>
  );

  const period = day
    ? fmtShortDay(day)
    : `Неделя ${fmtShortDay(week.from).slice(3)}–${fmtShortDay(week.to).slice(3)}`;

  const chipList = chips.length ? (
    <ul className="mt-2 flex flex-wrap gap-1" aria-label="Активные фильтры">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Chip tone="neutral" onRemove={chip.clear}>
            {chip.label}
          </Chip>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className="min-w-0">
      {desktop ? (
        /* Панель таблицы по образцу ПТО Онлайн (2.2): поиск, период, фильтры, действия, «⋮» */
        <div className="mb-3">
          <div
            role="toolbar"
            aria-label="Панель журнала"
            className="flex flex-wrap items-center gap-2"
          >
            <SearchBar
              className="w-[260px] [&_input]:h-segment"
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
              onClick={() => setCalendarOpen(true)}
              aria-label={`Период: ${period}`}
            >
              <CalendarDays aria-hidden />
              {period}
            </Button>
            <FiltersButton active={active} onClick={() => setFiltersOpen(true)} />
            {search || active || day ? (
              <Button variant="quiet" className="px-2" onClick={reset}>
                Сбросить
              </Button>
            ) : null}
            <span className="mx-1 h-chip w-px bg-line" aria-hidden />
            {actor.canReview ? (
              <>
                <Button
                  variant="outline"
                  disabled={decidable.length === 0}
                  onClick={() => void bulk("confirm")}
                >
                  <Check aria-hidden />
                  Принять{decidable.length ? ` ${decidable.length}` : ""}
                </Button>
                <Button
                  variant="outline"
                  disabled={decidable.length === 0}
                  onClick={() => setClarifyOpen(true)}
                >
                  <MessageCircleQuestion aria-hidden />
                  На уточнение
                </Button>
              </>
            ) : null}
            <span className="text-meta text-text-3 tnum" aria-live="polite">
              {chosen.length
                ? `Выбрано ${chosen.length}${decidable.length !== chosen.length ? `, решить можно ${decidable.length}` : ""}`
                : ""}
            </span>
            <span className="ms-auto flex items-center gap-1">
              <span className="text-meta text-text-2 tnum">
                {rows.length} {plural(rows.length, "запись", "записи", "записей")}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Ещё действия журнала"
                  className="grid size-[36px] place-items-center rounded-control border border-line-2 bg-surface text-text focus-ring is-hover:bg-surface-2"
                >
                  <MoreHorizontal className="size-5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px]">
                  <DropdownMenuItem
                    disabled={chosen.length === 0}
                    onSelect={() => downloadJournalCsv(chosen, actor.canSeeMoney)}
                  >
                    Выгрузить выбранные
                  </DropdownMenuItem>
                  {/* Открывает шестерёнку в шапке таблицы, когда меню закроется и вернёт фокус */}
                  <DropdownMenuItem
                    onSelect={() => window.setTimeout(() => setColumnsOpen(true), 0)}
                  >
                    Настроить колонки
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
          {chipList}
        </div>
      ) : (
        <>
          {/* Поиск липкий при прокрутке списка (4.12) */}
          <div className="sticky top-[calc(var(--topbar-h)+env(safe-area-inset-top))] z-20 -mx-gutter bg-void px-gutter pt-1 pb-2">
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
            {chipList}
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
        </>
      )}

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
        <JournalTable
          rows={pageRows}
          visible={columns}
          onVisible={setColumns}
          columnsOpen={columnsOpen}
          onColumnsOpen={setColumnsOpen}
          money={actor.canSeeMoney}
          selected={selected}
          onSelect={select}
          activeId={open}
          onOpen={setOpen}
          pageSize={pageSize}
          onPageSize={setPageSize}
          page={page}
          onPage={setPage}
          total={rows.length}
        />
      ) : (
        <div className="flex flex-col gap-block">
          {byDay.map(([d, list]) => {
            return (
              <section key={d} aria-label={fmtShortDay(d)}>
                <h2 className="sticky top-[calc(var(--topbar-h)+env(safe-area-inset-top)+52px)] z-10 flex h-7 items-center bg-void text-meta text-text-3 tnum">
                  {fmtShortDay(d)} · {list.length}{" "}
                  {plural(list.length, "запись", "записи", "записей")}
                  {actor.canSeeMoney ? ` · ${sumText(list.map((row) => row.view))}` : ""}
                </h2>
                <ul className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
                  {list.map((row) => (
                    <li key={row.id}>
                      <QueueCard
                        view={row.view}
                        remarks={row.remarks}
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

      <BulkClarifyDialog
        open={clarifyOpen}
        count={decidable.length}
        onOpenChange={setClarifyOpen}
        onSubmit={async (comment) => {
          await bulk("clarify", comment);
          setClarifyOpen(false);
        }}
      />

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        count={rows.length}
        onReset={resetFilters}
      >
        <section>
          <h3 className="text-meta-strong text-text-2">Замечание</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(kind === "all", "Все", () => setKind("all"))}
            {(["error", "suspicion", "finance"] as const).map((value) =>
              option(kind === value, INFO_KIND_LABEL[value], () => setKind(value)),
            )}
            {option(kind === "clean", "Без замечаний", () => setKind("clean"))}
            {option(noCrew, "Без состава", () => setNoCrew(!noCrew))}
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
          <h3 className="text-meta-strong text-text-2">Бригада</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(brigade === "all", "Все", () => setBrigade("all"))}
            {directory.brigades.map((b) =>
              option(brigade === b.id, b.name, () => setBrigade(b.id)),
            )}
          </div>
        </section>
        <section>
          <h3 className="text-meta-strong text-text-2">Канал</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {option(channel === "all", "Все", () => setChannel("all"))}
            {CHANNELS.map((value) =>
              option(channel === value, CHANNEL_LABEL[value], () => setChannel(value)),
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
 * Esc закрывает (если форма причины не открыта), стрелки вверх и вниз листают записи.
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
      if (event.defaultPrevented) return;
      // Открыто окно сравнения или меню: Esc закрывает их, а не панель
      if (document.querySelector("[role='dialog'][data-state='open'], [role='menu']")) return;
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
