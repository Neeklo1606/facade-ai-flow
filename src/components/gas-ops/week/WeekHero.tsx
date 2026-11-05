/**
 * Главная карточка «Недели» в теме «Газ v4» (ADR-065): начислено крупной цифрой со счётом,
 * что мешает одной строкой, три показателя и начисление по дням. Цифры только из данных
 * недели: принятые записи, без предварительных сумм (инвариант 1, ADR-056).
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { fmtManHours, fmtRub, type GasWeekView } from "@/api/gas-ops";
import { useCountUp, useFirstReveal } from "@/hooks/use-first-reveal";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAY = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function weekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return WEEKDAY[d.getDay()] ?? "";
}

function shortRub(value: number): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (value >= 1000) return `${Math.round(value / 1000).toLocaleString("ru-RU")} тыс.`;
  return value.toLocaleString("ru-RU");
}

export function WeekHero({ view, today }: { view: GasWeekView; today: string }) {
  const { metrics } = view;
  const reveal = useFirstReveal("gas-week-hero");
  const accrued = useCountUp(metrics.accruedRub, reveal);
  const [day, setDay] = useState<string | null>(null);
  // Столбики растут один раз после первой отрисовки; без анимации сразу во всю высоту
  const [grown, setGrown] = useState(!reveal);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const max = Math.max(1, ...view.byDay.map((d) => d.value ?? 0));
  const picked = view.byDay.find((d) => d.day === day) ?? null;
  const waiting = metrics.pending + metrics.clarify;

  const stats = [
    { label: "Часы", value: fmtManHours(metrics.minutes, "ч") },
    {
      label: "За час",
      value: metrics.outputPerHour === null ? "нет часов" : `${fmtRub(metrics.outputPerHour)}/ч`,
    },
    { label: "Принято", value: String(metrics.confirmed) },
  ];

  return (
    <section
      aria-label="Итог недели"
      data-testid="week-hero"
      className="hero-gas flex flex-col gap-5 p-5 lg:p-8"
    >
      <span aria-hidden className="orb-gas -top-20 -right-10 size-72 lg:right-24" />
      <div className="flex flex-col gap-1">
        <p className="type-label text-on-hero-2">Начислено за неделю, только принятые</p>
        <p className="type-hero-gas" data-testid="week-hero-sum">
          {fmtRub(Math.round(accrued))}
        </p>
      </div>

      {waiting > 0 ? (
        <Link
          to="/gas/moderation"
          className="inline-flex w-fit min-h-11 items-center gap-2 rounded-pill bg-flame px-4 type-label text-on-flame focus-ring"
        >
          {waiting} {plural(waiting, "запись ждёт", "записи ждут", "записей ждут")} решения
          менеджера
        </Link>
      ) : (
        <p className="type-label text-on-hero-2">Все записи недели проверены</p>
      )}

      <dl className="grid grid-cols-3 gap-3 border-t border-line pt-5">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate type-small text-on-hero-2">{s.label}</dt>
            <dd className="mt-1 truncate type-card tnum">{s.value}</dd>
          </div>
        ))}
      </dl>

      {view.byDay.length ? (
        <div className="flex flex-col gap-3">
          <div
            className="flex h-36 items-end gap-1 lg:gap-4"
            role="group"
            aria-label="Начислено по дням"
          >
            {view.byDay.map((d) => {
              const value = d.value ?? 0;
              const active = day === d.day;
              const isToday = d.day === today;
              return (
                <button
                  key={d.day}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${weekday(d.day)}: ${d.value === null ? "записей нет" : fmtRub(value)}`}
                  onClick={() => setDay(active ? null : d.day)}
                  className="flex h-full flex-1 flex-col justify-end focus-ring"
                >
                  <span
                    className={cn(
                      "bar-gas block w-full",
                      active ? "bg-flame" : isToday ? "bg-on-hero" : "bg-on-hero-2 opacity-40",
                    )}
                    style={{ "--bar": `${grown ? (value / max) * 100 : 0}%` } as CSSProperties}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 lg:gap-4">
            {view.byDay.map((d) => (
              <span
                key={d.day}
                className={cn(
                  "flex-1 text-center type-small",
                  d.day === today || d.day === day
                    ? "font-semibold text-on-hero"
                    : "text-on-hero-2",
                )}
              >
                {weekday(d.day)}
              </span>
            ))}
          </div>
          <p className="type-small text-on-hero-2" aria-live="polite">
            {picked
              ? `${weekday(picked.day)}: ${picked.value === null ? "записей нет" : fmtRub(picked.value)}`
              : `Лучший день: ${shortRub(max)} ₽. Нажмите на столбик, чтобы увидеть сумму.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
