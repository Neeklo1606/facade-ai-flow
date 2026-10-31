import { createFileRoute } from "@tanstack/react-router";
import { JournalScreen } from "@/components/gas-ops/docs/JournalScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Журнал работ» (ADR-058): черновики записей, ПТО принимает */
export const Route = createFileRoute("/gas/work-journal")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Журнал работ") }] },
      gasTitle("Журнал работ"),
      "Черновики записей общего журнала работ из подтверждённых объёмов.",
    ),
  component: JournalScreen,
});
