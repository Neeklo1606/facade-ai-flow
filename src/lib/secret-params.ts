/**
 * Параметры адреса, которые несут секрет: ключ показа (`k`, `key`), одноразовая ссылка входа
 * (`invite`, ADR-021) и личная ссылка заказчика (`c`, ADR-047). В журнал сервера, в отчёт
 * об ошибке и в заголовок Referer они не попадают: кто прочитал журнал, тот и вошёл бы.
 *
 * Модуль без зависимостей: его берут и браузер (сбор ошибок), и сервер (приём ошибок).
 */
export const SECRET_PARAMS = ["k", "key", "invite", "c"] as const;

const MASK = "скрыто";

/**
 * Адрес или его часть («/login?invite=…», полный URL) с замаскированными секретами.
 * Значение заменяется словом, а не выбрасывается: в журнале видно, что ключ был
 */
export function withoutSecretParams(address: string): string {
  const query = address.indexOf("?");
  if (query === -1) return address;
  const hash = address.indexOf("#", query);
  const head = address.slice(0, query);
  const search = address.slice(query + 1, hash === -1 ? undefined : hash);
  const tail = hash === -1 ? "" : address.slice(hash);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return head;
  }
  let changed = false;
  for (const name of SECRET_PARAMS) {
    if (params.has(name)) {
      params.set(name, MASK);
      changed = true;
    }
  }
  if (!changed) return address;
  return `${head}?${params.toString()}${tail}`;
}
