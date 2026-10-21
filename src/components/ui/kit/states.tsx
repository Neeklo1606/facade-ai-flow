/**
 * Состояния экрана ADR-045 (4.17), работа модели (4.18), подсказка «Как работать с экраном»
 * (4.19). Загрузка показывает каркас и скелетоны без спиннера; если дольше 8 секунд,
 * появляется «Долго грузится. Проверьте связь» и «Повторить».
 */
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Lightbulb, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Скелетоны */

export function SkeletonRows({ rows = 4, label = "Загрузка" }: { rows?: number; label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <ul className="surface-1 overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className="flex min-h-row items-center gap-3 border-b border-line px-row last:border-0"
          >
            <span className="min-w-0 flex-1 space-y-2">
              <span className="skeleton block h-4 w-3/4 rounded-[var(--r-xs)]" />
              <span className="skeleton block h-3 w-1/2 rounded-[var(--r-xs)]" />
            </span>
            <span className="skeleton block h-4 w-16 rounded-[var(--r-xs)]" />
          </li>
        ))}
      </ul>
      {slow ? (
        <div className="mt-block flex items-center justify-between gap-3 text-body text-text-2">
          Долго грузится. Проверьте связь
          <Button variant="outline" onClick={() => window.location.reload()}>
            Повторить
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonCards({ cards = 2 }: { cards?: number }) {
  return (
    <div
      role="status"
      aria-label="Загрузка"
      aria-busy="true"
      className="grid grid-cols-2 gap-block"
    >
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="surface-1 space-y-2 p-card">
          <span className="skeleton block h-3 w-1/2 rounded-[var(--r-xs)]" />
          <span className="skeleton block h-7 w-3/4 rounded-[var(--r-xs)]" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Пусто и ошибка */

/** Иконка 40, заголовок text-heading, одна строка text-body, одна кнопка с действием */
export function EmptyBlock({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-1 flex flex-col items-center px-card py-section text-center">
      <Icon className="size-10 text-text-3" strokeWidth={1.5} aria-hidden />
      <p className="mt-3 text-heading">{title}</p>
      <p className="mt-1 max-w-sm text-body text-text-2">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Что случилось и что сделать, без извинений: «Не удалось загрузить журнал. Повторить» */
export function ErrorBlock({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="surface-1 flex items-center justify-between gap-3 p-card">
      <p className="text-body text-text">{what}</p>
      <Button variant="outline" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}

/** Полоса 32 под шапкой: изменения сохранятся и отправятся позже. В демо помечена имитацией */
export function OfflineBar({ demo = false }: { demo?: boolean }) {
  return (
    <div
      role="status"
      className="flex h-8 items-center gap-2 bg-warn-bg px-gutter text-meta text-warn"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span className="truncate">Нет связи. Изменения сохранятся и отправятся позже</span>
      {demo ? <span className="ms-auto shrink-0 text-text-3">имитация</span> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Работа модели */

export interface Stage {
  label: string;
  state: "done" | "current" | "wait";
}

/** Этапы текстом по строкам: текущий с точкой, завершённые с галочкой, без спиннеров */
export function StageList({
  stages,
  label = "Ход разбора",
}: {
  stages: readonly Stage[];
  label?: string;
}) {
  return (
    <ol aria-label={label} className="flex flex-col gap-2">
      {stages.map((stage) => (
        <li
          key={stage.label}
          aria-current={stage.state === "current" ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 text-body",
            stage.state === "wait" ? "text-text-3" : "text-text",
          )}
        >
          <span aria-hidden className="grid size-5 shrink-0 place-items-center">
            {stage.state === "done" ? (
              <Check className="size-4 text-ok" />
            ) : stage.state === "current" ? (
              <span className="size-2 rounded-full bg-orange motion-safe:animate-pulse" />
            ) : (
              <span className="size-2 rounded-full bg-line-2" />
            )}
          </span>
          {stage.label}
          {stage.state === "done" ? <span className="sr-only">, готово</span> : null}
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- Подсказка экрана */

function seen(key: string): boolean {
  try {
    return localStorage.getItem(`neeklo-hint-${key}`) === "1";
  } catch {
    return true;
  }
}
function markSeen(key: string) {
  try {
    localStorage.setItem(`neeklo-hint-${key}`, "1");
  } catch {
    // без хранилища подсказка просто снова раскроется в следующий раз
  }
}

/**
 * Одна строка 44 «Как работать с экраном» со стрелкой. При первом посещении раскрыта
 * одной карточкой не выше 120: шаги нумерованным списком text-body.
 */
export function HintRow({
  id,
  steps,
  more,
}: {
  id: string;
  steps: readonly string[];
  more?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!seen(id)) {
      setOpen(true);
      markSeen(id);
    }
  }, [id]);
  return (
    <section aria-label="Как работать с экраном">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-control w-full items-center gap-2 text-left text-body text-text-2 focus-ring"
      >
        <Lightbulb className="size-5 shrink-0 text-text-3" aria-hidden />
        <span className="flex-1">Как работать с экраном</span>
        <ChevronDown
          className={cn("size-5 shrink-0 text-text-3 transition-fast", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="surface-1 max-h-30 overflow-y-auto px-card py-2">
          <ol className="list-decimal space-y-1 ps-5 text-body text-text">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {more ? <div>{more}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
