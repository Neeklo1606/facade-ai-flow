import { createFileRoute } from "@tanstack/react-router";
import { ReadinessScreen } from "@/components/gas-ops/docs/ReadinessScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Готовность ИД руководителя (ADR-058) */
export const Route = createFileRoute("/gas/docs-overview")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Готовность ИД") }] },
      gasTitle("Готовность ИД"),
      "Комплектность исполнительной документации по объектам и блокеры.",
    ),
  component: ReadinessScreen,
});
