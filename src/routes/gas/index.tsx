import { createFileRoute } from "@tanstack/react-router";
import { StartScreen } from "@/components/gas-ops/start/StartScreen";
import { GAS_BRAND, gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Стартовый экран контура газа (ADR-044, F2, п. 1). Сводка переехала на /gas/summary */
export const Route = createFileRoute("/gas/")({
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle(GAS_BRAND.clientShort) }] },
      gasTitle(GAS_BRAND.clientShort),
      "Бригадир отмечает время в MAX, менеджер проверяет, система считает выработку по смете и собирает недельный отчёт в формате Excel.",
    ),
  component: StartScreen,
});
