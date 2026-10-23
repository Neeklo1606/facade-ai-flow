import { completePageHead } from "@/lib/page-head";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { GAS_PRODUCT, type GasContourPayload } from "@/lib/gas-ops/contour";
import { gasContourFn } from "@/api/gas-contour";

/**
 * Рабочий контур «Учёт выработки бригад» (ADR-043, ADR-044): фактическое время бригад
 * из бота, проверка человеком и недельный отчёт в структуре Excel заказчика.
 *
 * Оболочку контура рисует корень приложения (`GasShell`): своё меню, шапка и нижняя панель,
 * без персон и меню ГАЙКИ. Здесь общий заголовок вкладки и контур данных (ADR-047):
 * публичный «Демо-подрядчик» или личный контур заказчика по личной ссылке. При SSR загрузчик
 * работает на сервере, поэтому заказчик сразу видит своё, а публичный HTML его данных не несёт.
 */
export const Route = createFileRoute("/gas")({
  loader: async (): Promise<GasContourPayload> => {
    try {
      return await gasContourFn();
    } catch {
      // Нет серверной функции (превью без сервера) или сбой: публичный набор работает всегда
      return { kind: "public" };
    }
  },
  // Контур меняется только полной загрузкой по личной ссылке: между экранами /gas не перезапрашиваем
  staleTime: Infinity,
  head: ({ loaderData }) => {
    const title =
      loaderData?.kind === "client"
        ? `${GAS_PRODUCT} — ${loaderData.brand.clientShort}`
        : `${GAS_PRODUCT} — демо`;
    return completePageHead(
      { meta: [{ title }] },
      title,
      "Бригадир отмечает время в мессенджере, менеджер проверяет, система считает выработку и собирает недельный отчёт.",
    );
  },
  component: Outlet,
});
