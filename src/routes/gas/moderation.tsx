import { completePageHead } from "@/lib/page-head";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, ClipboardCheck } from "lucide-react";
import { QueueCard } from "@/components/gas-ops/review/QueueCard";
import {
  ReviewPanel,
  type CorrectInput,
  type DecideResult,
} from "@/components/gas-ops/review/ReviewPanel";
import { PhoneSheet } from "@/components/gas-ops/review/PhoneSheet";
import { useFloatingBottom, useIsDesktop } from "@/components/gas-ops/review/use-layout";
import { marksOf, needsAttention, type Mark } from "@/components/gas-ops/review/rules";
import { ScreenHint, SectionTitle } from "@/components/gas-ops/page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ENTRY_STATUS_LABEL,
  useGasActions,
  useGasActor,
  useGasEntry,
  useGasQueue,
  useGasQueueCounts,
  useGasUsers,
  type EntryStatus,
  type EntryView,
} from "@/api/gas-ops";
import { gasShowConfirmed, useGasShow } from "@/lib/gas-ops/show";
import { plural } from "@/lib/format";
import { toast, toastUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Очередь проверки (ADR-044, F5). Менеджер с первого взгляда видит, что требует внимания,
 * а что можно подтвердить пачкой. Решение по записи в два касания: открыть и подтвердить.
 * Обратимое действие выполняется сразу, отмена живёт в тосте 6 секунд.
 */
type Tab = EntryStatus | "all";

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
      { meta: [{ title: "Проверка записей времени — гайка" }] },
      "Проверка записей времени — гайка",
      "Очередь проверки: подтвердить, вернуть на уточнение, исправить или отклонить.",
    ),
  component: ModerationPage,
});

const TABS: Tab[] = ["pending", "clarify", "draft", "rejected", "all"];

const DONE_TEXT = {
  confirm: "Подтверждено",
  reject: "Отклонено",
  clarify: "Возвращено на уточнение",
} as const;

interface Item {
  view: EntryView;
  marks: Mark[];
  fresh: boolean;
}

