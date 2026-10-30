import { createFileRoute } from "@tanstack/react-router";
import { RequestScreen } from "@/components/gas-ops/supply/RequestScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Деталь заявки снабжения (ADR-057, 4): лимит сметы, предложения, заказ, приёмка */
export const Route = createFileRoute("/gas/supply/$requestId")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Заявка") }] },
      gasTitle("Заявка"),
      "Позиции заявки, сверка с лимитом сметы, сравнение предложений и приёмка на объекте.",
    ),
  component: RequestRoute,
});

function RequestRoute() {
  const { requestId } = Route.useParams();
  return <RequestScreen requestId={requestId} />;
}
