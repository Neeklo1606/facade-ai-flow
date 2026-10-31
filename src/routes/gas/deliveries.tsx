import { createFileRoute } from "@tanstack/react-router";
import { DeliveriesScreen } from "@/components/gas-ops/supply/DeliveriesScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Поставки» снабженца (ADR-057, 4) */
export const Route = createFileRoute("/gas/deliveries")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Поставки") }] },
      gasTitle("Поставки"),
      "Заказанные поставки в пути и принятые на объектах.",
    ),
  component: DeliveriesScreen,
});
