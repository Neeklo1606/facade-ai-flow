import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardCheck, Coins, UsersRound } from "lucide-react";
import { ScreenHint } from "@/components/gas-ops/page";
import { gasTitle } from "@/lib/gas-ops/brand";
import { useGasBrand } from "@/lib/gas-ops/contour";
import { BarList, ColumnChart, KpiStrip, Panel, ProgressStack } from "@/components/ui/kit/charts";
import { useGasOverview } from "@/api/gas-overview";

/**
 * Обзор (ADR-052): стартовый экран руководителя и итог недели для менеджера. Полоса
 * показателей со спарклайнами по дням, панели с плиткой иконки и выводом в подвале.
 * Числа из подтверждённых записей, те же, что в отчёте. Плана недели в данных нет:
 * рядом с суммой метка «План не задан», а не придуманный процент выполнения.
 */
export const Route = createFileRoute("/gas/overview")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Обзор") }] },
      gasTitle("Обзор"),
      "Выработка бригад за неделю: начислено, часы, доходность, что ждёт решения.",
    ),
  component: OverviewPage,
});

function OverviewPage() {
  const brand = useGasBrand();
  const o = useGasOverview();
  return (
    <div className="flex flex-col gap-section">
      <ScreenHint screen="summary" className="mb-0" />

      <KpiStrip
        label="Показатели недели"
        items={[
          {
            label: "Начислено",
            value: <span data-testid="summary-amount">{o.kpis.amount.value}</span>,
            trend: o.kpis.amount.trend,
            series: "mint",
            note: "План не задан",
          },
          {
            label: "Эффективное время",
            value: o.kpis.hours.value,
            trend: o.kpis.hours.trend,
            series: "sky",
            note: "от минут",
          },
          {
            label: "Доходность часа",
            value: o.kpis.rate.value,
            trend: o.kpis.rate.trend,
            series: "lavender",
            note: brand.periodLabel,
          },
          {
            label: "Ждут решения",
            value: o.kpis.waiting.value,
            note: o.kpis.waiting.note,
          },
        ]}
      />

      <div className="grid gap-block lg:grid-cols-2">
        <Panel
          icon={CalendarDays}
          title="Начислено по дням"
          footer={o.bestDay ? `Больше всего: ${o.bestDay}` : "Подтверждённых записей нет"}
        >
          <ColumnChart
            columns={o.days}
            series="sky"
            label="Начислено по дням недели, тысячи рублей"
          />
        </Panel>

        <Panel
          icon={ClipboardCheck}
          title="Записи по статусам"
          action={
            <Link to="/gas/moderation" className="text-meta-strong text-accent-text focus-ring">
              Проверка
            </Link>
          }
          footer={`Всего записей: ${o.statusTotal}`}
        >
          <ProgressStack parts={o.statuses} label="Записи по статусам" />
        </Panel>

        <Panel
          icon={UsersRound}
          title="Бригады по начислению"
          footer="Подтверждённые записи недели, первые шесть"
        >
          <BarList items={o.brigades} series="mint" empty="Подтверждённых начислений нет" />
        </Panel>

        <Panel
          icon={Coins}
          title="Стоимость работ объектов"
          action={
            <Link to="/gas/estimates" className="text-meta-strong text-accent-text focus-ring">
              Сметы
            </Link>
          }
          footer="Без стоимости запись подтверждается без суммы и доходность не считается"
        >
          <ProgressStack parts={o.costs} label="Стоимость работ объектов" />
        </Panel>
      </div>
    </div>
  );
}
