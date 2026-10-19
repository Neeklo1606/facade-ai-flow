/**
 * Сверяет анонимизированную выгрузку сама с собой и с итогами исходного файла.
 * Работает без реального Excel: читает `src/data/mock/fact-report.anonymized.json`,
 * поэтому проверку можно повторить на любой машине.
 *
 * Запуск: `bun run scripts/audit-fact-report.ts`
 * Печатает отчёт; выводы руками перенесены в `docs/claude/01-DATA-AUDIT.md`.
 */
import { factReport } from "@/data/mock/fact-report";
import { minutesOfHours, revenuePerHour } from "@/domain/gas-ops/calc";
import { frameSpan } from "@/domain/gas-ops/report";

const r2 = (x: number) => Math.round(x * 100) / 100;
const money = (x: number) => x.toLocaleString("ru-RU");

const { entries, tree, grandTotal, meta, brigades, groups } = factReport;

console.log(`# Аудит выгрузки ${meta.week.from} — ${meta.week.to}\n`);
console.log(
  `Лист «${meta.sheet}», строк ${meta.rows}. Группы ${groups.length}, бригады ${brigades.length}, ` +
    `объекты ${factReport.objects.length}, адресных записей ${entries.length}.\n`,
);

// 1. Сходится ли каждый узел дерева с суммой своих детей
console.log("## Узлы против своих детей\n");
interface Row {
  label: string;
  row: number;
  fileAmount: number | null;
  childAmount: number;
  fileHours: number | null;
  childHours: number;
}
const mismatches: Row[] = [];
function checkNode(node: (typeof tree)[number]): { amount: number; hours: number } {
  if (node.kind === "address") {
    const own = entries.filter((e) => e.excelRow === node.excelRow);
    return {
      amount: own.reduce((a, e) => a + (e.amount ?? 0), 0),
      hours: own.reduce((a, e) => a + (e.hours ?? 0), 0),
    };
  }
  const sums = node.children.map(checkNode);
  const amount = sums.reduce((a, s) => a + s.amount, 0);
  const hours = r2(sums.reduce((a, s) => a + s.hours, 0));
  const fileAmount = node.total.amount;
  const fileHours = node.total.hours;
  const amountOk = (fileAmount ?? 0) === amount;
  // час в файле — сумма округлённых до двух знаков дневных часов, поэтому допуск 0.1 ч
  const hoursOk = Math.abs((fileHours ?? 0) - hours) <= 0.1;
  if (!amountOk || !hoursOk) {
    mismatches.push({
      label: node.label,
      row: node.excelRow,
      fileAmount,
      childAmount: amount,
      fileHours,
      childHours: hours,
    });
  }
  return { amount, hours };
}
const visible = tree.map(checkNode);
if (mismatches.length === 0) {
  console.log(
    "Расхождений нет: каждая строка группы, бригады и сотрудника равна сумме своих детей.\n",
  );
} else {
  for (const m of mismatches) {
    console.log(
      `- r${m.row} «${m.label}»: в файле ${money(m.fileAmount ?? 0)} / ${m.fileHours} ч, ` +
        `по детям ${money(m.childAmount)} / ${m.childHours} ч`,
    );
  }
  console.log("");
}

// 2. Видимые группы против строки «Итого»
console.log("## Видимые группы против строки «Итого»\n");
const visibleAmount = visible.reduce((a, v) => a + v.amount, 0);
const visibleHours = r2(visible.reduce((a, v) => a + v.hours, 0));
console.log("| день | видимые Σ | видимые ч | «Итого» Σ | «Итого» ч | разница Σ | разница ч |");
console.log("|---|---|---|---|---|---|---|");
let diffAmountSum = 0;
let diffHoursSum = 0;
for (const [i, day] of meta.days.entries()) {
  const dayEntries = entries.filter((e) => e.dayIndex === i);
  const a = dayEntries.reduce((x, e) => x + (e.amount ?? 0), 0);
  const h = r2(dayEntries.reduce((x, e) => x + (e.hours ?? 0), 0));
  const ta = grandTotal.values[i]?.amount ?? 0;
  const th = grandTotal.values[i]?.hours ?? 0;
  diffAmountSum += ta - a;
  diffHoursSum += th - h;
  console.log(
    `| ${day} | ${money(a)} | ${h} | ${money(ta)} | ${th} | ${money(ta - a)} | ${r2(th - h)} |`,
  );
}
const totalA = grandTotal.total.amount ?? 0;
const totalH = grandTotal.total.hours ?? 0;
console.log(
  `| неделя | ${money(visibleAmount)} | ${visibleHours} | ${money(totalA)} | ${totalH} | ` +
    `${money(totalA - visibleAmount)} | ${r2(totalH - visibleHours)} |`,
);
console.log("");
console.log(
  `Сумма дневных разниц: ${money(diffAmountSum)} ₽ и ${r2(diffHoursSum)} ч. ` +
    `Недельная разница: ${money(totalA - visibleAmount)} ₽ и ${r2(totalH - visibleHours)} ч. ` +
    `Совпадение по деньгам: ${diffAmountSum === totalA - visibleAmount ? "да" : "нет"}.`,
);
console.log(
  `Доходность строки «Итого» из её же чисел: ${Math.round(totalA / totalH)} ₽/ч, в файле ${grandTotal.total.revenue} ₽/ч.`,
);
console.log(`Доходность невидимой части: ${Math.round(diffAmountSum / diffHoursSum)} ₽/ч.\n`);

