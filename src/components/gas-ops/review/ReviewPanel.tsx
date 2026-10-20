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
      <header className={cn("shrink-0", sheet ? "px-5 pt-1" : "px-6 pt-6")}>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[13px] leading-5 text-text-3">
            {entry.number} · {sheet ? fmtShortDay(entry.day) : fmtEntryDay(entry.day)}
          </p>
          <EntryStatusBadge status={entry.status} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="-me-2 grid size-12 shrink-0 place-items-center rounded-full text-text-2 focus-ring is-hover:bg-surface-2"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>
        <h2
          id="review-title"
          className="mt-2 text-[24px] leading-[30px] font-semibold tracking-[-0.02em] text-balance"
        >
          {view.object?.label ?? "Объект не указан"}
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-text-2 tnum">{entryLine(view)}</p>
        {money ? (
          <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
            <p
              className={cn(
                "text-[34px] leading-[38px] font-semibold tracking-[-0.03em] tnum",
                entry.amountRub === null && "text-text-3",
              )}
            >
              {entry.amountRub === null ? "Нет суммы" : fmtRub(entry.amountRub)}
            </p>
            {view.revenue !== null ? (
              <p className="pb-1 text-[14px] leading-5 text-text-2 tnum">{fmtRate(view.revenue)}</p>
            ) : null}
          </div>
        ) : null}
        <MarkList marks={marks} className="mt-3" />
      </header>

      <div
        className={cn("min-h-0 flex-1", sheet ? "px-3 pt-4" : "overflow-y-auto px-4 pt-5 pb-4")}
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
            <p className="flex min-h-12 flex-1 items-center px-3 text-[14px] leading-5 text-text-2">
              Подтверждено и учтено в недельном отчёте.
            </p>
          ) : (
            <>
              <button
                type="button"
                data-tour="review-confirm"
                onClick={onConfirm}
                className="inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-orange-strong px-5 text-[16px] font-semibold text-on-orange transition-fast focus-ring press is-hover:bg-orange-strong-hover lg:min-h-12"
              >
                <Check className="size-5 shrink-0" aria-hidden />
                Подтвердить
                {showKeys ? (
                  <kbd className="ms-1 rounded-[6px] bg-white/20 px-1.5 text-[11px] leading-5 font-medium">
                    Enter
                  </kbd>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setMode("clarify")}
                aria-label="Вернуть на уточнение"
                className="inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-surface-2 px-4 text-[15px] font-medium text-text transition-fast focus-ring press is-hover:bg-surface-3 lg:min-h-12"
              >
                <MessageCircleQuestion className="hidden size-[18px] sm:block" aria-hidden />
                <span className="lg:hidden">На уточнение</span>
                <span className="hidden lg:inline">Вернуть на уточнение</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Ещё действия"
                  className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-2 text-text transition-fast focus-ring press is-hover:bg-surface-3 lg:size-12"
                >
                  <MoreHorizontal className="size-5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="min-w-[200px]">
                  <DropdownMenuItem
                    onSelect={() => setMode("correct")}
                    className="min-h-12 gap-2 text-[15px]"
                  >
                    <Pencil className="size-4" aria-hidden />
                    Исправить
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setMode("reject")}
                    className="min-h-12 gap-2 text-[15px] text-danger"
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

/** Кнопки решения: внизу панели на десктопе, плавающая капсула на телефоне */
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
          className="flex items-center gap-1.5 rounded-[30px] bg-surface p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.28)] ring-1 ring-line"
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
 * Плавающая капсула листа на телефоне. Рисуется в body, а не внутри листа: у листа есть
 * анимация сдвига, и `fixed` внутри него считался бы от листа, а не от экрана.
 */
function Floating({ bottom, children }: { bottom: number; children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-review-floating
      className="fixed inset-x-3 z-[36] mx-auto max-w-[520px]"
      style={{ bottom }}
    >
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

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const result = await onSubmit(comment, { start, end, breakMinutes: breaks });
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  const buttons = (
    <>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!ready}
        className="pill-action min-w-0 flex-1 text-[16px] font-semibold transition-fast focus-ring press disabled:opacity-40"
      >
        {REASON_SUBMIT[mode]}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-14 shrink-0 items-center rounded-full bg-surface-2 px-5 text-[15px] font-medium text-text focus-ring press is-hover:bg-surface-3 lg:min-h-12"
      >
        Отмена
      </button>
    </>
  );

  const field =
    "mt-1 h-12 w-full rounded-[14px] bg-surface px-3 text-[16px] text-text tnum focus-ring";

  return (
    <section
      aria-labelledby="reason-title"
      className="rounded-[var(--r-xl)] bg-surface-2 p-4 ring-1 ring-line-2"
    >
      <h3 id="reason-title" className="text-[16px] leading-6 font-semibold">
        {REASON_TITLE[mode]}
      </h3>

      {mode === "correct" ? (
        noFrame ? (
          <p className="mt-2 text-[14px] leading-5 text-warn">
            У записи из выгрузки нет начала и окончания смены: в файле заказчика стоят только
            минуты.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-[13px] text-text-2">
              Начало
              <input
                value={start}
                onChange={(event) => setStart(event.target.value)}
                inputMode="numeric"
                placeholder="08:20"
                className={field}
              />
            </label>
            <label className="text-[13px] text-text-2">
              Окончание
              <input
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                inputMode="numeric"
                placeholder="16:40"
                className={field}
              />
            </label>
            <label className="text-[13px] text-text-2">
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

      <p className="mt-3 text-[13px] leading-5 text-text-3">
        {mode === "correct" ? "Почему исправлено" : "Выберите причину или напишите свою"}
      </p>
      <div role="group" aria-label="Частые причины" className="mt-2 flex flex-wrap gap-2">
        {REASONS[mode].map((reason) => {
          const on = chip === reason;
          return (
            <button
              key={reason}
              type="button"
              aria-pressed={on}
              onClick={() => setChip(on ? null : reason)}
              className={cn(
                "inline-flex min-h-12 items-center rounded-full px-4 text-[14px] leading-5 font-medium transition-fast focus-ring press",
                on ? "bg-pill text-pill-text" : "bg-surface text-text is-hover:bg-surface-3",
              )}
            >
              {reason}
            </button>
          );
        })}
      </div>
      <label className="mt-3 block text-[13px] text-text-2">
        Свой текст
        <textarea
          value={own}
          onChange={(event) => setOwn(event.target.value)}
          rows={2}
          placeholder={mode === "clarify" ? "Что спросить у бригадира" : "Что не так"}
          className="mt-1 block min-h-[72px] w-full resize-none rounded-[14px] bg-surface px-3 py-3 text-[16px] leading-6 text-text focus-ring"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] leading-5 text-danger">
          {error}
        </p>
      ) : null}

      {sheet ? (
        <Floating bottom={floatingBottom}>
          <div className="flex items-center gap-2 rounded-[30px] bg-surface p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.28)] ring-1 ring-line">
            {buttons}
          </div>
        </Floating>
      ) : (
        <div className="mt-4 flex items-center gap-2">{buttons}</div>
      )}
    </section>
  );
}
