/**
 * Расчёты газового направления (ADR-043). Правила восстановлены по значениям фактического
 * отчёта заказчика: формул в файле нет, это выгрузка. Проверка — `tests/domain/gas-ops-calc.test.ts`
 * и `bun run scripts/audit-fact-report.ts`.
 *
 * Главное правило: считать от минут, а не от округлённых часов. В файле часы хранятся
 * с двумя знаками, и 44 847 / 6,58 даёт 6 816 ₽/ч, тогда как 44 847 / (395/60) даёт 6 812 ₽/ч —
 * и в файле стоит именно 6 812. Из 115 строк с суммой, часами и доходностью от минут
 * сходятся 113, от округлённых часов — 42.
 */
import type { EntryFlag, TimeEntry } from "./model";

export const MINUTES_IN_HOUR = 60;
export const MINUTES_IN_DAY = 24 * 60;

/** Доходность, с которой запись попадает под проверку как аномалия (₽/ч) */
export const HIGH_RATE_THRESHOLD = 20_000;

/**
 * Время из отчёта заказчика: «8.20», «08:30», «8:5» — всё это минуты от полуночи.
 * Разделитель в файле — точка, в боте человек наберёт двоеточие; принимаем оба.
 */
export function parseClock(value: string): number | null {
  const m = /^\s*(\d{1,2})\s*[.:,]\s*(\d{1,2})\s*$/.exec(value);
  if (!m) {
    const bare = /^\s*(\d{1,2})\s*$/.exec(value);
    if (!bare) return null;
    const hour = Number(bare[1]);
    return hour >= 0 && hour <= 23 ? hour * MINUTES_IN_HOUR : null;
  }
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * MINUTES_IN_HOUR + minutes;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / MINUTES_IN_HOUR);
  const m = minutes % MINUTES_IN_HOUR;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type MinutesError =
  "start-format" | "end-format" | "break-format" | "overnight" | "non-positive" | "break-too-long";

export const MINUTES_ERROR_TEXT: Record<MinutesError, string> = {
  "start-format": "Начало смены не распознано. Введите время как 8:20.",
  "end-format": "Окончание смены не распознано. Введите время как 16:40.",
  "break-format": "Перерыв не распознан. Введите минуты числом.",
  overnight: "Окончание раньше начала. Смена через полночь в системе не ведётся.",
  "non-positive": "Время смены получилось нулевым. Проверьте начало и окончание.",
  "break-too-long": "Перерыв больше смены. Проверьте значения.",
};

export interface MinutesInput {
  start: string | number;
  end: string | number;
  /** Перерывы в минутах: число или строка из бота */
  breakMinutes?: string | number;
}

export type MinutesResult =
  | { ok: true; minutes: number; startMinutes: number; endMinutes: number; breakMinutes: number }
  | { ok: false; error: MinutesError };

/**
 * Эффективные минуты смены: окончание минус начало минус перерывы.
 * Смена через полночь запрещена с понятной ошибкой: в отчёте заказчика таких смен нет,
 * а правило для них не согласовано. См. OPEN-QUESTION 6.
 */
export function effectiveMinutes(input: MinutesInput): MinutesResult {
  const start = typeof input.start === "number" ? input.start : parseClock(input.start);
  if (start === null) return { ok: false, error: "start-format" };
  const end = typeof input.end === "number" ? input.end : parseClock(input.end);
  if (end === null) return { ok: false, error: "end-format" };

  const rawBreak = input.breakMinutes ?? 0;
  const breakMinutes =
    typeof rawBreak === "number"
      ? rawBreak
      : rawBreak.trim() === ""
        ? 0
        : /^\d{1,3}$/.test(rawBreak.trim())
          ? Number(rawBreak.trim())
          : null;
  if (breakMinutes === null || breakMinutes < 0) return { ok: false, error: "break-format" };

  if (end <= start) return { ok: false, error: "overnight" };
  const frame = end - start;
  if (breakMinutes >= frame) return { ok: false, error: "break-too-long" };
  const minutes = frame - breakMinutes;
  if (minutes <= 0) return { ok: false, error: "non-positive" };
  return { ok: true, minutes, startMinutes: start, endMinutes: end, breakMinutes };
}

/** Часы из минут. Показываются с двумя знаками, но в расчёт идут минуты */
export function hoursOfMinutes(minutes: number): number {
  return minutes / MINUTES_IN_HOUR;
}

/** Минуты за часами из выгрузки: 6,58 ч — это 395 мин, а не 394,8 */
export function minutesOfHours(hours: number): number {
  return Math.round(hours * MINUTES_IN_HOUR);
}

/**
 * Доходность часа: подтверждённая сумма, делённая на часы, посчитанные от минут.
 * При нулевых минутах деление запрещено — возвращается null, а не ноль и не бесконечность.
 */
export function revenuePerHour(amountRub: number | null, minutes: number | null): number | null {
  if (amountRub === null || minutes === null || minutes <= 0) return null;
  return Math.round(amountRub / hoursOfMinutes(minutes));
}