// 3. Правило доходности: от минут или от округлённых часов
console.log("## Правило доходности часа\n");
let fromMinutes = 0;
let fromHours = 0;
let neither = 0;
const neitherRows: string[] = [];
for (const e of entries) {
  if (e.amount === null || e.hours === null || e.revenueInFile === null) continue;
  const byMinutes = revenuePerHour(e.amount, minutesOfHours(e.hours));
  const byHours = Math.round(e.amount / e.hours);
  if (byMinutes === e.revenueInFile) fromMinutes++;
  else if (byHours === e.revenueInFile) fromHours++;
  else {
    neither++;
    neitherRows.push(
      `r${e.excelRow} ${e.day}: ${money(e.amount)} ₽ / ${e.hours} ч; в файле ${e.revenueInFile}, ` +
        `от минут ${byMinutes}, от часов ${byHours}`,
    );
  }
}
console.log(
  `Сходится от минут: ${fromMinutes}. Только от округлённых часов: ${fromHours}. Ни так ни так: ${neither}.`,
);
for (const row of neitherRows) console.log(`- ${row}`);
console.log("");

// 4. Записи без суммы
console.log("## Часы без суммы\n");
const noAmount = entries.filter((e) => e.amount === null && (e.hours ?? 0) > 0);
console.log(`Строк: ${noAmount.length}. Доходность по ним не считается.`);
for (const e of noAmount) {
  const obj = factReport.objects.find((o) => o.id === e.objectId);
  console.log(`- r${e.excelRow} ${e.day} ${e.hours} ч — «${obj?.label}»`);
}
console.log("");

// 5. Аномалии доходности
console.log("## Аномалии доходности\n");
const anomalies = entries
  .filter((e) => e.amount !== null && e.minutes !== null && e.minutes > 0)
  .map((e) => ({ e, rate: revenuePerHour(e.amount, e.minutes) ?? 0 }))
  .filter((x) => x.rate >= 20000)
  .sort((a, b) => b.rate - a.rate);
console.log(`Записей с доходностью 20 000 ₽/ч и выше: ${anomalies.length}.`);
for (const { e, rate } of anomalies) {
  const obj = factReport.objects.find((o) => o.id === e.objectId);
  console.log(
    `- r${e.excelRow} ${e.day} ${money(e.amount ?? 0)} ₽ за ${e.hours} ч = ${money(rate)} ₽/ч — «${obj?.label}»`,
  );
}
console.log("");

// 6. Повторы одного объекта и дня в разных бригадах
console.log("## Один объект и день у разных бригад\n");
const byKey = new Map<string, typeof entries>();
for (const e of entries) {
  const key = `${e.objectId}|${e.day}`;
  byKey.set(key, [...(byKey.get(key) ?? []), e]);
}
const dupes = [...byKey.entries()].filter(([, list]) => list.length > 1);
console.log(`Пар: ${dupes.length}.`);
for (const [key, list] of dupes) {
  const obj = factReport.objects.find((o) => o.id === list[0]?.objectId);
  console.log(
    `- «${obj?.label}» ${list[0]?.day}: ` +
      list
        .map((e) => `${e.brigadeId} r${e.excelRow} ${money(e.amount ?? 0)} ₽ / ${e.hours} ч`)
        .join(" и "),
  );
}
console.log("");

// 7. Рамка смены, обед и время по адресам
console.log("## Рамка смены, обед и время по адресам\n");
console.log(
  "Текст «36 час 50 мин» в колонке «Итого» строки интервала меньше суммы рамок смен. " +
    "Разница делится на число дней — это и есть обед, который заказчик уже вычитает.\n",
);
console.log("| строка | кто | дней | Σ рамок | в файле | разница | на день |");
console.log("|---|---|---|---|---|---|---|");
const framed: { row: number; perDay: number }[] = [];
function walkFrames(node: (typeof tree)[number]): void {
  if (node.frames) {
    const frames = Object.values(node.frames);
    const span = frames.reduce((a, f) => a + frameSpan(f), 0);
    const m = /(\d+)\s*час(?:\s*(\d+)\s*мин)?/.exec(node.framesTotal ?? "");
    const inFile = m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null;
    const diff = inFile === null ? null : span - inFile;
    const perDay = diff === null ? null : Math.round((diff / frames.length) * 10) / 10;
    if (perDay !== null) framed.push({ row: node.excelRow, perDay });
    console.log(
      `| r${node.excelRow} | ${node.label} | ${frames.length} | ${span} мин | ` +
        `${node.framesTotal ?? "—"} | ${diff ?? "—"} мин | ${perDay ?? "—"} мин |`,
    );
    const own = collectAddressRows(node);
    const ownMinutes = entries
      .filter((e) => own.includes(e.excelRow))
      .reduce((a, e) => a + (e.minutes ?? 0), 0);
    console.log(`| | по адресам этого сотрудника | | ${ownMinutes} мин | | | |`);
  }
  for (const child of node.children) walkFrames(child);
}
function collectAddressRows(node: (typeof tree)[number]): number[] {
  if (node.kind === "address") return [node.excelRow];
  return node.children.flatMap(collectAddressRows);
}
for (const root of tree) walkFrames(root);
const hourly = framed.filter((f) => f.perDay === 60);
console.log(
  `\nРовно 60 минут на день: ${hourly.length} строк из ${framed.length}. ` +
    `Остальные: ${
      framed
        .filter((f) => f.perDay !== 60)
        .map((f) => `r${f.row} ${f.perDay} мин`)
        .join(", ") || "нет"
    }.\n`,
);
