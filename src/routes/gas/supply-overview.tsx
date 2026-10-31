import { createFileRoute } from "@tanstack/react-router";
import { SupplyOverviewScreen } from "@/components/gas-ops/supply/SupplyOverviewScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Снабжение» руководителя (ADR-057, 4) */
export const Route = createFileRoute("/gas/supply-overview")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Снабжение") }] },
      gasTitle("Снабжение"),
      "Сумма заказов, просрочки к дате и превышения сметы по объектам.",
    ),
  component: SupplyOverviewScreen,
});
