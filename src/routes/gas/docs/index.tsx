import { createFileRoute } from "@tanstack/react-router";
import { DocsScreen } from "@/components/gas-ops/docs/DocsScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Документы» ПТО (ADR-058): пакет актов, комплектность, статусы */
export const Route = createFileRoute("/gas/docs/")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Документы") }] },
      gasTitle("Документы"),
      "Пакет актов по подтверждённым работам, комплектность и статусы исполнительной документации.",
    ),
  component: DocsScreen,
});