function ModerationPage() {
  const actor = useGasActor();
  const actions = useGasActions();
  const desktop = useIsDesktop();
  const floatingBottom = useFloatingBottom();
  const show = useGasShow();
  const { open: openParam } = Route.useSearch();

  const [tab, setTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const counts = useGasQueueCounts();
  const rows = useGasQueue(tab);
  const users = useGasUsers();
  const userIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);

  /*
   * Группы очереди. Новые записи этой вкладки — внесённые через бота или экран, а не
   * пришедшие с набором: их автор человек из списка входа, а не сотрудник из выгрузки.
   */
  const { attention, clean, ordered } = useMemo(() => {
    const items: Item[] = rows.map((view) => {
      const marks = marksOf(view);
      return {
        view,
        marks,
        fresh: view.entry.source === "mock" && userIds.has(view.entry.createdBy),
      };
    });
    const byFresh = (a: Item, b: Item) => Number(b.fresh) - Number(a.fresh);
    const attention = items.filter((item) => needsAttention(item.marks)).sort(byFresh);
    const clean = items.filter((item) => !needsAttention(item.marks)).sort(byFresh);
    return { attention, clean, ordered: [...attention, ...clean] };
  }, [rows, userIds]);

  const currentId = desktop
    ? (ordered.find((item) => item.view.entry.id === selected)?.view.entry.id ??
      ordered[0]?.view.entry.id ??
      null)
    : sheetOpen
      ? selected
      : null;
  // Запись могла уйти из вкладки (решение принято): детали берём из всех записей
  const current = useMemo(() => {
    if (!currentId) return null;
    const inList = ordered.find((item) => item.view.entry.id === currentId);
    return inList?.view ?? null;
  }, [currentId, ordered]);

  const cards = useRef(new Map<string, HTMLButtonElement>());

  /* ---------- ?open=<id>: открыть и подсветить запись (показ, ссылки) ---------- */
  const handledOpen = useRef<string | null>(null);
  const opened = useGasEntry(openParam ?? null);
  const openStatus = opened?.entry.status ?? null;
  useEffect(() => {
    if (!openParam || !openStatus || handledOpen.current === openParam) return;
    handledOpen.current = openParam;
    setTab(TABS.includes(openStatus) ? openStatus : "all");
    setSelected(openParam);
    setSheetOpen(true);
    setHighlight(openParam);
    const timer = window.setTimeout(() => setHighlight(null), 4000);
    window.setTimeout(() => {
      cards.current.get(openParam)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [openParam, openStatus]);

  /** Следующая запись той же группы, иначе соседняя, иначе первая из другой группы */
  const nextAfter = useCallback(
    (id: string): string | null => {
      const group = attention.some((item) => item.view.entry.id === id) ? attention : clean;
      const other = group === attention ? clean : attention;
      const index = group.findIndex((item) => item.view.entry.id === id);
      const next = group[index + 1] ?? group[index - 1] ?? other[0];
      return next?.view.entry.id ?? null;
    },
    [attention, clean],
  );

  const undo = useCallback(
    async (id: string) => {
      const result = await actions.undoReview(id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setTab((value) => (value === "all" || value === result.value.status ? value : "pending"));
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
      if (action === "confirm") gasShowConfirmed(id);
      toastUndo(
        DONE_TEXT[action],
        () => void undo(id),
        `${view.entry.number}, ${view.object?.label ?? ""}`,
      );
      // Решённая запись уходит из вкладки «Ожидает проверки»: открываем следующую
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
        description: `${view.entry.number}: изменение записано в журнал. Теперь запись можно подтвердить.`,
      });
      return { ok: true };
    },
    [actions],
  );

  /* ---------- Пачка «Без замечаний» ---------- */
  const confirmClean = async () => {
    setConfirmAll(false);
    const ids = clean.map((item) => item.view.entry.id);
    const done: string[] = [];
    for (const id of ids) {
      const result = await actions.review({ id, action: "confirm" });
      if (result.ok) done.push(id);
    }
    if (done.length === 0) {
      toast.error("Не получилось подтвердить записи. Повторите.");
      return;
    }
    for (const id of done) gasShowConfirmed(id);
    toastUndo(
      `Подтверждено: ${done.length} ${plural(done.length, "запись", "записи", "записей")}`,
      () => {
        void (async () => {
          for (const id of done) await actions.undoReview(id);
        })();
      },
      "Записи без замечаний ушли в недельный отчёт",
    );
    if (currentId && done.includes(currentId)) setSelected(attention[0]?.view.entry.id ?? null);
  };

  /* ---------- Клавиши на десктопе: J и K по списку, Enter подтверждает ---------- */
  useEffect(() => {
    if (!desktop || !actor.canReview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
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
        // Enter на чужой кнопке делает своё; на карточке открытой записи — подтверждает
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

  const renderGroup = (items: Item[]) => (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const id = item.view.entry.id;
        return (
          <li key={id}>
            <QueueCard
              ref={(node) => {
                if (node) cards.current.set(id, node);
                else cards.current.delete(id);
              }}
              view={item.view}
              marks={item.marks}
              fresh={item.fresh}
              active={desktop && currentId === id}
              highlight={highlight === id}
              showStatus={tab === "all"}
              onOpen={() => openEntry(id)}
            />
          </li>
        );
      })}
    </ul>
  );

  const panel = current ? (
    <ReviewPanel
      key={current.entry.id}
      view={current}
      layout={desktop ? "panel" : "sheet"}
      floatingBottom={floatingBottom}
      canDecide={actor.canReview}
      showKeys={desktop}
      onConfirm={() => void decide(current, "confirm")}
      onDecide={(action, comment) => decide(current, action, comment)}
      onCorrect={(input) => correct(current, input)}
      {...(desktop ? {} : { onClose: () => setSheetOpen(false) })}
    />
  ) : null;

  const total = counts.pending + counts.clarify + counts.draft + counts.rejected;

  return (
    <div className="min-w-0">
      <ScreenHint screen="moderation" />

      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        <div role="tablist" aria-label="Статус записи" className="seg">
          {TABS.map((value) => {
            const count = value === "all" ? total : counts[value];
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => {
                  setTab(value);
                  setSelected(null);
                  setSheetOpen(false);
                }}
                className="seg-item focus-ring"
              >
                {value === "all" ? "Все" : ENTRY_STATUS_LABEL[value]}
                <span className="text-[12px] opacity-70 tnum">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {desktop && ordered.length > 0 ? (
            <p className="flex items-center gap-2 text-[13px] leading-5 text-text-3">
              <kbd className="kbd">J</kbd>
              <kbd className="kbd">K</kbd>
              по списку
              <span aria-hidden>·</span>
              <kbd className="kbd">Enter</kbd>
              подтвердить открытую
            </p>
          ) : null}

          {ordered.length === 0 ? (
            <div className="card-v3 px-6 py-10 text-center">
              <CheckCheck className="mx-auto size-8 text-ok" aria-hidden />
              <h2 className="mt-3 text-[18px] font-semibold">
                {tab === "pending" ? "Очередь пуста" : "Здесь пусто"}
              </h2>
              <p className="mx-auto mt-1 max-w-[340px] text-[14px] leading-5 text-text-2">
                {tab === "pending"
                  ? "Новые записи бригадиров появятся здесь. Подтверждённые уже в журнале и отчёте."
                  : "В этом состоянии записей нет."}
              </p>
              <Link to="/gas/entries" className="pill-action mt-5 text-[15px] focus-ring press">
                Открыть журнал
              </Link>
            </div>
          ) : null}

          {attention.length > 0 ? (
            <section aria-labelledby="group-attention">
              <SectionTitle
                aside={
                  <span className="pb-0.5 text-[13px] text-text-3 tnum">{attention.length}</span>
                }
              >
                <span id="group-attention">Требуют внимания</span>
              </SectionTitle>
              {renderGroup(attention)}
            </section>
          ) : null}

          {clean.length > 0 ? (
            <section aria-labelledby="group-clean">
              <SectionTitle
                aside={
                  tab === "pending" ? (
                    <button
                      type="button"
                      onClick={() => setConfirmAll(true)}
                      className="inline-flex min-h-12 items-center gap-2 rounded-full bg-surface-2 px-4 text-[14px] font-medium text-text transition-fast focus-ring press is-hover:bg-surface-3"
                    >
                      <CheckCheck className="size-4" aria-hidden />
                      Подтвердить все ({clean.length})
                    </button>
                  ) : (
                    <span className="pb-0.5 text-[13px] text-text-3 tnum">{clean.length}</span>
                  )
                }
              >
                <span id="group-clean">Без замечаний</span>
              </SectionTitle>
              {renderGroup(clean)}
            </section>
          ) : null}
        </div>

        {desktop ? (
          <aside
            aria-labelledby={current ? "review-title" : undefined}
            aria-label={current ? undefined : "Детали записи"}
            className="card-v3 sticky top-6 flex flex-col overflow-hidden rounded-[var(--r-2xl)]"
            style={{ maxHeight: `calc(100dvh - 48px - ${Math.max(0, floatingBottom - 8)}px)` }}
          >
            {panel ?? (
              <p className="px-6 py-10 text-center text-[14px] text-text-2">
                Выберите запись слева, чтобы увидеть, что ввёл бригадир и что посчитала система.
              </p>
            )}
          </aside>
        ) : null}
      </div>

      {desktop ? null : (
        <PhoneSheet
          open={sheetOpen && !!current}
          onClose={() => setSheetOpen(false)}
          labelledBy="review-title"
        >
          {panel}
        </PhoneSheet>
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Подтвердить {clean.length} {plural(clean.length, "запись", "записи", "записей")} без
              замечаний?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Записи уйдут в недельный отчёт. Отменить можно в течение 6 секунд в уведомлении.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn("min-h-12")}>Не сейчас</AlertDialogCancel>
            <AlertDialogAction className="min-h-12" onClick={() => void confirmClean()}>
              Подтвердить {clean.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
