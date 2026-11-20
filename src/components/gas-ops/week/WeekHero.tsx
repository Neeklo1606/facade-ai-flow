/** Компактная сводка факта (ADR-076). Суммы только из принятых записей. */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { fmtManHours, fmtRub, type GasWeekView } from "@/api/gas-ops";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DotNumber, KpiCard, SplitProgress, dotMoney } from "@/components/ui/kit/warm";

const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
function weekday(iso: string): string {
  return WEEKDAY[new Date(`${iso}T12:00:00`).getDay()] ?? "";
}

export function WeekHero({ view, today }: { view: GasWeekView; today: string }) {
  const { metrics } = view;
  const [day, setDay] = useState<string | null>(null);
  const picked = view.byDay.find((d) => d.day === day);
  const waiting = metrics.pending + metrics.clarify;
  const stats = [
    { label: "Начислено за неделю, только принятые", value: fmtRub(metrics.accruedRub) },
    { label: "Часы", value: fmtManHours(metrics.minutes, "ч") },
    {
      label: "За час",
      value: metrics.outputPerHour === null ? "Нет часов" : `${fmtRub(metrics.outputPerHour)}/ч`,
    },
    { label: "Принято", value: String(metrics.confirmed) },
  ];
  return (
    <section
      aria-label="Итог недели"
      data-testid="week-hero"
      className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
    >
      {/* «Тепло»: главная цифра точками на тёплой карточке, полоса принято / ждёт */}
      <KpiCard
        title="Начислено за неделю, только принятые"
        legend={
          <>
            <span>● {metrics.confirmed} принято</span>
            {metrics.pending ? (
              <span>
                <span className="text-warm-accent">●</span> {metrics.pending} ждут
              </span>
            ) : null}
            {metrics.clarify ? (
              <span className="opacity-80">● {metrics.clarify} уточнить</span>
            ) : null}
          </>
        }
        progress={
          <SplitProgress
            label={`Принято ${metrics.confirmed}, ждут ${metrics.pending}, на уточнении ${metrics.clarify}`}
            segments={[
              { value: metrics.confirmed, tone: "light" },
              { value: metrics.pending, tone: "accent" },
              { value: metrics.clarify, tone: "dim" },
            ]}
          />
        }
      >
        <DotNumber {...dotMoney(metrics.accruedRub)} label={fmtRub(metrics.accruedRub)} />
        <span className="mt-2 block text-meta warm-kpi-meta tnum" data-testid="week-hero-sum">
          {fmtRub(metrics.accruedRub)}
        </span>
      </KpiCard>
      <div className="surface-1 flex min-w-0 flex-col">
        <dl className="grid grid-cols-3 gap-3 px-4 pt-4">
          {stats.slice(1).map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="text-meta text-text-2">{stat.label}</dt>
              <dd className="mt-1 text-body-strong tnum sm:text-title">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          {waiting ? (
            <Link to="/gas/moderation" className="mono-btn mono-btn-secondary focus-ring">
              {waiting} {plural(waiting, "запись ждёт", "записи ждут", "записей ждут")} решения
              менеджера
            </Link>
          ) : (
            <p className="text-meta text-ok">Все записи недели проверены</p>
          )}
          <Link to="/gas/tabel" className="mono-btn mono-btn-quiet focus-ring">
            Табель и Excel →
          </Link>
        </div>
        {view.byDay.length ? (
          <div className="border-t border-line px-4 py-3">
            <div role="group" aria-label="Начислено по дням" className="grid grid-cols-3 gap-2">
              {view.byDay.map((d) => (
                <button
                  key={d.day}
                  type="button"
                  aria-pressed={day === d.day}
                  aria-label={`${weekday(d.day)}: ${d.value === null ? "записей нет" : fmtRub(d.value)}`}
                  onClick={() => setDay(day === d.day ? null : d.day)}
                  className={cn(
                    "min-h-12 rounded-control border border-line p-2 text-left focus-ring",
                    day === d.day ? "bg-orange-dim ring-1 ring-orange" : "bg-surface-2",
                  )}
                >
                  <span className="block text-meta text-text-2">
                    {weekday(d.day)} {d.day.slice(8, 10)}.{d.day.slice(5, 7)}
                    {d.day === today ? " · сегодня" : ""}
                  </span>
                  <span className="block text-body-strong tnum">
                    {d.value === null ? "Нет записей" : fmtRub(d.value)}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-meta text-text-3" aria-live="polite">
              {picked
                ? `${weekday(picked.day)}: ${picked.value === null ? "записей нет" : fmtRub(picked.value)}`
                : "Факт по принятым записям. Выберите день для сверки суммы."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
