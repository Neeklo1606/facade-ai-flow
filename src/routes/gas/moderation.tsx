import { completePageHead } from "@/lib/page-head";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCheck, ClipboardCheck, Inbox } from "lucide-react";
import { ModeSuggestion } from "@/components/gas-ops/review/ModeSuggestion";
import { QueueCard } from "@/components/gas-ops/review/QueueCard";
import { ReviewSummary } from "@/components/gas-ops/review/ReviewSummary";
import {
  ReviewPanel,
  type CorrectInput,
  type DecideResult,
} from "@/components/gas-ops/review/ReviewPanel";
import { PhoneSheet } from "@/components/gas-ops/review/PhoneSheet";
import { StatusPills } from "@/components/gas-ops/review/remarks";
import { useFloatingBottom, useIsDesktop, useIsWide } from "@/components/gas-ops/review/use-layout";
import { ScreenActions, ScreenCounters } from "@/components/gas-ops/shell/screen-header";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/kit/controls";
import { FilterChip, FilterRow } from "@/components/gas-ops/filters/FilterChip";
import { EmptyBlock } from "@/components/ui/kit/states";
import {
  costBreakdown,
  entryInfo,
  fmtRub,
  infoCounts,
  INFO_KIND_LABEL,
  isClean,
  remarksOf,
  useGasActions,
  useGasActor,
  useGasAudit,
  useGasDirectory,
  useGasEntry,
  useGasQueue,
  useGasQueueCounts,
  useGasUsers,
  type EntryStatus,
  type EntryView,
  type InfoKind,
  type Remark,
} from "@/api/gas-ops";
import { plural } from "@/lib/format";
import { toast, toastUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useBottomLayer } from "@/lib/ui/bottom-layers";

/**
 * «Проверка» (ADR-061, 10; раздел 4.3): очередь слева 60%, решение справа 40%. Шапка — главная
 * кнопка «Принять N без замечаний» и фильтры в месте действий оболочки, строка счётчиков —
 * таблетки статусов и счётчики типов сведений. Карточек показателей нет: экран начинается
 * со списка. После решения открывается следующая запись, фильтры и позиция остаются.
 * Клавиши на компьютере: J и K по списку, Enter принимает, Esc закрывает форму и лист.
 */
type Tab = Extract<EntryStatus, "pending" | "clarify" | "confirmed"> | "all";
type KindFilter = InfoKind | "clean" | "all";

interface ModerationSearch {
  open?: string | undefined;
  tour?: string | undefined;
}

export const Route = createFileRoute("/gas/moderation")({
  validateSearch: (search: Record<string, unknown>): ModerationSearch => ({
    open: typeof search["open"] === "string" && search["open"] ? search["open"] : undefined,
    tour: typeof search["tour"] === "string" && search["tour"] ? search["tour"] : undefined,
  }),
  head: () =>
    completePageHead(
      { meta: [{ title: "Проверка записей времени · гайка" }] },
      "Проверка записей времени · гайка",
      "Очередь проверки: принять, исправить с причиной, вернуть на уточнение.",
    ),
  component: ModerationPage,
});

/** Таблетки статусов по образцу ПТО Онлайн (4.3): новые, на уточнении, принятые, все */
const TABS: Tab[] = ["pending", "clarify", "confirmed", "all"];

const TAB_LABEL: Record<Tab, string> = {
  pending: "Новые",
  clarify: "На уточнении",
  confirmed: "Принятые",
  all: "Все",
};

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "Все замечания" },
  { value: "error", label: INFO_KIND_LABEL.error },
  { value: "suspicion", label: INFO_KIND_LABEL.suspicion },
  { value: "finance", label: INFO_KIND_LABEL.finance },
  { value: "clean", label: "Без замечаний" },
];

const DONE_TEXT = {
  confirm: "Принято",
  reject: "Отклонено",
  clarify: "Возвращено на уточнение",
} as const;

interface Item {
  view: EntryView;
  remarks: Remark[];
  clean: boolean;
  fresh: boolean;
}

