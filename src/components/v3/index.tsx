/**
 * Приёмы визуала v3 для экранов ГАЙКИ (ADR-044): капсульные вкладки, карточка события
 * с цветной полосой, заголовок секции, капсула подсказки и поле здоровья плитки.
 * Только разметка и классы: данных и логики здесь нет. Утилиты `seg`, `card-v3`, `glass`
 * и токены — из `src/styles.css`.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

import type { V3Tone } from "./classes";

const stripe: Record<V3Tone, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  ok: "bg-ok",
  info: "bg-info",
  neutral: "bg-line-2",
};

const dot: Record<V3Tone, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  ok: "bg-ok",
  info: "bg-info",
  neutral: "bg-text-3",
};

export function ToneDot({ tone, className }: { tone: V3Tone; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot[tone], className)} />;
}

export interface SegTab<T extends string> {
  value: T;
  label: string;
  count?: number | undefined;
}

/**
 * Капсульные вкладки (`seg`): активная залита цветом главной кнопки. Полоса прокручивается
 * пальцем и не обрезается; стрелки переводят выбор, как у обычных вкладок.
 */
export function SegTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  stretch,
  className,
}: {
  tabs: SegTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Подпись набора для чтения с экрана */
  label: string;
  /** На телефоне капсулы делят ширину поровну: короткий набор без прокрутки */
  stretch?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    refs.current[next]?.focus();
    onChange(tab.value);
  };
  return (
    <div
      className={cn(
        "-mx-4 max-w-[calc(100%+32px)] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0",
        className,
      )}
    >
      <div
        role="tablist"
        aria-label={label}
        className={cn("seg", stretch && "flex w-full sm:inline-flex sm:w-auto")}
      >
        {tabs.map((tab, index) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-tour={`tab-${tab.value}`}
              onClick={() => onChange(tab.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "seg-item focus-ring press min-h-12 lg:min-h-10",
                stretch && "flex-1 px-2 sm:flex-none sm:px-4",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? (
                <span
                  className={cn(
                    "text-meta tnum grid h-5 min-w-5 place-items-center rounded-full px-1.5",
                    active ? "bg-pill-text/15" : "bg-surface-3 text-text-2",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Карточка события, как у календаря: цветная полоса слева, заголовок, подпись и время справа.
 * Ссылку на сущность передаёт вызывающий: растянутая ссылка делает карточку нажимаемой целиком.
 */
export function EventCard({
  tone,
  title,
  meta,
  aside,
  footer,
  action,
  className,
}: {
  tone: V3Tone;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  /** Растянутая ссылка или кнопка карточки: последней, поверх содержимого */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card-v3 group relative flex min-w-0 gap-4 px-4 py-4 transition-fast sm:px-5",
        action && "is-hover:bg-surface-2",
        className,
      )}
    >
      <span aria-hidden className={cn("w-1 shrink-0 self-stretch rounded-full", stripe[tone])} />
      <div className="min-w-0 flex-1">
        <div className="text-body-strong font-medium text-text">{title}</div>
        {meta ? <div className="text-meta mt-1 text-text-3">{meta}</div> : null}
        {footer ? <div className="mt-3 flex flex-wrap items-center gap-2">{footer}</div> : null}
      </div>
      {aside ? <div className="text-body tnum shrink-0 text-right text-text-2">{aside}</div> : null}
      {action}
    </div>
  );
}

/** Заголовок секции экрана: h2, рядом число и короткая подсказка тише */
export function SectionTitle({
  children,
  count,
  hint,
  aside,
  className,
}: {
  children: ReactNode;
  count?: number | undefined;
  hint?: string | undefined;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex min-w-0 items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-heading text-text">{children}</h2>
          {count !== undefined ? (
            <span className="text-meta-strong tnum grid h-6 min-w-6 place-items-center rounded-full bg-surface-2 px-2 font-medium text-text-2">
              {count}
            </span>
          ) : null}
        </div>
        {hint ? <p className="text-meta mt-0.5 text-text-3">{hint}</p> : null}
      </div>
      {aside}
    </div>
  );
}

/** Содержимое капсулы подсказки: значок в круге, текст в одну-две строки, стрелка */
export function TipContent({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface">
        <Sparkles className="size-[18px] text-text-2" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="text-body min-w-0 flex-1 text-text">{children}</span>
      <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
    </>
  );
}
