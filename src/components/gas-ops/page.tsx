/**
 * Общие части экранов контура газа (ADR-044, F2; вид ADR-045, 4.19): строка
 * «Как работать с экраном», граница договора одной строкой и тихая легенда «Факт / Демо».
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HintRow } from "@/components/ui/kit/states";
import { gasScreen, type GasScreenKey } from "@/lib/gas-ops/screens";
import { cn } from "@/lib/utils";

/**
 * «Как работать с экраном»: одна строка 44 со стрелкой. При первом посещении экрана
 * раскрыта одной карточкой не выше 120, шаги нумерованным списком; полная инструкция на /gas/guide.
 */
export function ScreenHint({ screen, className }: { screen: GasScreenKey; className?: string }) {
  const info = gasScreen(screen);
  return (
    <div className={cn("mb-block", className)}>
      <HintRow
        id={`gas-${screen}`}
        steps={info.steps}
        more={
          <Link
            to="/gas/guide"
            className="inline-flex min-h-11 items-center text-meta-strong text-orange focus-ring"
          >
            Инструкция
          </Link>
        }
      />
    </div>
  );
}

/** Граница договора: одна строка под заголовком экрана группы «Развитие» (F7) */
export function GrowthLine({ children }: { children?: ReactNode }) {
  return (
    <p className="mb-block flex flex-wrap items-center gap-2 text-meta text-text-3">
      <span className="inline-flex h-chip items-center rounded-full bg-surface-2 px-2 text-meta-strong text-text-2">
        Вне договора v1.0
      </span>
      {children ?? "Показываем, как система может развиваться."}
    </p>
  );
}

/** Тихая легенда источника данных: серые подписи, без цветных плашек (F5, п. 2) */
export function SourceLegend() {
  return (
    <p className="mb-block text-meta text-text-3">
      <span className="font-medium text-text-2">Факт</span> — из отчёта заказчика за
      28.09–03.10.2026, ФИО и адреса обезличены.{" "}
      <span className="font-medium text-text-2">Демо</span> — добавлено для показа сценариев.
    </p>
  );
}

/** Заголовок секции внутри экрана: шапка экрана остаётся единственным h1 */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 items-end justify-between gap-3">
      <h2 className="text-heading">{children}</h2>
      {aside}
    </div>
  );
}