function ModerationPage() {
  const actor = useGasActor();
  const actions = useGasActions();
  const desktop = useIsDesktop();
  // С 768 список и деталь рядом (ADR-045, V7), клавиши J, K, Enter только на компьютере
  const wide = useIsWide();
  const floatingBottom = useFloatingBottom();
  const directory = useGasDirectory();
  const { open: openParam } = Route.useSearch();

  const [tab, setTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [objectId, setObjectId] = useState("all");
  const [brigadeId, setBrigadeId] = useState("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");

  const counts = useGasQueueCounts();
  const rows = useGasQueue(tab);
  const pendingRows = useGasQueue("pending");
  const info = useMemo(() => infoCounts(pendingRows), [pendingRows]);
  const users = useGasUsers();
  // Пустая очередь называет время последнего изменения отчёта (финальный промт, 2.3)
  const lastChange = useGasAudit()[0]?.at.slice(11, 16) ?? null;
  const userIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);

  /*
   * Очередь одним списком: записи с замечаниями выше, без замечаний ниже (4.3). Внутри —
   * свежие записи бригадиров первыми: их автор человек из списка входа, а не строка выгрузки.
   */
  const ordered = useMemo(() => {
    const text = search.trim().toLowerCase();
    const items: Item[] = rows
      .filter((view) => objectId === "all" || view.entry.objectId === objectId)
      .filter((view) => brigadeId === "all" || view.entry.brigadeId === brigadeId)
      .filter((view) =>
        text
          ? [view.object?.label, view.brigade?.name, view.entry.number, view.author]
              .filter((value): value is string => !!value)
              .some((value) => value.toLowerCase().includes(text))
          : true,
      )
      .map((view) => {
        const entryRemarks = entryInfo(view);
        return {
          view,
          remarks: remarksOf(entryRemarks),
          clean: isClean(entryRemarks),
          fresh: view.entry.source === "mock" && userIds.has(view.entry.createdBy),
        };
      })
      .filter((item) =>
        kind === "all"
          ? true
          : kind === "clean"
            ? item.clean
            : item.remarks.some((r) => r.kind === kind),
      );
    return items.sort(
      (a, b) => Number(a.clean) - Number(b.clean) || Number(b.fresh) - Number(a.fresh),
    );
  }, [rows, objectId, brigadeId, kind, search, userIds]);

  const clean = useMemo(
    () => ordered.filter((item) => item.clean && item.view.entry.status === "pending"),
    [ordered],
  );

  const currentId = wide
    ? (ordered.find((item) => item.view.entry.id === selected)?.view.entry.id ??
      ordered[0]?.view.entry.id ??
      null)
    : sheetOpen
      ? selected
      : null;
  const current = useMemo(
    () => ordered.find((item) => item.view.entry.id === currentId)?.view ?? null,
    [currentId, ordered],
  );

  const cards = useRef(new Map<string, HTMLButtonElement>());

  /* ---------- ?open=<id>: открыть и подсветить запись (тур, ссылки) ---------- */
  const handledOpen = useRef<string | null>(null);
  const opened = useGasEntry(openParam ?? null);
  const openStatus = opened?.entry.status ?? null;
  useEffect(() => {
    if (!openParam || !openStatus || handledOpen.current === openParam) return;
    handledOpen.current = openParam;
    setTab((TABS as string[]).includes(openStatus) ? (openStatus as Tab) : "all");
    setSelected(openParam);
    setSheetOpen(true);
    setHighlight(openParam);
    const timer = window.setTimeout(() => setHighlight(null), 4000);
    window.setTimeout(() => {
      cards.current.get(openParam)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [openParam, openStatus]);

  /** Следующая запись после решения: ниже по списку, иначе выше */
  const nextAfter = useCallback(
    (id: string): string | null => {
      const index = ordered.findIndex((item) => item.view.entry.id === id);
      const next = ordered[index + 1] ?? ordered[index - 1];
      return next?.view.entry.id ?? null;
    },
    [ordered],
  );

  const undo = useCallback(
    async (id: string) => {
      const result = await actions.undoReview(id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSelected(id);
    },
    [actions],
  );

  const decide = useCallback(
    async (
      view: EntryView,
      action: "confirm" | "reject" | "clarify",
      comment?: string,
    ): Promise<DecideResult> => {
      const id = view.entry.id;
      const next = nextAfter(id);
      const result = await actions.review({ id, action, comment });
      if (!result.ok) {
        toast.error(result.message);
        return { ok: false, message: result.message };
      }
      toastUndo(
        DONE_TEXT[action],
        () => void undo(id),
        `${view.entry.number}, ${view.object?.label ?? ""}`,
      );
      // Решённая запись уходит из таблетки: открываем следующую, фильтры не трогаем
      if (tab !== "all") {
        setSelected(next);
        if (!next) setSheetOpen(false);
      }
      return { ok: true };
    },
    [actions, nextAfter, tab, undo],
  );

  const correct = useCallback(
    async (view: EntryView, input: CorrectInput): Promise<DecideResult> => {
      const result = await actions.updateEntry({ id: view.entry.id, ...input });
      if (!result.ok) return { ok: false, message: result.message };
      toast.success("Исправлено", {
        description: `${view.entry.number}: изменение и причина записаны в историю. Теперь запись можно принять.`,
      });
      return { ok: true };
    },
    [actions],
  );

  /*
   * «Принять N без замечаний» выполняется сразу, без диалога (ADR-045, принцип 8): действие
   * обратимое, отмена в тосте 6 секунд. Только записи без ошибок данных и подозрений.
   */
  const confirmClean = async () => {
    const list = clean;
    const sum = list.reduce((acc, item) => acc + (costBreakdown(item.view).amountRub ?? 0), 0);
    const done: string[] = [];
    for (const item of list) {
      const result = await actions.review({ id: item.view.entry.id, action: "confirm" });
      if (result.ok) done.push(item.view.entry.id);
    }
    if (done.length === 0) {
      toast.error("Не получилось принять записи. Повторите.");
      return;
    }
    toastUndo(
      `Принято ${done.length} ${plural(done.length, "запись", "записи", "записей")} на ${fmtRub(sum)}`,
      () => {
        void (async () => {
          for (const id of done) await actions.undoReview(id);
        })();
      },
      "Записи без замечаний ушли в недельный отчёт",
    );
    if (currentId && done.includes(currentId)) setSelected(null);
  };

  /* ---------- Клавиши на компьютере: J и K по списку, Enter принимает ---------- */
  useEffect(() => {
    if (!actor.canReview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      // Esc закрывает форму причины (ReviewPanel) и лист на телефоне (PhoneSheet)
      if (!desktop) return;
      if (document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']")) return;
      if (document.getElementById("reason-title")) return;
      const index = ordered.findIndex((item) => item.view.entry.id === currentId);
      if (event.code === "KeyJ" || event.code === "KeyK") {
        event.preventDefault();
        const step = event.code === "KeyJ" ? 1 : -1;
        const next = ordered[Math.min(ordered.length - 1, Math.max(0, index + step))];
        if (!next) return;
        setSelected(next.view.entry.id);
        cards.current.get(next.view.entry.id)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.key === "Enter" && current) {
        // Enter на чужой кнопке делает своё; на строке открытой записи — принимает
        const card = target?.closest("[data-queue-card]");
        if (
          target?.closest("button, a") &&
          card?.getAttribute("data-queue-card") !== current.entry.id
        )
          return;
        if (current.entry.status === "confirmed") return;
        event.preventDefault();
        void decide(current, "confirm");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, actor.canReview, ordered, currentId, current, decide]);

  if (!actor.canReview) {
    return (
      <div className="card-v3 mx-auto mt-6 max-w-[520px] p-6 text-center">
        <ClipboardCheck className="mx-auto size-8 text-text-3" aria-hidden />
        <h2 className="mt-3 text-[18px] font-semibold">Проверку ведёт менеджер</h2>
        <p className="mt-1 text-[14px] leading-5 text-text-2">
          Войдите как менеджер проверки или администратор, чтобы работать с очередью.
        </p>
      </div>
    );
  }

  const openEntry = (id: string) => {
    setSelected(id);
    setSheetOpen(true);
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
      onUndoAuto={() =>
        void actions
          .undoAutoAccept(current.entry.id)
          .then((result) =>
            result.ok
              ? toast.success(`${current.entry.number} снова в очереди проверки`)
              : toast.error(result.message),
          )
      }
      onCorrect={(input) => correct(current, input)}
      {...(wide ? {} : { onClose: () => setSheetOpen(false) })}
    />
  ) : null;

  const activeFilters =
    Number(objectId !== "all") + Number(brigadeId !== "all") + Number(kind !== "all");
  const resetFilters = () => {
    setObjectId("all");
    setBrigadeId("all");
    setKind("all");
  };

  // Объекты и бригады только те, что есть в очереди: длинный справочник тут не нужен
  const queueObjects = [...new Map(rows.map((v) => [v.entry.objectId, v.object])).entries()];
  const queueBrigades = [...new Map(rows.map((v) => [v.entry.brigadeId, v.brigade])).entries()];
  const objectName = (id: string) => directory.objects.find((o) => o.id === id)?.label ?? "Объект";

  // Счётчики типов не складываются: у одной записи может быть и подозрение, и финансы (2.3)
  const counters = [
    `${counts.pending} ${plural(counts.pending, "новая", "новые", "новых")}`,
    info.errors ? `${info.errors} с ошибкой данных` : null,
    info.suspicions ? `${info.suspicions} с подозрением` : null,
    info.finance ? `${info.finance} без полной стоимости` : null,
    counts.clarify ? `${counts.clarify} на уточнении` : null,
  ].filter((part): part is string => !!part);

  const bulk = (
    <Button
      data-tour="review-accept-clean"
      onClick={() => void confirmClean()}
      disabled={tab !== "pending" || clean.length === 0}
      className={cn("max-lg:h-12 max-lg:w-full")}
    >
      <CheckCheck aria-hidden />
      Принять {clean.length} без замечаний
    </Button>
  );

  const stickyBulk = !desktop && tab === "pending" && clean.length > 0;

  const count = (key: (v: (typeof rows)[number]) => string) => {
    const map = new Map<string, number>();
    for (const v of rows) map.set(key(v), (map.get(key(v)) ?? 0) + 1);
    return map;
  };
  const byObject = count((v) => v.entry.objectId);
  const byBrigade = count((v) => v.entry.brigadeId);
  const filters = (compact: boolean) => (
    <FilterRow active={activeFilters} onReset={resetFilters}>
      <FilterChip
        label="Тип замечания"
        compact={compact}
        allLabel="Все замечания"
        value={kind}
        onChange={(value) => setKind(value as KindFilter)}
        options={KIND_OPTIONS.filter((o) => o.value !== "all")}
      />
      <FilterChip
        label="Бригада"
        compact={compact}
        allLabel="Все бригады"
        value={brigadeId}
        onChange={setBrigadeId}
        options={queueBrigades.map(([id, brigade]) => ({
          value: id,
          label: brigade?.name ?? id,
          hint: String(byBrigade.get(id) ?? 0),
        }))}
      />
      <FilterChip
        label="Объект"
        compact={compact}
        allLabel="Все объекты"
        value={objectId}
        onChange={setObjectId}
        options={queueObjects.map(([id, object]) => ({
          value: id,
          label: object?.label ?? objectName(id),
          hint: object?.code ?? String(byObject.get(id) ?? 0),
        }))}
      />
    </FilterRow>
  );

  return (
    <div className="min-w-0">
      <ScreenActions>
        {desktop ? (
          <>
            {filters(true)}
            <SearchBar
              className="w-[200px] [&_input]:h-control-sm"
              label="Поиск в очереди"
              placeholder="Номер, объект, бригада"
              value={search}
              onChange={setSearch}
            />
          </>
        ) : null}
        {stickyBulk ? null : bulk}
      </ScreenActions>

      {/*
       * Телефон (PROMPT_UX_FINAL 3.2, ADR-068): «Принять N без замечаний» липкой кнопкой над
       * нижней панелью, пока в очереди есть что принять. Слой регистрирует высоту, и
       * последняя карточка очереди не уходит под кнопку
       */}
      {stickyBulk ? <StickyBulk>{bulk}</StickyBulk> : null}

      <ModeSuggestion />

      {/* Пока очередь не пуста, счётчики в строке над ней: очередь сразу под шапкой */}
      {tab === "pending" && counts.pending === 0 ? (
        <ReviewSummary
          clarify={counts.clarify}
          confirmed={counts.confirmed}
          lastChange={lastChange}
        />
      ) : null}

      <ScreenCounters>
        <div
          className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"
          data-tour="review-tabs"
        >
          <StatusPills
            label="Статус записи"
            value={tab}
            onChange={(value) => {
              setTab(value);
              setSelected(null);
              setSheetOpen(false);
            }}
            options={TABS.map((value) => ({
              value,
              label: TAB_LABEL[value],
              count:
                value === "all"
                  ? counts.pending +
                    counts.clarify +
                    counts.confirmed +
                    counts.rejected +
                    counts.draft
                  : counts[value],
            }))}
          />
          <p className="min-w-0 text-meta text-text-2" data-testid="queue-summary">
            {counters.join(" · ")}
          </p>
        </div>
      </ScreenCounters>

      {desktop ? null : (
        <div className="mb-3 flex items-center gap-2">
          <SearchBar
            className="min-w-0 flex-1"
            label="Поиск в очереди"
            placeholder="Номер, объект, бригада"
            value={search}
            onChange={setSearch}
          />
        </div>
      )}
      {desktop ? null : <div className="mb-3">{filters(false)}</div>}

      <div className="grid min-w-0 gap-section md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
        <div className="min-w-0">
          {ordered.length === 0 ? (
            <EmptyBlock
              icon={tab === "pending" && !activeFilters && !search ? CheckCheck : Inbox}
              title={
                activeFilters || search
                  ? "По фильтрам ничего нет"
                  : tab === "pending"
                    ? lastChange
                      ? `Всё проверено, отчёт обновлён в ${lastChange}`
                      : "Всё проверено"
                    : "Здесь пусто"
              }
              text={
                activeFilters || search
                  ? "Сбросьте фильтры или поиск, чтобы увидеть всю очередь"
                  : tab === "pending"
                    ? "Новые записи бригадиров появятся здесь"
                    : "В этом состоянии записей нет"
              }
              action={
                activeFilters || search ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetFilters();
                      setSearch("");
                    }}
                  >
                    Сбросить фильтры
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link to="/gas/entries">Открыть журнал</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ul
              aria-label="Очередь проверки"
              data-tour="review-queue"
              className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line"
            >
              {ordered.map((item) => {
                const id = item.view.entry.id;
                return (
                  <li key={id}>
                    <QueueCard
                      ref={(node) => {
                        if (node) cards.current.set(id, node);
                        else cards.current.delete(id);
                      }}
                      view={item.view}
                      remarks={item.remarks}
                      fresh={item.fresh}
                      active={wide && currentId === id}
                      highlight={highlight === id}
                      showStatus={tab === "all"}
                      onOpen={() => openEntry(id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {wide ? (
          <aside
            aria-labelledby={current ? "review-title" : undefined}
            aria-label={current ? undefined : "Детали записи"}
            className="surface-1 sticky top-20 flex flex-col overflow-hidden"
            // Высота ровно до низа экрана: детали прокручиваются внутри, кнопки решения видны
            style={{ height: `calc(100dvh - 104px - ${Math.max(0, floatingBottom - 8)}px)` }}
          >
            {panel ?? (
              <p className="px-6 py-10 text-center text-body text-text-2">
                Выберите запись слева, чтобы увидеть, что ввёл бригадир и что посчитала система.
              </p>
            )}
          </aside>
        ) : null}
      </div>

      {wide ? null : (
        <PhoneSheet
          open={sheetOpen && !!current}
          onClose={() => setSheetOpen(false)}
          labelledBy="review-title"
        >
          {panel}
        </PhoneSheet>
      )}
    </div>
  );
}

/** Липкая панель массового действия над нижней панелью телефона */
function StickyBulk({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useBottomLayer("review-bulk", ref);
  return (
    <div
      ref={ref}
      data-sticky-bulk
      className="gas-sticky-bulk fixed inset-x-0 z-20 px-4 pt-3 pb-3"
      style={{ bottom: "var(--tabbar-inset, 0px)" }}
    >
      {children}
    </div>
  );
}
