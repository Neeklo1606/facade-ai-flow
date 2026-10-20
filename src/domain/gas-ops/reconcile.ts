/**
 * Сверка отчёта системы с файлом заказчика (ADR-043, п. 5; ADR-044, F6).
 *
 * Блок «Сверка с вашим файлом» на экране отчёта показывает только то, что посчитано здесь:
 * цифры руками в интерфейс не пишутся, тест сравнивает текст блока с этим расчётом.
 *
 * Что сверяется:
 *
 * 1. Видимые строки файла (адресные записи выгрузки) против записей системы из того же
 *    файла: деньги до рубля, часы как в файле (сумма округлённых дневных часов).
 * 2. Строка «Итого» файла против видимых строк: разница и её доходность. Номера групп
 *    в выгрузке идут с пропусками, пропущенные группы называются (OPEN-QUESTION 8).
 * 3. Доходность часа по строкам: в скольких строках расчёт от минут совпал с файлом
 *    и где расхождение ровно в половину рубля (OPEN-QUESTION 7).
 */
import { fmtHours, fmtRate, fmtRub, revenuePerHour } from "./calc";
import type { TimeEntry } from "./model";

export interface FileFacts {
  week: { from: string; to: string };
  /** Адресные записи выгрузки: значения как стоят в файле */
  entries: { amount: number | null; hours: number | null }[];
  /** Строка «Итого» файла */
  grandTotal: { amount: number | null; hours: number | null };
  /** Коды групп, которые есть в выгрузке: «1», «3», «5» */
  groupCodes: (string | null)[];
}

