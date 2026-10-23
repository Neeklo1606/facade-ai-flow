import { createFileRoute } from "@tanstack/react-router";
import { ListStateGate } from "@/components/ui/kit/state-gate";
import { MoreScreen } from "@/components/layout/MoreScreen";
import { completePageHead } from "@/lib/page-head";

/** Вкладка «Ещё» телефона (ADR-048): разделы вне панели, создание, показ, тема, роль */
export const Route = createFileRoute("/more")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Ещё · гайка" }] },
      "Ещё · гайка",
      "Разделы, тема, смена роли и показ.",
    ),
  component: () => (
    <ListStateGate what="разделы">
      <MoreScreen />
    </ListStateGate>
  ),
});
