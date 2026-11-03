/**
 * Режим кабинета заказчика (ADR-062, F6): `VITE_CABINET_ONLY=1`. В сборке только учёт
 * времени: любой путь вне /gas ведёт в /gas, нет лендинга, «Показать за 3 минуты», меток
 * «Демо» и «Демо-подрядчика». Название заказчика в коде не лежит: оно приходит переменной
 * сборки `VITE_CABINET_CLIENT` и стоит в заголовке вкладки «Учёт времени · <заказчик>».
 */

/** Через точку: сборка подставляет значение константой и вырезает ветку другого режима */
export const cabinetOnly =
  import.meta.env.VITE_CABINET_ONLY === "1" || import.meta.env.VITE_CABINET_ONLY === "true";

/** Название заказчика из конфигурации сборки; пусто — заголовок без названия */
export const cabinetClient = (import.meta.env.VITE_CABINET_CLIENT ?? "").trim();

export const CABINET_PRODUCT = "Учёт времени";

/** «Учёт времени · ООО …»; без названия — «Учёт времени» */
export function cabinetTitle(client: string = cabinetClient): string {
  return client ? `${CABINET_PRODUCT} · ${client}` : CABINET_PRODUCT;
}

/** Служебные адреса, которые кабинет не перехватывает: серверные функции и файлы */
const PASS = [/^\/api(\/|$)/, /^\/_/, /\.[a-z0-9]+$/i];

/**
 * Куда вести путь в кабинете: null — путь свой (/gas и вложенные, служебные), иначе /gas.
 * Чистая функция: проверяется без сборки
 */
export function cabinetRedirect(pathname: string, enabled: boolean = cabinetOnly): string | null {
  if (!enabled) return null;
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/gas" || path.startsWith("/gas/")) return null;
  if (PASS.some((re) => re.test(path))) return null;
  return "/gas";
}

/** Метки «Демо», «Пример», сброс и показ: в кабинете их нет */
export const showDemoMarks = !cabinetOnly;

/**
 * Плашка «Тестовый режим» (ADR-062, решение владельца 3): личная ссылка и кабинет без
 * сервера держат данные во вкладке.
 */
export function showTestMode(input: {
  dataSource: "demo" | "server";
  contour: "public" | "client";
  cabinet: boolean;
}): boolean {
  return input.dataSource === "demo" && (input.contour === "client" || input.cabinet);
}
