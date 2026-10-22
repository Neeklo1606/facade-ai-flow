import { createFileRoute } from "@tanstack/react-router";
import { StartScreen } from "@/components/gas-ops/start/StartScreen";
import { gasTitle } from "@/lib/gas-ops/brand";
import { completePageHead } from "@/lib/page-head";

/** Стартовый экран контура газа (ADR-044, F2, п. 1). Сводка переехала на /gas/summary */
export const Route = createFileRoute("/gas/")({
  /*
   * С /demo (ADR-047): `start=1` сразу запускает показ с шага 1, `roles=1` открывает выбор роли.
   * Так от лендинга до первого шага два касания (01_SPEC 14)
   */
  validateSearch: (search: Record<string, unknown>): { start?: "1"; roles?: "1" } => ({
    ...(String(search["start"] ?? "") === "1" ? { start: "1" as const } : {}),
    ...(String(search["roles"] ?? "") === "1" ? { roles: "1" as const } : {}),
  }),
  head: () =>
    completePageHead(
      { meta: [{ title: gasTitle("Старт") }] },
      gasTitle("Старт"),
      "Бригадир отмечает время в MAX, менеджер проверяет, система считает выработку по смете и собирает недельный отчёт в формате Excel.",
    ),
  component: StartScreen,
});
