import { createFileRoute } from "@tanstack/react-router";
import { FinishScreen } from "@/components/gas-ops/start/FinishScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Финал показа «gas-week» (ADR-044, F3, п. 6) */
export const Route = createFileRoute("/gas/finish")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Готово") }] },
      gasTitle("Готово"),
      "Итог показа: запись бригадира, сумма, минуты, доходность и файл Excel.",
    ),
  component: FinishScreen,
});
