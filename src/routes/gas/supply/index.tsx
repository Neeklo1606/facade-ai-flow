import { createFileRoute } from "@tanstack/react-router";
import { RequestsScreen } from "@/components/gas-ops/supply/RequestsScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Заявки» снабженца (ADR-057, 4): стартовый экран роли */
export const Route = createFileRoute("/gas/supply/")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Заявки") }] },
      gasTitle("Заявки"),
      "Заявки снабжения по сроку и приоритету: новые, ждут предложений, в пути, просрочены.",
    ),
  component: RequestsScreen,
});