/** Пара записей, которые пересекаются по времени внутри одной бригады и дня */
export interface Overlap {
  a: TimeEntry;
  b: TimeEntry;
  /** Сколько минут пересеклось */
  minutes: number;
}

/**
 * Пересечения времени одной бригады (ТЗ, п. 7). Записи без рамки смены (из выгрузки
 * заказчика известны только минуты, но не начало и окончание) в проверку не попадают:
 * без начала и окончания пересечение неизвестно, а догадываться нельзя.
 */
export function findOverlaps(entries: TimeEntry[]): Overlap[] {
  const result: Overlap[] = [];
  const framed = entries.filter(
    (e) => e.startMinutes !== null && e.endMinutes !== null && e.status !== "rejected",
  );
  const byKey = new Map<string, TimeEntry[]>();
  for (const e of framed) {
    const key = `${e.brigadeId}|${e.day}`;
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  for (const list of byKey.values()) {
    const sorted = [...list].sort((x, y) => x.startMinutes! - y.startMinutes!);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const minutes =
          Math.min(a.endMinutes!, b.endMinutes!) - Math.max(a.startMinutes!, b.startMinutes!);
        if (minutes > 0) result.push({ a, b, minutes });
      }
    }
  }
  return result;
}

/**
 * Дубль: та же бригада, тот же объект, тот же день. Отклонённые записи не считаются —
 * после отклонения бригадир вводит запись заново, и это не дубль.
 */
export function findDuplicates(entries: TimeEntry[]): TimeEntry[][] {
  const byKey = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    if (e.status === "rejected") continue;
    const key = `${e.brigadeId}|${e.objectId}|${e.day}`;
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  return [...byKey.values()].filter((list) => list.length > 1);
}

export interface FlagInput {
  entry: TimeEntry;
  /** Все записи того же набора: нужны для пересечений и дублей */
  all: TimeEntry[];
  /** Есть ли подтверждённая стоимость работ объекта */
  hasEstimate: boolean;
  /** Работали ли по этому объекту больше одного дня */
  objectDays: number;
  /** Состав бригады на дату записи; неизвестен — признак состава не ставится */
  crewSize?: number | null;
}

/**
 * Признаки записи для проверяющего. Признак — это повод посмотреть, а не ошибка:
 * 42 095 ₽ за 0,33 ч в фактическом отчёте — реальная строка заказчика.
 */
export function flagsOf(input: FlagInput): EntryFlag[] {
  const { entry, all, hasEstimate, objectDays, crewSize } = input;
  const flags: EntryFlag[] = [];
  if (entry.amountRub === null) flags.push("no-amount");
  const rate = revenuePerHour(entry.amountRub, entry.minutes);
  if (rate !== null && rate >= HIGH_RATE_THRESHOLD) flags.push("high-rate");
  if (findOverlaps(all).some((o) => o.a.id === entry.id || o.b.id === entry.id))
    flags.push("overlap");
  if (findDuplicates(all).some((list) => list.some((e) => e.id === entry.id)))
    flags.push("duplicate");
  if (objectDays > 1) flags.push("multi-day-object");
  if (!hasEstimate && entry.amountRub !== null) flags.push("no-estimate");
  const people = entry.people?.length ? entry.people.length : (entry.headcount ?? null);
  if (people !== null && crewSize && people > crewSize) flags.push("over-crew");
  return flags;
}

/** Итог по набору записей: суммы, минуты, доходность. Агрегаты не складываются с детьми */
export interface Totals {
  amountRub: number;
  minutes: number;
  hours: number;
  /** Доходность часа от суммы минут, а не среднее по строкам */
  revenuePerHour: number | null;
  /** Сколько записей без суммы попало в набор: честный признак неполноты */
  withoutAmount: number;
  count: number;
}

export function totalsOf(entries: TimeEntry[]): Totals {
  const amountRub = entries.reduce((a, e) => a + (e.amountRub ?? 0), 0);
  const minutes = entries.reduce((a, e) => a + e.minutes, 0);
  return {
    amountRub,
    minutes,
    hours: hoursOfMinutes(minutes),
    revenuePerHour: revenuePerHour(amountRub, minutes),
    withoutAmount: entries.filter((e) => e.amountRub === null).length,
    count: entries.length,
  };
}

/** Деньги направления: целые рубли, разряды пробелами. Не путать с `fmtMoney` (копейки) */
export function fmtRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

/** Часы с двумя знаками, как в отчёте заказчика: «6,58 ч» */
export function fmtHours(hours: number): string {
  return `${hours.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ч`;
}

/** Доходность: «6 812 ₽/ч»; без суммы или без минут — прочерк, а не ноль */
export function fmtRate(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("ru-RU")} ₽/ч`;
}

/** «36 час 50 мин» — так рамка смены подписана в колонке «Итого» у заказчика */
export function fmtFrameTotal(minutes: number): string {
  const h = Math.floor(minutes / MINUTES_IN_HOUR);
  const m = minutes % MINUTES_IN_HOUR;
  return m === 0 ? `${h} час` : `${h} час ${m} мин`;
}
