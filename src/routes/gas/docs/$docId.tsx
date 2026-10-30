import { createFileRoute } from "@tanstack/react-router";
import { DocScreen } from "@/components/gas-ops/docs/DocScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Редактор акта (ADR-058): поля с источниками, предпросмотр, комплектность, статусы */
export const Route = createFileRoute("/gas/docs/$docId")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Акт") }] },
      gasTitle("Акт"),
      "Поля акта с источником значения, предпросмотр, проверка комплектности и статусы.",
    ),
  component: DocRoute,
});

function DocRoute() {
  const { docId } = Route.useParams();
  return <DocScreen docId={docId} />;
}
