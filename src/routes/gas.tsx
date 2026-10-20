import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { GAS_BRAND } from "@/lib/gas-ops/brand";

/**
 * Рабочий контур «Учёт выработки бригад» (ADR-043, ADR-044): фактическое время бригад
 * из бота, проверка человеком и недельный отчёт в структуре Excel заказчика.
 *
 * Оболочку контура рисует корень приложения (`GasShell`): своё меню, шапка и нижняя панель,
 * без персон и меню ГАЙКИ. Здесь только общий заголовок вкладки.
 */
export const Route = createFileRoute("/gas")({
  head: () =>
    completePageHead(
      { meta: [{ title: `${GAS_BRAND.product} — ${GAS_BRAND.clientShort}` }] },
      `${GAS_BRAND.product} — ${GAS_BRAND.clientShort}`,
      "Бригадир отмечает время в MAX, менеджер проверяет, система считает выработку и собирает недельный отчёт.",
    ),
  component: Outlet,
});
