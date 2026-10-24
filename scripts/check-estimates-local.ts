/**
 * Разбор настоящих смет заказчика из `.local/client-files` (ADR-053, «Проверка»).
 * Не входит в CI: файлов заказчика в репозитории нет, каталог `.local/` в .gitignore.
 *
 * Печатает только итоги, формат, статус и номера строк замечаний. Имя файла не печатается:
 * в именах смет адреса объектов. Файлы нумеруются по порядку имени.
 *
 * Запуск: `bun scripts/check-estimates-local.ts`
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sheetsOfXls, sheetsOfXlsx } from "@/adapters/gas-ops/estimate-file";
import {
  ESTIMATE_FORMAT_LABEL,
  PARSE_STATUS_LABEL,
  TOTAL_LABEL,
  TOTAL_ORDER,
  parseEstimateWorkbook,
  sectionsSum,
} from "@/domain/gas-ops/estimate-parse";
import { DEFAULT_RULE_TERMS, applyRule } from "@/domain/gas-ops/work-cost";

const dir = join(import.meta.dir, "..", ".local", "client-files");
const rub = (k: number) =>
  `${(k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

let files: string[] = [];
try {
  files = readdirSync(dir)
    .filter((f) => /\.xlsx?$/i.test(f))
    .sort();
} catch {
  console.log("Каталог .local/client-files не найден: положите туда сметы заказчика.");
  process.exit(0);
}

let n = 0;
for (const file of files) {
  n++;
  const bytes = readFileSync(join(dir, file));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ext = file.toLowerCase().endsWith(".xls") ? "xls" : "xlsx";
  const sheets = ext === "xls" ? await sheetsOfXls(buffer) : await sheetsOfXlsx(buffer);
  const parsed = parseEstimateWorkbook(sheets);
  console.log(
    `\nФайл ${n} (.${ext}): ${parsed.format ? ESTIMATE_FORMAT_LABEL[parsed.format] : "не смета"}`,
  );
  console.log(`  Статус: ${PARSE_STATUS_LABEL[parsed.status]}`);
  if (parsed.status === "unknown-format") continue;
  for (const key of TOTAL_ORDER) {
    const v = parsed.totals[key];
    const label =
      key === "vat" && parsed.vatRate !== null ? `НДС ${parsed.vatRate}%` : TOTAL_LABEL[key];
    console.log(`  ${label}: ${v ? `${rub(v.kopecks)} (строка ${v.row})` : "не найдено"}`);
  }
  console.log(`  Разделов: ${parsed.sections.length}, сумма разделов ${rub(sectionsSum(parsed))}`);
  console.log(
    `  Трудозатраты: ${parsed.laborHours ? `${parsed.laborHours.value.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} чел.-ч (строка ${parsed.laborHours.row})` : "не найдены"}`,
  );
  const cost = applyRule(parsed.totals, DEFAULT_RULE_TERMS);
  console.log(
    `  Кандидат «без НДС минус материалы»: ${cost.ok ? rub(cost.kopecks) : "нет строк " + cost.missing.join(", ")}`,
  );
  for (const issue of parsed.issues) {
    // Подпись строки может содержать адрес, поэтому печатается только номер строки и вид замечания
    console.log(
      `  Замечание${issue.row ? `, строка ${issue.row}` : ""}: ${issue.message.split(":")[0]!.replace(/«[^»]*»/g, "«…»")}`,
    );
  }
}
