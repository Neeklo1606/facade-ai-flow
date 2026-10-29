import { createFileRoute } from "@tanstack/react-router";
import { WeekScreen } from "@/components/gas-ops/week/WeekScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Неделя» руководителя (ADR-056, 5): что мешает закрыть, итог и версии */
export const Route = createFileRoute("/gas/week")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Неделя") }] },
      gasTitle("Неделя"),
      "Итог недели, причины до закрытия и версии отчёта: v1 после закрытия, v2 после переоткрытия.",
    ),
  component: WeekScreen,
});
