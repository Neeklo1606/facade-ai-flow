/**
 * Сверка сравнения с альтернативами против источников (ADR-020, поправка 23.09.2026).
 *
 * Три круга независимой проверки нашли одно и то же: строка таблицы утверждала, что на сайте
 * чего-то нет, а оно там было. Человек проверяет пересказом, пересказ короче страницы — и
 * утверждение расходится с источником молча. Эта команда делает то же самое машиной: скачивает
 * каждую страницу целиком, снимает разметку и ищет слова, на которых держится утверждение.
 *
 * В конвейер не входит: нужна сеть, а чужой сайт может лежать — тогда упал бы наш выпуск.
 * Запускать перед показом и перед выпуском: `bun run check:sources` (см. docs/RELEASE.md).
 */
import { ALTERNATIVES, allSources, COMPARED_AT, PARAMETERS } from "../src/lib/help/alternatives";

/** Сколько живёт проверка источника: дальше сайт успевает измениться, и таблицу пора пересмотреть */
const MAX_AGE_DAYS = 90;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** Текст страницы без разметки: скрипты и стили выкидываем целиком, неразрывный пробел — обычный */
function plain(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&laquo;|&raquo;|&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return plain(await response.text());
}

const pages = new Map<string, string>();
const failures: string[] = [];
const checked: string[] = [];

const age = Math.floor((Date.now() - new Date(COMPARED_AT).getTime()) / 86_400_000);
console.log(`Источники сверялись ${COMPARED_AT} — ${age} дн. назад`);
if (age > MAX_AGE_DAYS) {
  failures.push(
    `Сверке источников ${age} дн., предел ${MAX_AGE_DAYS}. Перепроверьте таблицу и обновите COMPARED_AT.`,
  );
}

for (const source of allSources()) {
  try {
    pages.set(source.url, await fetchText(source.url));
    console.log(`  скачано ${source.url} (${pages.get(source.url)!.length} знаков)`);
  } catch (error) {
    failures.push(`Не скачалась страница ${source.url}: ${String(error)}`);
  }
}

for (const alternative of ALTERNATIVES) {
  for (const parameter of PARAMETERS) {
    const claim = alternative.claims[parameter.id];
    const where = `${alternative.name} / ${parameter.title}`;
    const texts = (claim.sources ?? []).map((source) => pages.get(source.url)).filter(Boolean);
    if (!claim.probe) {
      if (claim.sources?.length) failures.push(`${where}: есть источник, но нечего сверять`);
      continue;
    }
    if (!texts.length) {
      failures.push(`${where}: страницы источника нет, сверить нечем`);
      continue;
    }
    for (const term of claim.probe.present ?? []) {
      const found = texts.some((text) => text!.includes(term.toLowerCase()));
      checked.push(`${found ? "✓" : "✗"} ${where}: «${term}» ${found ? "на месте" : "ПРОПАЛО"}`);
      if (!found)
        failures.push(`${where}: «${term}» на странице больше нет — утверждение устарело`);
    }
    for (const term of claim.probe.absent ?? []) {
      const found = texts.some((text) => text!.includes(term.toLowerCase()));
      checked.push(
        `${found ? "✗" : "✓"} ${where}: «${term}» ${found ? "ПОЯВИЛОСЬ" : "по-прежнему нет"}`,
      );
      if (found) {
        failures.push(`${where}: «${term}» на странице есть — утверждение об отсутствии неверно`);
      }
    }
  }
}

console.log(checked.join("\n"));
if (failures.length) {
  console.error(`\nРасхождений с источниками: ${failures.length}`);
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}
console.log(`\nСравнение сходится с источниками: ${checked.length} проверок`);
