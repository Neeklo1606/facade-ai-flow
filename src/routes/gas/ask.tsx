import { createFileRoute } from "@tanstack/react-router";
import { AskScreen } from "@/components/gas-ops/ask/AskScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** «Спросить ГАЙКУ» (ADR-052): ответ по данным недели с источниками */
export const Route = createFileRoute("/gas/ask")({
  // Вопрос из поля в шапке: /gas/ask?q=…, экран задаёт его сам
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" && search["q"].trim()
      ? { q: search["q"].trim().slice(0, 200) }
      : {},
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Спросить ГАЙКУ") }] },
      gasTitle("Спросить ГАЙКУ"),
      "Вопрос обычными словами и ответ с источниками по данным недели.",
    ),
  component: AskScreen,
});
