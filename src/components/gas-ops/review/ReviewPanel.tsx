/**
 * Детали записи в проверке (ADR-044, F5, п. 4–5): заголовок с объектом и суммой, блоки
 * записи и действия. На десктопе это панель справа с кнопками внизу панели, на телефоне
 * содержимое листа снизу с плавающей капсулой действий над нижней панелью оболочки.
 *
 * Подтверждение в одно касание. Возврат, исправление и отклонение требуют причину:
 * частые причины кнопками, свой текст полем.
 */
import { Check, MessageCircleQuestion, MoreHorizontal, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmtRate, fmtRub, formatClock, useGasActor, type EntryView } from "@/api/gas-ops";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntryDetails } from "../EntryDetails";
import { EntryStatusBadge, MarkList } from "../marks";
import { entryLine, fmtEntryDay, fmtShortDay, marksOf } from "./rules";
import { REASONS, REASON_SUBMIT, REASON_TITLE, reasonText, type ReasonMode } from "./reasons";
import { cn } from "@/lib/utils";

export interface CorrectInput {
  start: string;
  end: string;
  breakMinutes: string;
  comment: string;
}

/** Ответ действия: текст ошибки показывается рядом с формой, а не только тостом */
export type DecideResult = { ok: true } | { ok: false; message: string };

export function ReviewPanel({
  view,
  layout,
  floatingBottom,
  canDecide,
  showKeys,
  onConfirm,
  onDecide,
  onCorrect,
  onClose,
}: {
  view: EntryView;
  layout: "panel" | "sheet";
  /** Сколько снизу занято плавающими слоями оболочки (телефон) */
  floatingBottom: number;
  canDecide: boolean;
  showKeys: boolean;
  onConfirm: () => void;
  onDecide: (action: "reject" | "clarify", comment: string) => Promise<DecideResult>;
  onCorrect: (input: CorrectInput) => Promise<DecideResult>;
  onClose?: () => void;
}) {
  const { entry } = view;
  const [mode, setMode] = useState<ReasonMode | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const marks = marksOf(view);
  const sheet = layout === "sheet";
  // Суммы бригадир не видит (ТЗ, п. 5.6)
  const money = useGasActor().canSeeMoney;

  // Форма причины открылась: показываем её, а не держим под сгибом
  useEffect(() => {
    if (mode) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mode]);

  const decided = entry.status === "confirmed";

  return (
    <div className={cn("flex min-h-0 flex-col", !sheet && "h-full")}>
      <header className={cn("shrink-0", sheet ? "px-gutter pt-1" : "px-6 pt-5")}>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-meta text-text-3">
            {entry.number} · {sheet ? fmtShortDay(entry.day) : fmtEntryDay(entry.day)}
          </p>
          <EntryStatusBadge status={entry.status} />
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
        {money ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {entry.amountRub === null && view.estimate?.status === "confirmed" ? (
              /*
               * Сумма записи назначается при подтверждении из подтверждённой стоимости объекта.
               * До этого показываем её как ожидаемую, а не «нет суммы»: иначе на записи показа
               * ЛПР видел «нет суммы», а через шаг в отчёте 14 700 ₽ (аудит J1)
               */
              <p className="flex flex-wrap items-baseline gap-x-2" data-testid="amount-expected">
                <span className="text-title tnum">{fmtRub(view.estimate.amountRub)}</span>
                <span className="text-meta text-text-3">
                  по смете объекта, начислится при подтверждении
                </span>
              </p>
            ) : entry.amountRub === null ? (
              <p className="text-body text-text-3">
                Нет суммы{" "}
                <a href="#entry-why" className="text-body-strong text-orange focus-ring">
                  Почему
                </a>
              </p>
            ) : (
              <p className="text-title tnum">{fmtRub(entry.amountRub)}</p>
            )}
            {view.revenue !== null ? (
              <p className="text-body text-text-2 tnum">{fmtRate(view.revenue)}</p>
            ) : null}
            {/* Сумма есть, а стоимость объекта не подтверждена: говорим об этом у самой суммы */}
            {entry.amountRub !== null && view.flags.includes("no-estimate") ? (
              <p className="w-full text-meta text-warn" data-testid="amount-unconfirmed">
                Сумма по стоимости, которая ещё не подтверждена
              </p>
            ) : null}
          </div>
        ) : null}
        <MarkList marks={marks} className="mt-2" />
      </header>

      <div
        className={cn(
          "min-h-0 flex-1",
          sheet ? "px-gutter pt-4" : "overflow-y-auto px-6 pt-4 pb-4",
        )}
        style={sheet ? { paddingBottom: floatingBottom + 88 } : undefined}
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

      {mode || !canDecide ? null : (
        <ActionBar sheet={sheet} floatingBottom={floatingBottom}>
          {decided ? (
            <p className="flex min-h-12 flex-1 items-center px-3 text-body text-text-2">
              Подтверждено и учтено в недельном отчёте.
            </p>
          ) : (
            <>
              <button
                type="button"
                data-tour="review-confirm"
                onClick={onConfirm}
                className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-control bg-orange-strong px-5 text-body-strong text-on-orange transition-fast focus-ring press-98 is-hover:bg-orange-strong-hover"
              >
                <Check className="size-5 shrink-0" aria-hidden />
                Подтвердить
                {showKeys ? (
                  <kbd className="ms-1 rounded-[var(--r-xs)] bg-white/20 px-1.5 text-tab">
                    Enter
                  </kbd>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setMode("clarify")}
                aria-label="Вернуть на уточнение"
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-control border border-line-2 bg-surface px-4 text-body-strong text-text transition-fast focus-ring press-98 is-hover:bg-surface-2"
              >
                <MessageCircleQuestion className="hidden size-5 sm:block" aria-hidden />
                <span className="lg:hidden">На уточнение</span>
                <span className="hidden lg:inline">Вернуть на уточнение</span>
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
                    onSelect={() => setMode("correct")}
                    className="min-h-12 gap-2 text-body"
                  >
                    <Pencil className="size-4" aria-hidden />
                    Исправить
                  </DropdownMenuItem>
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
    times: { start: string; end: string; breakMinutes: string },
  ) => Promise<DecideResult>;
}) {
  const { entry } = view;
  const [chip, setChip] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [start, setStart] = useState(clockOf(entry.startMinutes));
  const [end, setEnd] = useState(clockOf(entry.endMinutes));
  const [breaks, setBreaks] = useState(String(entry.breakMinutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const comment = reasonText(chip, own);
  const noFrame = mode === "correct" && entry.startMinutes === null;
  const ready = comment.length > 0 && !noFrame && !busy;

  const send = async (text: string) => {
    setBusy(true);
    setError(null);
    const result = await onSubmit(text, { start, end, breakMinutes: breaks });
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
          <div className="mt-3 grid grid-cols-3 gap-2">
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
