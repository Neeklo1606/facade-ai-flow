/**
 * Общие части экранов контура газа (ADR-044, F2; вид ADR-045, 4.19): подсказка первого
 * визита, граница договора одной строкой и тихая легенда «Факт / Демо».
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HintRow } from "@/components/ui/kit/states";
import { gasScreen, type GasScreenKey } from "@/lib/gas-ops/screens";
import { cn } from "@/lib/utils";
import { useGasContour } from "@/lib/gas-ops/contour";

/**
 * Подсказка первого визита (ADR-055, S2 п. 5): шаги экрана карточкой один раз, «Понятно»
 * убирает её. Дальше шаги в «?» плавающей панели, полная инструкция на /gas/guide.
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
            className="inline-flex min-h-11 items-center px-2 text-meta-strong underline underline-offset-4 focus-ring"
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
  // «Вне договора v1.0» это граница договора газового заказчика: в публичном контуре «Развитие»
  const client = useGasContour().kind === "client";
  return (
    <p className="mb-block flex flex-wrap items-center gap-2 text-meta text-text-3">
      <span className="inline-flex h-chip items-center rounded-full bg-surface-2 px-2 text-meta-strong text-text-2">
        {client ? "Вне договора v1.0" : "Развитие"}
      </span>
      {children ?? "Показываем, как система может развиваться."}
    </p>
  );
}

/** Тихая легенда источника данных: серые подписи, без цветных плашек (F5, п. 2) */
export function SourceLegend() {
  const { kind, brand } = useGasContour();
  return (
    <p className="mb-block text-meta text-text-3">
      {kind === "client" ? (
        <>
          <span className="font-medium text-text-2">Факт</span>: из вашего отчёта за{" "}
          {brand.periodLabel}, ФИО и адреса обезличены.{" "}
        </>
      ) : (
        <>
          <span className="font-medium text-text-2">Пример</span>: вымышленная неделя подрядчика в
          структуре настоящего отчёта.{" "}
        </>
      )}
      <span className="font-medium text-text-2">Демо</span>: добавлено для показа сценариев.
    </p>
  );
}

/** Заголовок секции внутри экрана: шапка экрана остаётся единственным h1 */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 flex-wrap items-end justify-between gap-x-3">
      <h2 className="min-w-0 text-heading">{children}</h2>
      {aside}
    </div>
  );
}
