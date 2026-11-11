/**
 * Деталь записи в проверке (ADR-061, 10; раздел 4.3): заголовок с объектом и суммой, пять
 * блоков детали и липкие кнопки «Принять», «Исправить», «Вернуть на уточнение», «Отклонить»
 * в «⋮». На компьютере это панель справа, на телефоне лист на весь экран с кнопками внизу.
 *
 * Принятие в одно касание. Возврат, исправление и отклонение требуют причину:
 * частые причины кнопками, свой текст полем. Esc закрывает форму причины.
 */
import { isAutoAccepted } from "@/api/gas-ops";
import { Check, MessageCircleQuestion, MoreHorizontal, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  acceptBlocker,
  costBreakdown,
  entryInfo,
  fmtRub,
  formatClock,
  remarksOf,
  useGasActor,
  type EntryView,
} from "@/api/gas-ops";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntryDetails } from "../EntryDetails";
import { EntryStatusBadge } from "../marks";
import { RemarkChips } from "./remarks";
import { RecordTrail } from "./RecordTrail";
import { entryLine, fmtEntryDay, fmtShortDay } from "./rules";
import { REASONS, REASON_SUBMIT, REASON_TITLE, reasonText, type ReasonMode } from "./reasons";
import { cn } from "@/lib/utils";

export interface CorrectInput {
  start: string;
  end: string;
  breakMinutes: string;
  comment: string;
  /** Сколько людей работало: меняется только вместе с причиной (ADR-056) */
  headcount?: number | null;
}

/** Ответ действия: текст ошибки показывается рядом с формой, а не только тостом */
export type DecideResult = { ok: true } | { ok: false; message: string };

