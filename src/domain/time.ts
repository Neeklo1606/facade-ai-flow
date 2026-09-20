/**
 * Время в правилах домена. Метки в данных — местное время объекта без пояса (`db.ts`, часы
 * демо): «2026-09-18T08:00:00» — это восемь утра на площадке, на какой бы машине ни считали.
 * Такие метки читаются как «часы на стене» — одинаково в любом поясе. Метка с поясом
 * («…Z», «…+03:00») — точный момент.
 */
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;

/** Миллисекунды метки: без пояса — по часам на стене, с поясом — точный момент */
export function wallMs(timestamp: string): number {
  const m = NAIVE.exec(timestamp);
  if (!m) return new Date(timestamp).getTime();
  const [, y, mo, d, h, mi, s, ms] = m;
  return Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h ?? 0),
    Number(mi ?? 0),
    Number(s ?? 0),
    Number((ms ?? "0").padEnd(3, "0")),
  );
}

/** Метка без пояса из миллисекунд «часов на стене» */
export function wallIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}
