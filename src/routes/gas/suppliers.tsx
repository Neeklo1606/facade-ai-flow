import { createFileRoute } from "@tanstack/react-router";
import { SuppliersScreen } from "@/components/gas-ops/supply/SuppliersScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Поставщики» снабженца (ADR-057, 4) */
export const Route = createFileRoute("/gas/suppliers")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Поставщики") }] },
      gasTitle("Поставщики"),
      "Справочник поставщиков с историей предложений, цен и сроков.",
    ),
  component: SuppliersScreen,
});
