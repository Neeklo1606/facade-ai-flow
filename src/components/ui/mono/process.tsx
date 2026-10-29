/**
 * Процесс и состояния «Монохрома» (ADR-055, S3): шаги процесса, история изменений с причинами,
 * пустое состояние, скелетон, ошибка, отметка «Сохранено на телефоне / Принято сервером»,
 * тост с отменой и подтверждение только для необратимого.
 */
import { AlertTriangle, Check, CloudCheck, Smartphone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
import { notify } from "@/components/ui/kit/toast";
import { cn } from "@/lib/utils";
import { Button } from "./controls";

/* ---------------------------------------------------------------- Stepper */

export interface Step {
  key: string;
  label: string;
  /** Кто или когда: «Менеджер, 03.10 17:05» */
  note?: string;
  state: "done" | "current" | "todo";
}

/** Шаги процесса: «Внесено → Проверено → В отчёте». Текущий шаг назван словами, не цветом */
export function Stepper({ steps, label }: { steps: readonly Step[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-0 lg:flex-row lg:gap-4">
      {steps.map((step, i) => (
        <li
          key={step.key}
          aria-current={step.state === "current" ? "step" : undefined}
          className="flex min-w-0 flex-1 items-start gap-3 lg:flex-col"
        >
          <div className="flex items-center gap-3 lg:w-full">
            <span
              aria-hidden
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full type-small font-semibold",
                step.state === "done" && "bg-inverse text-on-inverse",
                step.state === "current" && "bg-card text-ink shadow-[inset_0_0_0_2px_var(--ink)]",
                step.state === "todo" && "bg-panel-2 text-ink-3",
              )}
            >
              {step.state === "done" ? <Check className="size-4" /> : i + 1}
            </span>
            {i < steps.length - 1 ? (
              <span aria-hidden className="hidden h-px flex-1 bg-line lg:block" />
            ) : null}
          </div>
          <div className="min-w-0 pb-4 lg:pb-0">
            <p className={cn("type-label", step.state === "todo" ? "text-ink-3" : "text-ink")}>
              {step.label}
              <span className="sr-only">
                {step.state === "done"
                  ? ", готово"
                  : step.state === "current"
                    ? ", сейчас"
                    : ", впереди"}
              </span>
            </p>
            {step.note ? <p className="type-small text-ink-3">{step.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- Timeline */

export interface TimelineEvent {
  id: string;
  /** «03.10, 17:05» */
  at: string;
  who: string;
  what: string;
  /** Причина изменения: без неё правка не показывается как решённая */
  reason?: string | null;
  /** Было → стало: «14:00 → 14:30» */
  change?: string | null;
}

/** История изменений с причинами: свежие сверху, у каждой правки — кто, когда и почему */
export function Timeline({ events, label }: { events: readonly TimelineEvent[]; label: string }) {
  return (
    <ol aria-label={label} className="relative flex flex-col gap-4 ps-6">
      <span aria-hidden className="absolute inset-y-1 start-2 w-px bg-line" />
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            aria-hidden
            className="absolute -start-6 top-1.5 size-2.5 translate-x-[3px] rounded-full bg-ink"
          />
          <p className="type-small text-ink-3">
            {event.at} · {event.who}
          </p>
          <p className="type-text">{event.what}</p>
          {event.change ? <p className="type-label text-ink-2 tnum">{event.change}</p> : null}
          {event.reason ? (
            <p className="mt-1 mono-inset py-2 type-label text-ink-2">Причина: {event.reason}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- Состояния */

/** Пустое состояние: что здесь будет и одно действие, без иллюстраций */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mono-card flex flex-col items-center gap-3 py-10 text-center">
      {Icon ? (
        <span className="grid size-12 place-items-center rounded-full bg-panel-2 text-ink-2">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="type-card">{title}</p>
      {text ? <p className="max-w-md type-text text-ink-2">{text}</p> : null}
      {action}
    </div>
  );
}

/** Скелетон: тихое мерцание, размеры как у будущего содержимого (без сдвига при загрузке) */
export function Skeleton({
  lines = 3,
  label = "Загрузка",
  card = true,
}: {
  lines?: number;
  label?: string;
  card?: boolean;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("flex flex-col gap-3", card && "mono-card")}
    >
      <span className="shimmer h-5 w-1/3 rounded-pill bg-panel-2" />
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="shimmer h-4 rounded-pill bg-panel-2"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/** Ошибка: что не загрузилось и «Повторить»; данные экрана не теряются */
export function ErrorState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mono-card flex flex-col items-start gap-3">
      <p className="flex items-center gap-2 type-card">
        <AlertTriangle className="size-5 text-down" aria-hidden />
        Не удалось загрузить {what}
      </p>
      <p className="type-text text-ink-2">Проверьте сеть. Введённое на экране сохранено.</p>
      <Button variant="secondary" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}

/**
 * Где сейчас запись (поле без сети): «Сохранено на телефоне» — ещё не отправлено,
 * «Принято сервером» — получено. Не путать с «Проверено человеком»
 */
export function OfflineBadge({ state }: { state: "local" | "server" }) {
  const local = state === "local";
  const Icon = local ? Smartphone : CloudCheck;
  return (
    <span
      role="status"
      className={cn("mono-chip", local ? "bg-caution-bg text-caution" : "bg-up-bg text-up")}
    >
      <Icon aria-hidden />
      {local ? "Сохранено на телефоне" : "Принято сервером"}
    </span>
  );
}

/* ---------------------------------------------------------------- Тост и подтверждение */

/**
 * Обратимое действие выполняется сразу, тост 6 секунд с «Отменить» (CLAUDE.md, «Отмена
 * вместо подтверждения»). Диалог подтверждения — только для необратимого: ConfirmDialog
 */
export function toastUndo(text: string, undo: () => void) {
  return notify(text, { undo });
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  confirm,
  onConfirm,
  cancel = "Оставить",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Что именно пропадёт: необратимость называется словами */
  text: string;
  /** Глагол действия: «Удалить», «Сбросить» */
  confirm: string;
  onConfirm: () => void;
  cancel?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-surface border-0 bg-card shadow-floating">
        <AlertDialogHeader>
          <AlertDialogTitle className="type-card">{title}</AlertDialogTitle>
          <AlertDialogDescription className="type-text text-ink-2">{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="mono-btn mono-btn-secondary">{cancel}</AlertDialogCancel>
          <AlertDialogAction className="mono-btn mono-btn-danger" onClick={onConfirm}>
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
