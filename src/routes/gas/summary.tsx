import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, Building2, ClipboardCheck, Clock, HardHat, TriangleAlert } from "lucide-react";
import { MetricStrip } from "@/components/common/MetricStrip";
import { WidgetCard, WidgetCardHeader } from "@/components/common/WidgetCard";
import { WidgetTable, type WidgetColumn } from "@/components/common/WidgetTable";
import { GrowthLine, ScreenHint, SourceLegend } from "@/components/gas-ops/page";
import { GAS_BRAND, gasTitle } from "@/lib/gas-ops/brand";
import {
  EntryStatusBadge,
  HoursCell,
  MoneyCell,
  Num,
  RateCell,
  SourceMark,
} from "@/components/gas-ops/marks";
import { Button } from "@/components/ui/button";
import { fmtHours, fmtRate, fmtRub, useGasDashboard, useGasQueue } from "@/api/gas-ops";
import { fmtDate } from "@/lib/format";

/**
 * Сводка направления. По ТЗ v1.0 дашборд в договор не входит: экран помечен как развитие.
 * Числа считаются из подтверждённых записей — те же, что в недельном отчёте.
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

  const columns: WidgetColumn<{
    id: string;
    number: string;
    day: string;
    brigade: string;
    object: string;
    minutes: number;
    amountRub: number | null;
    status: "draft" | "pending" | "confirmed" | "rejected" | "clarify";
    source: "fact-report" | "mock";
  }>[] = [
    {
      key: "number",
      header: "Номер и дата",
      cell: (row) => (
        <span className="whitespace-nowrap">
          <Num className="block">{row.number}</Num>
          <Num className="block text-text-3">{fmtDate(row.day)}</Num>
        </span>
      ),
    },
    {
      key: "object",
      header: "Объект и бригада",
      cell: (row) => (
        <span className="block min-w-[200px]">
          <span className="block">{row.object}</span>
          <span className="block text-text-3">{row.brigade}</span>
        </span>
      ),
    },
    {
      key: "hours",
      header: "Время",
      align: "right",
      cell: (row) => <HoursCell minutes={row.minutes} />,
    },
    {
      key: "amount",
      header: "Сумма",
      align: "right",
      cell: (row) => <MoneyCell value={row.amountRub} />,
    },
    {
      key: "status",
      header: "Статус",
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <EntryStatusBadge status={row.status} />
          <SourceMark source={row.source} />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <ScreenHint screen="summary" className="mb-2" />
        <GrowthLine />
        <SourceLegend />
      </div>

      {/*
        Главная цифра экрана: начислено за неделю, крупно на тёплом поле с шаром (визуал v3).
        Три числа поменьше рядом. Сумма недели читается целиком, без многоточия.
      */}
      <section aria-label="Выработка за неделю" className="grid gap-3 lg:grid-cols-3">
        <article className="hero-field flex min-w-0 flex-col justify-between gap-6 p-6 sm:p-8 lg:col-span-2 lg:row-span-3">
          <span aria-hidden className="orb -top-20 -left-16 size-[300px] sm:size-[380px]" />
          <span className="flex items-center gap-2 text-[14px] text-text-2">
            <Banknote className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            Начислено за неделю
          </span>
          <div>
            <p className="text-hero-num break-words" data-testid="summary-amount">
              {fmtRub(metrics.totals.amountRub)}
            </p>
            <p className="mt-3 text-[14px] leading-5 text-text-2">
              Только подтверждённые записи за {GAS_BRAND.periodLabel}. Те же числа, что в недельном
              отчёте.
            </p>
          </div>
        </article>
        {[
          {
            icon: Clock,
            label: "Эффективное время",
            value: fmtHours(metrics.totals.hours),
            note: "считается от минут, не от округлённых часов",
          },
          {
            icon: HardHat,
            label: "Доходность часа",
            value: fmtRate(metrics.totals.revenuePerHour),
            note: "сумма за неделю, делённая на часы",
          },
          {
            icon: ClipboardCheck,
            label: "Ждут проверки",
            value: String(metrics.pending),
            note:
              metrics.clarify > 0 ? `и ${metrics.clarify} на уточнении` : "очередь проверки пуста",
          },
        ].map((item) => (
          <article key={item.label} className="card-v3 flex min-w-0 flex-col gap-1 p-5">
            <span className="flex items-center gap-2 text-[13px] text-text-3">
              <item.icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              {item.label}
            </span>
            <span className="tnum text-[28px] leading-[34px] font-semibold tracking-[-0.02em] break-words">
              {item.value}
            </span>
            <span className="text-[12px] text-text-3">{item.note}</span>
          </article>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <WidgetCard className="card-v3 border-0">
          <WidgetCardHeader
            icon={Clock}
            title="По дням недели"
            hint="Подтверждённые начисления и эффективное время"
            level={2}
          />
          <ul className="mt-4 flex flex-col gap-1">
            {metrics.byDay.map((day) => (
              <li key={day.day}>
                <Link
                  to="/gas/entries"
                  className="-mx-2 flex min-h-12 items-center gap-3 rounded-[var(--r-sm)] px-2 focus-ring is-hover:bg-surface-2"
                >
                  <span className="w-24 shrink-0 text-[13px] text-text-2 tabular-nums">
                    {fmtDate(day.day)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-orange"
                      style={{ width: `${Math.round((day.amountRub / maxAmount) * 100)}%` }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right text-[13px] tabular-nums">
                    {day.amountRub === 0 ? "—" : fmtRub(day.amountRub)}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-[13px] text-text-3 tabular-nums sm:block">
                    {day.minutes === 0 ? "—" : fmtHours(day.minutes / 60)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {/* Итог недели той же строкой: он и есть то, ради чего смотрят на дни */}
          <p className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[13px]">
            <span className="w-24 shrink-0 text-text-2">Неделя</span>
            <span className="flex-1" />
            <span className="w-28 shrink-0 text-right font-medium tabular-nums">
              {fmtRub(metrics.totals.amountRub)}
            </span>
            <span className="hidden w-24 shrink-0 text-right tabular-nums sm:block">
              {fmtHours(metrics.totals.hours)}
            </span>
          </p>
        </WidgetCard>

        <WidgetCard className="card-v3 border-0">
          <WidgetCardHeader
            icon={Building2}
            title="Что в работе"
            hint="Активные бригады и объекты недели"
            level={2}
          />
          <dl className="mt-4 grid grid-cols-2 gap-4">
            {[
              { label: "Бригад с выработкой", value: String(metrics.activeBrigades) },
              { label: "Объектов в неделе", value: String(metrics.activeObjects) },
              {
                label: "Записей без суммы",
                value: String(metrics.withoutAmount),
                note: "часы есть, доходность не считается",
              },
              {
                label: "Записей с признаками",
                value: String(metrics.flagged),
                note: "дубль, пересечение, аномалия",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-[var(--r-sm)] bg-surface-2 p-4">
                <dt className="text-[13px] text-text-3">{item.label}</dt>
                <dd className="mt-1 text-[22px] leading-tight font-medium tabular-nums">
                  {item.value}
                </dd>
                {item.note && <p className="mt-1 text-[12px] text-text-3">{item.note}</p>}
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2 text-[13px] text-text-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <span>
              Строка «Итого» в файле заказчика больше суммы видимых строк: в выгрузку не попали два
              подразделения. Система считает по тому, что видит, и расхождение вынесено в вопрос
              заказчику.
            </span>
          </p>
        </WidgetCard>
      </div>

      <WidgetCard className="card-v3 border-0">
        <WidgetCardHeader
          icon={ClipboardCheck}
          title="Ждут проверки"
          hint="Записи, по которым нужно решение человека"
          level={2}
          aside={
            <Button asChild variant="outline" size="sm">
              <Link to="/gas/moderation">В очередь проверки</Link>
            </Button>
          }
        />
        <div className="mt-4">
          {pending.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-3">
              Очередь пуста: все записи проверены.
            </p>
          ) : (
            <WidgetTable
              columns={columns}
              rows={pending.map((view) => ({
                id: view.entry.id,
                number: view.entry.number,
                day: view.entry.day,
                brigade: view.brigade?.name ?? "—",
                object: view.object?.label ?? "—",
                minutes: view.entry.minutes,
                amountRub: view.entry.amountRub,
                status: view.entry.status,
                source: view.entry.source,
              }))}
            />
          )}
        </div>
      </WidgetCard>

      <p className="text-[13px] text-text-3">
        Доходность недели: {fmtRate(metrics.totals.revenuePerHour)}. Считается от суммы минут, а не
        как среднее по строкам: среднее завысило бы короткие дорогие работы.
      </p>
    </div>
  );
}
