import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { GrowthLine, ScreenHint, SourceLegend } from "@/components/gas-ops/page";
import { GAS_BRAND, gasTitle } from "@/lib/gas-ops/brand";
import { EntryStatusBadge } from "@/components/gas-ops/marks";
import { entryLine, fmtShortDay } from "@/components/gas-ops/review/rules";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/kit/data";
import { ListRow } from "@/components/ui/kit/list";
import { fmtHours, fmtRate, fmtRub, useGasDashboard, useGasQueue } from "@/api/gas-ops";

/**
 * Сводка направления. По ТЗ v1.0 дашборд в договор не входит: экран помечен как развитие.
 * Числа считаются из подтверждённых записей — те же, что в недельном отчёте. Вид ADR-045,
 * 5.11: три показателя text-title, четвёртый строкой, «По дням недели» списком,
 * «Требует внимания» строками.
 */
export const Route = createFileRoute("/gas/summary")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Сводка") }] },
      gasTitle("Сводка"),
      "Выработка бригад за неделю: суммы, часы, доходность.",
    ),
  component: GasDashboard,
});

function GasDashboard() {
  const metrics = useGasDashboard();
  const pending = useGasQueue("pending").slice(0, 6);
  const maxAmount = Math.max(1, ...metrics.byDay.map((d) => d.amountRub));
  const LIST = "surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line";

  return (
    <div className="flex flex-col gap-section">
      <div>
        <ScreenHint screen="summary" className="mb-2" />
        <GrowthLine />
        <SourceLegend />
      </div>

      <section aria-label="Выработка за неделю" className="flex flex-col gap-block">
        <div className="grid grid-cols-2 gap-block md:grid-cols-3">
          <MetricCard
            className="col-span-2 md:col-span-1"
            label="Начислено за неделю"
            value={<span data-testid="summary-amount">{fmtRub(metrics.totals.amountRub)}</span>}
            note={`подтверждённые за ${GAS_BRAND.periodLabel}`}
          />
          <MetricCard
            label="Эффективное время"
            value={fmtHours(metrics.totals.hours)}
            note="от минут, не от округлённых часов"
          />
          <MetricCard
            label="Доходность часа"
            value={fmtRate(metrics.totals.revenuePerHour)}
            note="сумма недели, делённая на часы"
          />
        </div>
        <p className="text-body-strong tnum">
          Ждут проверки: {metrics.pending}
          <span className="text-body font-normal text-text-2">
            {metrics.clarify > 0
              ? ` и ${metrics.clarify} на уточнении`
              : ", очередь уточнений пуста"}
          </span>
        </p>
      </section>

      <section aria-labelledby="by-day">
        <h2 id="by-day" className="flex min-h-7 items-center text-heading">
          По дням недели
        </h2>
        <ul className={`${LIST} mt-2`}>
          {metrics.byDay.map((day) => (
            <li key={day.day}>
              <Link
                to="/gas/entries"
                className="flex min-h-row-compact items-center gap-3 px-row focus-ring is-hover:bg-surface-2"
              >
                <span className="w-20 shrink-0 text-body tnum">{fmtShortDay(day.day)}</span>
                <span
                  aria-hidden
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                >
                  <span
                    className="block h-full rounded-full bg-text-3"
                    style={{ width: `${Math.round((day.amountRub / maxAmount) * 100)}%` }}
                  />
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-body-strong tnum">
                    {day.amountRub === 0 ? "—" : fmtRub(day.amountRub)}
                  </span>
                  <span className="block text-meta text-text-3 tnum">
                    {day.minutes === 0 ? "—" : fmtHours(day.minutes / 60)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          <li className="flex min-h-row-compact items-center justify-between gap-3 bg-surface-2 px-row">
            <span className="text-body-strong">Неделя</span>
            <span className="text-right">
              <span className="block text-body-strong tnum">
                {fmtRub(metrics.totals.amountRub)}
              </span>
              <span className="block text-meta text-text-3 tnum">
                {fmtHours(metrics.totals.hours)}
              </span>
            </span>
          </li>
        </ul>
        <p className="mt-2 flex items-start gap-2 text-meta text-text-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          Строка «Итого» в файле заказчика больше суммы видимых строк: в выгрузку не попали два
          подразделения. Система считает по тому, что видит, расхождение вынесено в вопрос
          заказчику.
        </p>
      </section>

      <section aria-labelledby="in-work">
        <h2 id="in-work" className="flex min-h-7 items-center text-heading">
          Что в работе
        </h2>
        <ul className={`${LIST} mt-2`}>
          {[
            { label: "Бригад с выработкой", value: metrics.activeBrigades },
            { label: "Объектов в неделе", value: metrics.activeObjects },
            {
              label: "Записей без суммы",
              value: metrics.withoutAmount,
              note: "часы есть, доходность не считается",
            },
            {
              label: "Записей с признаками",
              value: metrics.flagged,
              note: "дубль, пересечение, аномалия",
            },
          ].map((item) => (
            <li key={item.label}>
              <ListRow compact title={item.label} meta={item.note} value={String(item.value)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="attention">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <h2 id="attention" className="text-heading">
            Требует внимания
          </h2>
          <Button asChild variant="quiet" className="-me-2 px-2">
            <Link to="/gas/moderation">В очередь проверки</Link>
          </Button>
        </div>
        {pending.length === 0 ? (
          <p className="py-4 text-body text-text-3">Очередь пуста: все записи проверены.</p>
        ) : (
          <ul className={`${LIST} mt-2`}>
            {pending.map((view) => (
              <li key={view.entry.id}>
                <ListRow
                  title={view.object?.label ?? "—"}
                  meta={
                    <>
                      <EntryStatusBadge status={view.entry.status} /> · {entryLine(view)}
                    </>
                  }
                  value={view.entry.amountRub === null ? "нет суммы" : fmtRub(view.entry.amountRub)}
                  valueMeta={`${view.entry.number} · ${fmtShortDay(view.entry.day)}`}
                  renderLink={(props) => (
                    <Link to="/gas/moderation" search={{ open: view.entry.id }} {...props} />
                  )}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
