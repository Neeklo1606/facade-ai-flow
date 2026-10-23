import { createFileRoute } from "@tanstack/react-router";
import { ListStateGate } from "@/components/ui/kit/state-gate";
import { GasMoreScreen } from "@/components/gas-ops/shell/GasMoreScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Вкладка «Ещё» учёта выработки на телефоне (ADR-048) */
export const Route = createFileRoute("/gas/more")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Ещё") }] },
      gasTitle("Ещё"),
      "Разделы, роль, показ и тема.",
    ),
  component: () => (
    <ListStateGate what="разделы">
      <GasMoreScreen />
    </ListStateGate>
  ),
});
