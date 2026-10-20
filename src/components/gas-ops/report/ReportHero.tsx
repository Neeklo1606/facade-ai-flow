/**
 * Итог недели крупно над таблицей (визуал v3: `hero-field` и `text-hero-num`).
 * Одна главная вещь экрана — сумма недели; часы, доходность и записи тише.
 * Здесь же главная кнопка экрана «Выгрузить Excel».
 */
import { Download } from "lucide-react";
import { fmtHours, fmtRate, fmtRub, type ReportRow } from "@/api/gas-ops";
import { GAS_BRAND } from "@/lib/gas-ops/brand";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hasValue, tripleText } from "./cell-text";

export function ReportHero({
  total,
  count,
  preliminary,
  day,
  busy,
  onExport,
}: {
  total: ReportRow | null;
  count: number;
  preliminary: boolean;
  /** Выбранный день: его итог одной строкой под главной цифрой */
  day: { label: string; cell: ReportRow["total"] } | null;
  busy: boolean;
  onExport: () => void;
}) {
  const week = total?.total ?? { amountRub: null, minutes: null, revenue: null };
  return (
    <section
      aria-labelledby="report-total"
      className="hero-field px-5 pt-5 pb-5 md:px-8 md:pt-7 md:pb-7"
    >
      <span aria-hidden className="orb -top-16 left-10 size-56 md:left-24" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 id="report-total" className="text-[14px] leading-5 font-medium text-text-2">
            Итог недели {GAS_BRAND.periodLabel}
            <span className="block text-text-3 sm:inline">
              <span className="hidden sm:inline">{" · "}</span>
              {preliminary ? "предварительный" : "только подтверждённые"}
            </span>
          </h2>
          <p className="mt-2 text-hero-num" data-testid="report-total-amount">
            {fmtRub(week.amountRub ?? 0)}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px] leading-6">
            <Stat label="Часы" value={fmtHours((week.minutes ?? 0) / 60)} />
            <Stat label="Доходность" value={fmtRate(week.revenue)} />
            <Stat
              label="Записей"
              value={`${count} ${plural(count, "запись", "записи", "записей")}`}
              hideLabel
            />
          </dl>
          {day ? (
            <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] px-3 py-1.5 text-[13px] text-text-2 tnum">
              <span className="font-medium text-text">{day.label}</span>
              {hasValue(day.cell) ? tripleText(day.cell) : "нет значений"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          data-tour="export"
          disabled={busy}
          onClick={onExport}
          className={cn("pill-action w-full shrink-0 focus-ring lg:w-auto", busy && "opacity-60")}
        >
          <Download className="size-5" aria-hidden />
          {busy ? "Готовлю файл" : "Выгрузить Excel"}
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value, hideLabel }: { label: string; value: string; hideLabel?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className={cn("text-text-3", hideLabel && "sr-only")}>{label}</dt>
      <dd className="font-semibold tnum">{value}</dd>
    </div>
  );
}
