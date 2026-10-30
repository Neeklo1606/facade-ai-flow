import { lazy, Suspense } from "react";
import { MetricCard } from "@/components/ui/mono/surface";
import { chartPoints } from "@/lib/ui/mono-logic";
import { WEEK_SAMPLE, WEEK_TEXT, WEEK_TOTAL_RUB } from "@/lib/site/sample";
import { LANDING } from "@/lib/site/copy";

/**
 * Живой фрагмент первого экрана (ADR-059): показатели и график недели «Демо-подрядчика»
 * теми же компонентами «Монохрома», что в «Неделе» руководителя. Не картинка: текст
 * читается и выделяется. Recharts грузится отдельным куском после первой отрисовки,
 * место под график занято заранее, поэтому вёрстка не прыгает.
 */
const TimeChart = lazy(() =>
  import("@/components/ui/mono/time-chart").then((m) => ({ default: m.TimeChart })),
);

const CHART_HEIGHT = 200;

const points = chartPoints(
  WEEK_SAMPLE.days.map(
    (day, i) => `${day} ${WEEK_SAMPLE.dates[i]!.slice(8, 10)}.${WEEK_SAMPLE.dates[i]!.slice(5, 7)}`,
  ),
  WEEK_SAMPLE.amountRub,
);

export function HeroWeek() {
  return (
    <figure
      className="landing-week mono-card m-0 flex flex-col gap-4"
      aria-label="Пример: неделя в демо"
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="type-card">{LANDING.hero.fragment}</span>
        <span className="type-small text-ink-3 tnum">{WEEK_SAMPLE.period}</span>
      </figcaption>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <MetricCard
          label="Начислено"
          value={WEEK_TOTAL_RUB}
          text={WEEK_TEXT.amount}
          inverse
          revealKey="landing:week:amount"
        />
        <MetricCard
          label="Часы бригад"
          value={WEEK_SAMPLE.confirmedMinutes / 60}
          text={WEEK_TEXT.hours}
          revealKey="landing:week:hours"
        />
      </div>
      <div style={{ height: CHART_HEIGHT }}>
        <Suspense fallback={<div aria-hidden className="h-full rounded-inset bg-panel-2" />}>
          <TimeChart
            label="Подтверждённое начисление по дням недели, демо"
            points={points}
            format={(v) => (v >= 1000 ? `${Math.round(v / 1000)} т` : String(v))}
            compare={false}
            height={CHART_HEIGHT}
            revealKey="landing:week:chart"
          />
        </Suspense>
      </div>
      <p className="type-small text-ink-3">
        Демо-подрядчик, вымышленные данные: {WEEK_SAMPLE.confirmedEntries} подтверждённых записей
      </p>
    </figure>
  );
}
