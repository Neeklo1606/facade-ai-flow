import { createFileRoute, Navigate } from "@tanstack/react-router";
import { QuestionsScreen } from "@/components/gas-ops/start/QuestionsScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { useIsClientContour } from "@/lib/gas-ops/contour";
import { completePageHead } from "@/lib/page-head";

/**
 * Вопросы к согласованию (ADR-044, F7): рабочий лист встречи с заказчиком. Только личный
 * контур заказчика (ADR-047): в публичном адрес ведёт на старт показа
 */
export const Route = createFileRoute("/gas/questions")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Вопросы к согласованию") }] },
      gasTitle("Вопросы к согласованию"),
      "Открытые вопросы к заказчику в порядке важности для расчёта.",
    ),
  component: Questions,
});

function Questions() {
  return useIsClientContour() ? <QuestionsScreen /> : <Navigate to="/gas" replace />;
}
