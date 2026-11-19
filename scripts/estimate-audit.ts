/**
 * Ревизия смет (ADR-077): прогон файлов каталога через разбор и печать таблицы
 * «файл → формат → лист → итоги → разделы → что не нашлось». Файлы заказчика лежат вне git:
 * `bun scripts/estimate-audit.ts [.local/estimates]`. Вывод только в терминал.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sheetsOfXls, sheetsOfXlsx } from "@/adapters/gas-ops/estimate-file";
import { parseEstimateWorkbook } from "@/domain/gas-ops/estimate-parse";
import { convergence, fileStatusOf, sectionView } from "@/domain/gas-ops/estimate-intake";

const dir = process.argv[2] ?? ".local/estimates";
const rub = (k: number | null) =>
  k === null ? "нет" : (k / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
for (const f of readdirSync(dir)
  .filter((x) => /\.xlsx?$/i.test(x))
  .sort()) {
  const b = readFileSync(join(dir, f));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const sheets = /\.xls$/i.test(f) ? await sheetsOfXls(buf) : await sheetsOfXlsx(buf);
  const p = parseEstimateWorkbook(sheets);
  const h = p.header;
  const st = fileStatusOf(p);
  const c = convergence(p);
  console.log(
    `\n## ${f}\nформат ${p.format}, лист «${p.sheet}» из ${sheets.length}, статус ${st.status}${st.reason ? ` (${st.reason})` : ""}`,
  );
  console.log(
    `итог без НДС ${rub(p.totals.withoutVat?.kopecks ?? null)} @${p.totals.withoutVat?.row}, всего ${rub(p.totals.total?.kopecks ?? null)}, разделы ${c.ok ? "сходятся" : `не сходятся ${rub(c.diffKopecks)}`}`,
  );
  if (h)
    for (const [k, v] of Object.entries(h))
      console.log(
        `  ${k}: ${v.value === null ? `— (${(v as { reason: string }).reason})` : `${JSON.stringify(v.value)} @${v.row}`}`,
      );
  for (const s of p.sections) {
    const v = sectionView(s);
    console.log(
      `  [${v.number}] ${v.title}: итог ${rub(v.totalKopecks)}@${v.totalRow}, мат ${rub(v.materialsKopecks)}@${v.materialsRow}${v.materialsNote ? ` (${v.materialsNote})` : ""}, работы ${rub(v.workKopecks)}, т/з ${v.laborHours}@${v.laborRow}, ФОТ ${rub(v.payrollKopecks)}, НР ${rub(v.overheadKopecks)}, СП ${rub(v.profitKopecks)}, маш ${rub(v.machinesKopecks)}${v.pressure ? `, ОПРЕССОВКА ${v.pressure.kind} ${rub(v.pressure.totalKopecks)} (мат ${rub(v.pressure.materialsKopecks)}, работы ${rub(v.pressure.workKopecks)}) строки ${v.pressure.rows.join(",")}: ${v.pressure.method}` : ""}, СМР ${rub(v.smrKopecks)}`,
    );
  }
  for (const i of p.issues) console.log(`  ! ${i.row ?? "-"}: ${i.message}`);
}