export interface Reconciliation {
  week: { from: string; to: string };
  file: { amountRub: number; hours: number; records: number };
  system: { amountRub: number; minutes: number; records: number };
  /** Система минус файл, рубли. Ноль — совпало до рубля */
  diffRub: number;
  fileTotal: { amountRub: number; hours: number };
  /** «Итого» файла минус видимые строки */
  hidden: { amountRub: number; hours: number; revenue: number | null };
  /** Номера групп, пропущенных в выгрузке: «2», «4» */
  missingGroups: string[];
  revenue: {
    /** Строк, где в файле есть сумма, минуты и доходность */
    checked: number;
    matched: number;
    /** Строки, где сумма за час ровно на половине рубля */
    halfRuble: { amountRub: number; minutes: number; inFile: number; system: number }[];
    /** Прочие расхождения: их быть не должно, но если появятся — видны */
    other: number;
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Пропуски в нумерации групп: 1, 3, 5 → 2, 4 */
function missingCodes(codes: (string | null)[]): string[] {
  const numbers = codes
    .map((code) => Number(code))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
  const max = numbers[numbers.length - 1] ?? 0;
  const result: string[] = [];
  for (let n = 1; n < max; n++) if (!numbers.includes(n)) result.push(String(n));
  return result;
}

/**
 * Сверка. `systemEntries` — все записи системы: в сверку идут подтверждённые записи,
 * перенесённые из файла (`source: "fact-report"`). Демо-записи к файлу отношения не имеют.
 */
export function reconcile(file: FileFacts, systemEntries: TimeEntry[]): Reconciliation {
  const fileAmount = file.entries.reduce((a, e) => a + (e.amount ?? 0), 0);
  const fileHours = round2(file.entries.reduce((a, e) => a + (e.hours ?? 0), 0));

  const fact = systemEntries.filter((e) => e.source === "fact-report" && e.status === "confirmed");
  const systemAmount = fact.reduce((a, e) => a + (e.amountRub ?? 0), 0);
  const systemMinutes = fact.reduce((a, e) => a + e.minutes, 0);

  const totalAmount = file.grandTotal.amount ?? 0;
  const totalHours = file.grandTotal.hours ?? 0;
  const hiddenAmount = totalAmount - fileAmount;
  const hiddenHours = round2(totalHours - fileHours);

  let checked = 0;
  let matched = 0;
  let other = 0;
  const halfRuble: Reconciliation["revenue"]["halfRuble"] = [];
  for (const entry of fact) {
    const inFile = entry.revenueInFile ?? null;
    if (inFile === null || entry.amountRub === null || entry.minutes <= 0) continue;
    checked += 1;
    const system = revenuePerHour(entry.amountRub, entry.minutes)!;
    if (system === inFile) {
      matched += 1;
      continue;
    }
    // Точная доходность на половине рубля: 14 700 / (160 / 60) = 5 512,5
    const exact2 = (entry.amountRub * 60 * 2) / entry.minutes;
    if (Number.isInteger(exact2) && exact2 % 2 === 1) {
      halfRuble.push({ amountRub: entry.amountRub, minutes: entry.minutes, inFile, system });
    } else {
      other += 1;
    }
  }

  return {
    week: file.week,
    file: { amountRub: fileAmount, hours: fileHours, records: file.entries.length },
    system: { amountRub: systemAmount, minutes: systemMinutes, records: fact.length },
    diffRub: systemAmount - fileAmount,
    fileTotal: { amountRub: totalAmount, hours: totalHours },
    hidden: {
      amountRub: hiddenAmount,
      hours: hiddenHours,
      // доходность невидимой части по числам файла: так её и посчитал бы человек
      revenue: hiddenHours > 0 ? Math.round(hiddenAmount / hiddenHours) : null,
    },
    missingGroups: missingCodes(file.groupCodes),
    revenue: { checked, matched, halfRuble, other },
  };
}

export interface ReconcileLine {
  id: "visible" | "total" | "hidden" | "revenue";
  text: string;
  /** Ссылка на вопрос к согласованию: номер и подпись ссылки */
  question?: { number: number; label: string };
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function listRu(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

/** Текст блока сверки. Экран показывает ровно эти строки */
export function reconcileLines(r: Reconciliation): ReconcileLine[] {
  const lines: ReconcileLine[] = [];
  const period = `${ddmm(r.week.from)} - ${ddmm(r.week.to)}`;
  const systemText =
    r.diffRub === 0
      ? "Система: то же значение до рубля."
      : `Система: ${fmtRub(r.system.amountRub)}, расходится на ${fmtRub(Math.abs(r.diffRub))}.`;
  const systemHours = round2(r.system.minutes / 60);
  const hoursText =
    systemHours === r.file.hours
      ? ""
      : ` Часы от минут: ${fmtHours(systemHours)}, в файле сложены округлённые часы дней.`;
  lines.push({
    id: "visible",
    text: `Видимые строки файла ${period}: ${fmtRub(r.file.amountRub)}, ${fmtHours(r.file.hours)}. ${systemText}${hoursText}`,
  });

  const groups =
    r.missingGroups.length === 0
      ? "Состав групп в выгрузке не объясняет разницу."
      : `Похоже, в выгрузку не попали ${r.missingGroups.length === 1 ? "группа" : "группы"} ${listRu(r.missingGroups)}.`;
  lines.push({
    id: "total",
    text: `Строка «Итого» в файле: ${fmtRub(r.fileTotal.amountRub)}, ${fmtHours(r.fileTotal.hours)}. ${groups}`,
    question: { number: 8, label: "Вопрос 8 к согласованию" },
  });

  if (r.hidden.amountRub !== 0) {
    lines.push({
      id: "hidden",
      text: `Разница: ${fmtRub(r.hidden.amountRub)} и ${fmtHours(r.hidden.hours)}, это ${fmtRate(r.hidden.revenue)}. Формулы системы под «Итого» файла не подгонялись.`,
    });
  }

  const half = r.revenue.halfRuble;
  const halfText =
    half.length === 0
      ? ""
      : ` В ${half.length} ${half.length === 1 ? "строке" : "строках"} (${fmtRub(half[0]!.amountRub)} за ${fmtHours(half[0]!.minutes / 60)}) сумма за час ровно на половине рубля: в файле ${fmtRate(half[0]!.inFile)}, в системе ${fmtRate(half[0]!.system)}.`;
  lines.push({
    id: "revenue",
    text: `Доходность часа совпала с файлом в ${r.revenue.matched} строках из ${r.revenue.checked}.${halfText}`,
    ...(half.length > 0 ? { question: { number: 7, label: "Вопрос 7 к согласованию" } } : {}),
  });
  return lines;
}
