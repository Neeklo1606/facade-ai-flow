import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { GasSectionNav } from "@/components/gas-ops/GasSection";
import { useGasHydration } from "@/api/gas-ops";

/**
 * Раздел «Газ: учёт времени бригад» (ADR-043): фактическое время бригад из бота,
 * проверка человеком и недельный отчёт в структуре Excel заказчика.
 *
 * У раздела своя навигация и свой набор ролей: администратор, менеджер проверки,
 * бригадир, руководитель. Персоны ГАЙКИ он не трогает.
 */
export const Route = createFileRoute("/gas")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Газ: учёт времени — гайка" }] },
      "Газ: учёт времени — гайка",
      "Фактическое время бригад, проверка и недельный отчёт.",
    ),
  component: GasLayout,
});

function GasLayout() {
  // Введённые записи переживают перезагрузку: снимок поднимается после первой отрисовки
  useGasHydration();
  return (
    <div className="pb-10">
      <GasSectionNav />
      <Outlet />
    </div>
  );
}