export function ReviewPanel({
  view,
  layout,
  floatingBottom,
  canDecide,
  onConfirm,
  onDecide,
  onCorrect,
  onUndoAuto,
  onClose,
}: {
  view: EntryView;
  layout: "panel" | "sheet";
  /** Сколько снизу занято плавающими слоями оболочки (телефон) */
  floatingBottom: number;
  canDecide: boolean;
  onConfirm: () => void;
  onDecide: (action: "reject" | "clarify", comment: string) => Promise<DecideResult>;
  onCorrect: (input: CorrectInput) => Promise<DecideResult>;
  /** Вернуть автоматически принятую запись в очередь (до закрытия недели) */
  onUndoAuto?: () => void;
  onClose?: () => void;
}) {
  const { entry } = view;
  const [mode, setMode] = useState<ReasonMode | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const info = entryInfo(view);
  const remarks = remarksOf(info);
  const blocker = acceptBlocker(info);
  const cost = costBreakdown(view);
  const sheet = layout === "sheet";
  // Суммы бригадир не видит (ТЗ, п. 5.6)
  const money = useGasActor().canSeeMoney;

  // Форма причины открылась: показываем её, а не держим под сгибом
  useEffect(() => {
    if (mode) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mode]);

  // Esc закрывает форму причины; без формы — лист на телефоне
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[role='dialog'][data-state='open'] [data-testid='compare']"))
        return;
      if (mode) {
        event.preventDefault();
        setMode(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const decided = entry.status === "confirmed";
  const auto = isAutoAccepted(entry);

  return (
    <div className={cn("flex min-h-0 flex-col", !sheet && "h-full")}>
      <header className={cn("shrink-0", sheet ? "px-gutter pt-1" : "px-6 pt-5")}>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-meta text-text-3">
            {entry.number} · {sheet ? fmtShortDay(entry.day) : fmtEntryDay(entry.day)}
          </p>
          <EntryStatusBadge status={entry.status} auto={auto} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="-me-2 grid size-11 shrink-0 place-items-center rounded-full text-text-2 focus-ring is-hover:bg-surface-2"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>
        <h2 id="review-title" className="mt-1 line-clamp-2 text-heading text-balance">
          {view.object?.label ?? "Объект не указан"}
        </h2>
        <p className="mt-0.5 text-meta text-text-2 tnum">{entryLine(view)}</p>
        <RecordTrail view={view} remarkCount={remarks.length} />
        {money ? (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2" data-testid="amount-line">
            {cost.amountRub === null ? (
              <span className="text-body text-text-2">Сумма не рассчитана</span>
            ) : (
              <span className="text-title tnum">
                {cost.expected ? "≈ " : ""}
                {fmtRub(cost.amountRub)}
              </span>
            )}
            <span className="text-meta text-text-3">{cost.source}</span>
          </p>
        ) : null}
        <RemarkChips remarks={remarks} className="mt-2" />
      </header>

      {/*
       * Деталь на компьютере прокручивается сама: с клавиатуры до неё доходят табуляцией,
       * иначе текст ниже первого экрана читается только мышью (axe, scrollable-region-focusable)
       */}
      <div
        className={cn(
          "min-h-0 flex-1",
          sheet ? "px-gutter pt-4" : "overflow-y-auto px-6 pt-4 pb-4 focus-ring",
        )}
        style={sheet ? { paddingBottom: floatingBottom + 88 } : undefined}
        {...(sheet ? {} : { tabIndex: 0, role: "region", "aria-label": "Подробности записи" })}
      >
        {mode ? (
          <div ref={formRef} className="mb-3 scroll-mt-4">
            <ReasonForm
              key={mode}
              mode={mode}
              view={view}
              sheet={sheet}
              floatingBottom={floatingBottom}
              onCancel={() => setMode(null)}
              onSubmit={async (comment, times) => {
                const result =
                  mode === "correct"
                    ? await onCorrect({ ...times, comment })
                    : await onDecide(mode, comment);
                if (result.ok) setMode(null);
                return result;
              }}
            />
          </div>
        ) : null}
        <EntryDetails view={view} />
      </div>

      {blocker && !mode && canDecide && !decided ? (
        <p
          role="note"
          className={`shrink-0 text-meta text-danger ${sheet ? "px-gutter pb-2" : "px-6 pb-1"}`}
        >
          {blocker.todo}
        </p>
      ) : null}
      {mode || !canDecide ? null : (
        <ActionBar sheet={sheet} floatingBottom={floatingBottom}>
          {decided && auto && onUndoAuto ? (
            <>
              <p className="flex min-h-12 min-w-0 flex-1 items-center px-3 text-body text-text-2">
                Принята автоматически и учтена в отчёте.
              </p>
              <button
                type="button"
                onClick={onUndoAuto}
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-control border border-line-2 px-4 text-body focus-ring press-98"
              >
                Вернуть в проверку
              </button>
            </>
          ) : decided ? (
            <p className="flex min-h-12 flex-1 items-center px-3 text-body text-text-2">
              Принято и учтено в недельном отчёте.
            </p>
          ) : (
            <>
              <button
                type="button"
                data-tour="review-confirm"
                onClick={onConfirm}
                disabled={!!blocker}
                title={blocker ? blocker.todo : undefined}
                className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-control bg-orange-strong px-4 text-body-strong text-on-orange transition-fast focus-ring press-98 is-hover:bg-orange-strong-hover disabled:opacity-45"
              >
                <Check className="size-5 shrink-0" aria-hidden />
                Принять
              </button>
              <button
                type="button"
                onClick={() => setMode("correct")}
                aria-label="Исправить"
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-control border border-line-2 bg-surface px-3 text-body-strong text-text transition-fast focus-ring press-98 is-hover:bg-surface-2 lg:px-4"
              >
                <Pencil className="size-5 shrink-0" aria-hidden />
                <span className="hidden lg:inline">Исправить</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("clarify")}
                aria-label="Вернуть на уточнение"
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-control border border-line-2 bg-surface px-3 text-body-strong text-text transition-fast focus-ring press-98 is-hover:bg-surface-2 lg:px-4"
              >
                <MessageCircleQuestion className="hidden size-5 shrink-0 sm:block" aria-hidden />
                <span className="2xl:hidden">На уточнение</span>
                <span className="hidden 2xl:inline">Вернуть на уточнение</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Ещё действия"
                  className="grid size-12 shrink-0 place-items-center rounded-control border border-line-2 bg-surface text-text transition-fast focus-ring press-98 is-hover:bg-surface-2"
                >
                  <MoreHorizontal className="size-5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="min-w-[200px]">
                  <DropdownMenuItem
                    onSelect={() => setMode("reject")}
                    className="min-h-12 gap-2 text-body text-danger"
                  >
                    <X className="size-4" aria-hidden />
                    Отклонить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </ActionBar>
      )}
    </div>
  );
}

/**
 * Кнопки решения: внизу панели на десктопе. На телефоне липкая панель действий 64 + safe-area
 * у нижнего края (ADR-045, 4.4 и 4.13): открытая карточка закрывает нижнюю панель оболочки,
 * поэтому внизу один слой. Кнопки решения полевые: 48.
 */
function ActionBar({
  sheet,
  floatingBottom,
  children,
}: {
  sheet: boolean;
  floatingBottom: number;
  children: ReactNode;
}) {
  if (sheet) {
    return (
      <Floating bottom={floatingBottom}>
        <div
          role="group"
          aria-label="Решение по записи"
          className="box-content line-top flex h-action items-center gap-2 bg-surface px-gutter pb-[env(safe-area-inset-bottom)] [&_button]:h-12 [&_button]:min-h-12 [&_button]:min-w-12"
        >
          {children}
        </div>
      </Floating>
    );
  }
  return (
    <div
      role="group"
      aria-label="Решение по записи"
      className="flex shrink-0 items-center gap-2 bg-surface px-4 pt-3 pb-4"
    >
      {children}
    </div>
  );
}

/**
 * Панель действий листа на телефоне. Рисуется в body, а не внутри листа: у листа есть
 * анимация сдвига, и `fixed` внутри него считался бы от листа, а не от экрана.
 * Нижней панели оболочки под листом нет, поэтому панель стоит у самого края.
 */
function Floating({ bottom, children }: { bottom: number; children: ReactNode }) {
  void bottom;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-review-floating className="fixed inset-x-0 bottom-0 z-[46]">
      {children}
    </div>,
    document.body,
  );
}

function clockOf(minutes: number | null): string {
  return minutes === null ? "" : formatClock(minutes);
}

function ReasonForm({
  mode,
  view,
  sheet,
  floatingBottom,
  onCancel,
  onSubmit,
}: {
  mode: ReasonMode;
  view: EntryView;
  sheet: boolean;
  floatingBottom: number;
  onCancel: () => void;
  onSubmit: (
    comment: string,
    times: { start: string; end: string; breakMinutes: string; headcount?: number | null },
  ) => Promise<DecideResult>;
}) {
  const { entry } = view;
  const [chip, setChip] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [start, setStart] = useState(clockOf(entry.startMinutes));
  const [end, setEnd] = useState(clockOf(entry.endMinutes));
  const [breaks, setBreaks] = useState(String(entry.breakMinutes));
  const [people, setPeople] = useState(entry.headcount == null ? "" : String(entry.headcount));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const comment = reasonText(chip, own);
  const noFrame = mode === "correct" && entry.startMinutes === null;
  const ready = comment.length > 0 && !noFrame && !busy;

  const send = async (text: string) => {
    setBusy(true);
    setError(null);
    const count = people.trim() === "" ? null : Number(people);
    const result = await onSubmit(text, {
      start,
      end,
      breakMinutes: breaks,
      ...(count !== (entry.headcount ?? null) ? { headcount: count } : {}),
    });
    setBusy(false);
    if (!result.ok) setError(result.message);
  };
  const submit = async () => {
    if (!ready) return;
    await send(comment);
  };
  /*
   * Отклонение и уточнение обратимы: частая причина применяется сразу, отмена в тосте
   * 6 секунд (ADR-045, принцип 8; отклонение за 4 касания, раздел 6). Свой текст по кнопке.
   * Исправлению нужно время, поэтому там причина только выбирается.
   */
  const instant = mode !== "correct";

  const buttons = (
    <>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!ready}
        className="inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-control bg-orange-strong px-5 text-body-strong text-on-orange transition-fast focus-ring press-98 disabled:opacity-45"
      >
        {REASON_SUBMIT[mode]}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-12 shrink-0 items-center rounded-control border border-line-2 bg-surface px-5 text-body-strong text-text focus-ring press-98 is-hover:bg-surface-2"
      >
        Отмена
      </button>
    </>
  );

  const field =
    "mt-1 h-12 w-full rounded-control border border-line-2 bg-surface px-3 text-body text-text tnum focus-ring";

  return (
    <section aria-labelledby="reason-title" className="surface-1 p-card">
      <h3 id="reason-title" className="text-heading">
        {REASON_TITLE[mode]}
      </h3>

      {mode === "correct" ? (
        noFrame ? (
          <p className="mt-2 text-body text-warn">
            У записи из выгрузки нет начала и окончания смены: в недельном отчёте стоят только
            минуты.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-meta text-text-2">
              Начало
              <input
                value={start}
                onChange={(event) => setStart(event.target.value)}
                inputMode="numeric"
                placeholder="08:20"
                className={field}
              />
            </label>
            <label className="text-meta text-text-2">
              Окончание
              <input
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                inputMode="numeric"
                placeholder="16:40"
                className={field}
              />
            </label>
            <label className="text-meta text-text-2">
              Перерыв, мин
              <input
                value={breaks}
                onChange={(event) => setBreaks(event.target.value)}
                inputMode="numeric"
                placeholder="60"
                className={field}
              />
            </label>
            <label className="text-meta text-text-2">
              Людей
              <input
                value={people}
                onChange={(event) => setPeople(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="не указан"
                className={field}
              />
            </label>
          </div>
        )
      ) : null}

      <p className="mt-3 text-meta text-text-3">
        {mode === "correct"
          ? "Почему исправлено"
          : "Причина применяется сразу, отменить можно 6 секунд. Или напишите свою"}
      </p>
      <div role="group" aria-label="Частые причины" className="mt-2 flex flex-wrap gap-2">
        {REASONS[mode].map((reason) => {
          const on = chip === reason;
          return (
            <button
              key={reason}
              type="button"
              aria-pressed={instant ? undefined : on}
              disabled={busy}
              onClick={() => {
                if (instant) void send(reasonText(reason, own));
                else setChip(on ? null : reason);
              }}
              className={cn(
                "inline-flex min-h-12 items-center rounded-full px-4 text-body-strong transition-fast focus-ring press-98",
                on ? "bg-pill text-pill-text" : "bg-surface text-text is-hover:bg-surface-3",
              )}
            >
              {reason}
            </button>
          );
        })}
      </div>
      <label className="mt-3 block text-meta text-text-2">
        Свой текст
        <textarea
          value={own}
          onChange={(event) => setOwn(event.target.value)}
          rows={2}
          placeholder={mode === "clarify" ? "Что спросить у бригадира" : "Что не так"}
          className="mt-1 block min-h-18 w-full resize-none rounded-control border border-line-2 bg-surface px-3 py-3 text-body text-text focus-ring"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      {sheet ? (
        <Floating bottom={floatingBottom}>
          <div className="box-content line-top flex h-action items-center gap-2 bg-surface px-gutter pb-[env(safe-area-inset-bottom)] [&_button]:h-12 [&_button]:min-h-12">
            {buttons}
          </div>
        </Floating>
      ) : (
        <div className="mt-4 flex items-center gap-2">{buttons}</div>
      )}
    </section>
  );
}
