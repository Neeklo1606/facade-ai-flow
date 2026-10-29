import { createFileRoute } from "@tanstack/react-router";
import { DirectoryScreen } from "@/components/gas-ops/directory/DirectoryScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Справочники» (ADR-056, 6): состав, ставки, профиль выгрузки Excel */
export const Route = createFileRoute("/gas/directory")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Справочники") }] },
      gasTitle("Справочники"),
      "Состав бригад с периодами, ставки за час и профиль выгрузки Excel заказчика.",
    ),
  component: DirectoryScreen,
});
