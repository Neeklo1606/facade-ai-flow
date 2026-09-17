/**
 * Форматирование чисел и денег по-русски. Нейтральный модуль: им пользуются и интерфейс (lib/format),
 * и доменные формулы, которые собирают текст решений на сервере.
 */

export function fmtNum(value: number, digits = 0) {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Деньги хранятся в копейках (docs/db/schema.md); копейки показываются, только если они есть */
export function fmtMoney(kopecks: number) {
  const digits = kopecks % 100 === 0 ? 0 : 2;
  return `${(kopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ₽`;
}
