/**
 * Итог недели одной карточкой над отчётом (ADR-045, 5.7): поверхность уровня 1 без градиента,
 * сумма text-hero (одно главное число экрана), под ней строка «389,08 ч · 4 160 ₽/ч ·
 * 100 записей». Порядок «сначала время» ставит часы главным числом, сумму во вторую строку.
 * «Выгрузить Excel» вторичная 44: подпись меняется на «Готовлю файл...», ширина не прыгает.
 */
import { Download } from "lucide-react";
import { fmtHours, fmtRate, fmtRub, type ReportRow } from "@/api/gas-ops";
import { Button } from "@/components/ui/button";
import { useGasBrand } from "@/lib/gas-ops/contour";
import { useMetricOrder } from "@/lib/gas-ops/report-view";
import { plural } from "@/lib/format";
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
  const brand = useGasBrand();
  const order = useMetricOrder();
  const week = total?.total ?? { amountRub: null, minutes: null, revenue: null };
  const money = fmtRub(week.amountRub ?? 0);
  const hours = fmtHours((week.minutes ?? 0) / 60);
  const records = `${count} ${plural(count, "запись", "записи", "записей")}`;
  return (
    <section aria-labelledby="report-total" className="surface-1 p-card">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 id="report-total" className="text-meta text-text-2">
            Итог недели {brand.periodLabel} ·{" "}
            {preliminary ? "предварительный" : "только подтверждённые"}
          </h2>
          <p className="mt-1 text-hero" data-testid="report-total-amount">
            {order === "time" ? hours : money}
          </p>
          <p className="mt-1 text-body text-text-2 tnum" data-testid="report-total-line">
            {order === "time" ? money : hours} · {fmtRate(week.revenue)} · {records}
          </p>
          {day ? (
            <p className="mt-1 text-meta text-text-2 tnum">
              <span className="text-meta-strong text-text">{day.label}:</span>{" "}
              {hasValue(day.cell) ? tripleText(day.cell, order) : "нет значений"}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          data-tour="export"
          loading={busy}
          loadingText="Готовлю файл..."
          onClick={onExport}
          className="w-full shrink-0 md:w-auto"
        >
          <Download aria-hidden />
          Выгрузить Excel
        </Button>
      </div>
    </section>
  );
}
