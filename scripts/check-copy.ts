/**
 * Тексты интерфейса (00_SYSTEM, раздел 7; шаги L3 и L8): в строках, которые видит человек,
 * нет длинных тире, капса длиннее трёх букв (кроме словаря), эмодзи и слов «эффективно»,
 * «удобно», «легко», «инновационный», «революционный», «уникальный».
 *
 * Комментарии не проверяются: сначала они вырезаются, затем ищется в оставшемся коде.
 * Области задаются списком ниже; L8 расширяет его на сайт и экран «Ещё».
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AREAS = ["src/components/gas-ops", "src/routes/gas", "src/lib/gas-ops"];

/** Аббревиатуры и названия, которым капс положен */
const CAPS_OK = new Set([
  "MAX",
  "ПТО",
  "ИИ",
  "СМР",
  "НДС",
  "ПЭ",
  "XLSX",
  "PDF",
  "ГАЙКА",
  "ГАЙКИ",
  "ГАЙКЕ",
  "ГАЙКУ",
  "ФИО",
  "ООО",
  "СТАЛЬНЫЕ",
  "ОТЧЁТ",
  "ИТОГО",
  // Название программы смет и строка «ВСЕГО по смете», как она стоит в файле сметы
  "ГРАНД",
  "ВСЕГО",
]);
/**
 * Слова-обещания из 00_SYSTEM, 7. «Эффективное рабочее время» это термин и столбец Excel
 * заказчика, поэтому ищется наречие «эффективно», а не корень
 */
const WORDS =
  /(?<!\p{L})(эффективно|удобно|удобный|удобная|удобное|легко|инновационн\p{L}*|революционн\p{L}*|уникальн\p{L}*)(?!\p{L})/iu;
const EMOJI = /\p{Extended_Pictographic}/u;
const CAPS = /(?<![\p{L}-])[\p{Lu}]{4,}(?![\p{L}])/gu;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Вырезать комментарии, сохранив строки на месте: номера строк в отчёте остаются верными */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(
      /(^|[^:"'`\\])\/\/[^\n]*/g,
      (m, lead: string) => lead + " ".repeat(m.length - lead.length),
    );
}

const problems: string[] = [];
for (const area of AREAS) {
  for (const path of files(area)) {
    const lines = stripComments(readFileSync(path, "utf8")).split("\n");
    lines.forEach((line, index) => {
      // Классы, импорты и ключи не тексты: проверяются строки с кириллицей или символами
      const where = `${path}:${index + 1}`;
      if (line.includes("—")) problems.push(`${where}: длинное тире`);
      if (EMOJI.test(line)) problems.push(`${where}: эмодзи`);
      if (/[а-яё]/i.test(line) && WORDS.test(line))
        problems.push(`${where}: ${line.match(WORDS)![0]}`);
      for (const word of line.match(CAPS) ?? []) {
        if (!/[А-ЯЁ]/.test(word) || CAPS_OK.has(word)) continue;
        problems.push(`${where}: капс «${word}»`);
      }
    });
  }
}

if (problems.length) {
  console.error(`Тексты интерфейса: ${problems.length}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Тексты интерфейса: ${AREAS.join(", ")} без замечаний`);
