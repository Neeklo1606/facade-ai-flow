/**
 * Данные заказчика в публичной сборке (ADR-047, 01_SPEC 6.3).
 *
 * После `bun run build` ищет в клиентских файлах `.output/public/**` и в HTML страниц
 * сайта и /gas (ответ сервера демо-сборки без куки личной ссылки) строки запретов:
 * название заказчика, населённые пункты из его отчёта, итог недели в двух записях.
 * Список строится в памяти из серверного модуля и набора заказчика и в файлы не пишется.
 * Любое совпадение роняет шаг.
 *
 * HTML проверяется, если поднят сервер: адрес `LH_BASE` (его же даёт `bun run ci`)
 * или `PUBLIC_BUNDLE_BASE`. Без сервера проверяются только файлы сборки.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { factReport } from "@/data/mock/fact-report";
import { CUSTOMER_BRAND } from "@/server/customer-data";

const ROOT = ".output/public";
const PAGES = ["/", "/demo", "/case/gas", "/razbor", "/kit", "/privacy", "/gas", "/gas/reports"];

const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function forbidden(): { what: string; text: string }[] {
  const list: { what: string; text: string }[] = [
    { what: "название заказчика", text: CUSTOMER_BRAND.clientShort },
    { what: "название заказчика", text: CUSTOMER_BRAND.clientShort.toLowerCase() },
  ];
  const settlements = new Set(
    factReport.objects.map((o) => o.settlement).filter((s): s is string => !!s),
  );
  for (const settlement of settlements) list.push({ what: "населённый пункт", text: settlement });
  // «Итого» файла и сумма видимых строк недели: обе цифры узнаются заказчиком с первого взгляда
  const visible = factReport.entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  for (const total of [factReport.grandTotal.total.amount, visible]) {
    if (!total) continue;
    list.push({ what: "итог недели", text: String(total) });
    list.push({ what: "итог недели", text: grouped(total) });
  }
  return list;
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const rules = forbidden();
const hits: string[] = [];

let scanned = 0;
for (const path of files(ROOT)) {
  if (!/\.(js|mjs|css|html|json|txt|webmanifest|svg)$/.test(path)) continue;
  const text = plain(readFileSync(path, "utf8"));
  scanned += 1;
  for (const rule of rules) {
    if (text.includes(rule.text)) hits.push(`${path}: ${rule.what}`);
  }
}

if (scanned === 0) {
  console.error(`В ${ROOT} нет файлов сборки: сначала bun run build`);
  process.exit(1);
}

const base = process.env["PUBLIC_BUNDLE_BASE"] ?? process.env["LH_BASE"];
let pages = 0;
if (base) {
  for (const page of PAGES) {
    const response = await fetch(base + page, { redirect: "follow" });
    const html = plain(await response.text());
    pages += 1;
    for (const rule of rules) {
      if (html.includes(rule.text)) hits.push(`HTML ${page}: ${rule.what}`);
    }
  }
}

// Сами запреты не печатаются: отчёт конвейера публичный
console.log(
  `Файлов сборки: ${scanned}, страниц: ${pages}${base ? "" : " (сервер не задан)"}, запретов: ${rules.length}`,
);
if (hits.length) {
  console.error(`Данные заказчика в публичной сборке: ${hits.length}`);
  for (const hit of [...new Set(hits)]) console.error(`  ${hit}`);
  process.exit(1);
}
console.log("Данных заказчика в публичной сборке нет");
