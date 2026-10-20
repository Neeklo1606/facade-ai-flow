import { createFileRoute } from "@tanstack/react-router";
import { QuestionsScreen } from "@/components/gas-ops/start/QuestionsScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Вопросы к согласованию (ADR-044, F7): рабочий лист встречи с заказчиком */
export const Route = createFileRoute("/gas/questions")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Вопросы к согласованию") }] },
      gasTitle("Вопросы к согласованию"),
      "Десять открытых вопросов к заказчику в порядке важности для расчёта.",
    ),
  component: QuestionsScreen,
});
