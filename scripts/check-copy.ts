/**
 * Тексты интерфейса (00_SYSTEM, раздел 7; шаги L3 и L8): в строках, которые видит человек,
 * нет длинных тире, капса длиннее трёх букв (кроме словаря), эмодзи и слов «эффективно»,
 * «удобно», «легко», «инновационный», «революционный», «уникальный».
 *
 * Комментарии не проверяются: сначала они вырезаются, затем ищется в оставшемся коде.
 * Области задаются списком ниже: папки и отдельные файлы.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AREAS = [
  "src/components/gas-ops",
  "src/routes/gas",
  "src/lib/gas-ops",
  // Публичный сайт (ADR-047, ADR-050)
  "src/components/site",
  "src/lib/site",
  // Страницы сайта и /demo (шаг L8)
  "src/routes/index.tsx",
  "src/routes/demo.tsx",
  "src/routes/case",
  "src/routes/razbor.tsx",
  "src/routes/kit.tsx",
  "src/routes/privacy.tsx",
  "src/routes/og.$name.tsx",
  "src/routes/finish.tsx",
  // Сайт v2: страницы трёх задач (ADR-067)
  "src/routes/uchet-vremeni-brigad.tsx",
  "src/routes/snabzhenie.tsx",
  "src/routes/ispolnitelnaya-dokumentatsiya.tsx",
  // Экраны «Ещё» и шторка роли (ADR-048)
  "src/routes/more.tsx",
  "src/components/layout/MoreScreen.tsx",
  "src/components/layout/RoleSheet.tsx",
  "src/components/ui/kit/settings-list.tsx",
];

/** Аббревиатуры и названия, которым капс положен */
const CAPS_OK = new Set([
  "MAX",
  "ПТО",
  // Акт освидетельствования скрытых работ: название формы (ADR-058, лендинг S7)
  "АОСР",
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
/** Сайт v2 (ADR-067, правило 3.6): ещё два слова-обещания только для сайта */
const SITE_WORDS = /(?<!\p{L})(лучш\p{L}*|ИИ всё сделает)(?!\p{L})/iu;
const SITE_AREAS = ["src/components/site", "src/lib/site"];
/** Предложение сайта до 14 слов (ADR-067, правило 3.6). Набор партнёра и политика ниже KIT */
const SITE_COPY = "src/lib/site/copy.ts";
const MAX_WORDS = 14;
const CAPS = /(?<![\p{L}-])[\p{Lu}]{4,}(?![\p{L}])/gu;

function files(dir: string): string[] {
  if (statSync(dir).isFile()) return [dir];
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

for (const area of SITE_AREAS) {
  for (const path of files(area)) {
    stripComments(readFileSync(path, "utf8"))
      .split("\n")
      .forEach((line, index) => {
        if (SITE_WORDS.test(line))
          problems.push(`${path}:${index + 1}: ${line.match(SITE_WORDS)![0]}`);
      });
  }
}

{
  const code = stripComments(readFileSync(SITE_COPY, "utf8"));
  const site = code.slice(0, code.indexOf("export const KIT"));
  for (const match of site.matchAll(/"([^"\n]*[а-яё][^"\n]*)"/gi)) {
    for (const sentence of match[1]!.split(/(?<=[.!?])\s+/)) {
      const words = sentence.split(/\s+/).filter((word) => /[\p{L}\d]/u.test(word)).length;
      if (words > MAX_WORDS) {
        const line = site.slice(0, match.index).split("\n").length;
        problems.push(`${SITE_COPY}:${line}: предложение ${words} слов «${sentence.slice(0, 60)}»`);
      }
    }
  }
}

if (problems.length) {
  console.error(`Тексты интерфейса: ${problems.length}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Тексты интерфейса: ${AREAS.join(", ")} без замечаний`);
