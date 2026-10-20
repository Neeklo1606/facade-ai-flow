/**
 * Общие части экранов контура газа (ADR-044, F2): строка «Что делать здесь», граница
 * договора одной строкой и тихая легенда «Факт / Демо». Заголовок экрана рисует шапка
 * оболочки: один заголовок на экран.
 */
import { ChevronDown, Lightbulb } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { gasScreen, type GasScreenKey } from "@/lib/gas-ops/screens";
import { cn } from "@/lib/utils";

const SEEN_KEY = "neeklo-gas-hint-seen";

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markSeen(key: string) {
  try {
    const seen = new Set(readSeen());
    seen.add(key);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Приватный режим: подсказка раскроется снова после перезагрузки, это не мешает
  }
}

/**
 * «Что делать здесь»: 2–3 шага действием. При первом посещении экрана раскрыта, дальше свёрнута.
 * Состояние раскрытия читается после монтирования: сервер не знает, что видел человек.
 */
export function ScreenHint({ screen, className }: { screen: GasScreenKey; className?: string }) {
  const info = gasScreen(screen);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!readSeen().includes(screen)) {
      setOpen(true);
      markSeen(screen);
    }
  }, [screen]);

  return (
    <section className={cn("mb-4", className)} aria-label="Что делать здесь">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-12 items-center gap-2 rounded-full pe-3 text-[14px] text-text-2 focus-ring is-hover:text-text"
      >
        <span className="grid size-8 place-items-center rounded-full bg-orange-dim text-orange">
          <Lightbulb className="size-4" aria-hidden />
        </span>
        Что делать здесь
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <ol className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {info.steps.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 rounded-[var(--r-lg)] bg-surface px-4 py-3 text-[14px] leading-5"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-text-2 tnum">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/** Граница договора: одна строка под заголовком экрана группы «Развитие» (F7) */
export function GrowthLine({ children }: { children?: ReactNode }) {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 text-[13px] leading-5 text-text-3">
      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-text-2">
        Вне договора v1.0
      </span>
      {children ?? "Показываем, как система может развиваться."}
    </p>
  );
}

/** Тихая легенда источника данных: серые подписи, без цветных плашек (F5, п. 2) */
export function SourceLegend() {
  return (
    <p className="mb-4 text-[13px] leading-5 text-text-3">
      <span className="font-medium text-text-2">Факт</span> — из отчёта заказчика за
      28.09–03.10.2026, ФИО и адреса обезличены.{" "}
      <span className="font-medium text-text-2">Демо</span> — добавлено для показа сценариев.
    </p>
  );
}

/** Заголовок секции внутри экрана: шапка экрана остаётся единственным h1 */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">{children}</h2>
      {aside}
    </div>
  );
}
