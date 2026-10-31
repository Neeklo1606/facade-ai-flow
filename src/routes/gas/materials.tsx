import { createFileRoute } from "@tanstack/react-router";
import { MaterialsScreen } from "@/components/gas-ops/supply/MaterialsScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Материалы» ПТО (ADR-057): принятые материалы с сертификатами */
export const Route = createFileRoute("/gas/materials")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Материалы") }] },
      gasTitle("Материалы"),
      "Принятые на объектах материалы с сертификатами для исполнительной документации.",
    ),
  component: MaterialsScreen,
});
