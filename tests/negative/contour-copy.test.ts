import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DEMO_ONLY_NOTES, PROMISE_NOTES, demoOnly, note } from "@/lib/contour-copy";

/**
 * Честность в обоих контурах. Находка аудита соответствия: окно загрузки обещало разбор
 * документа, а оговорка ставилась только при `dataSource === "demo"` — на реальном внедрении
 * обещание оставалось без пометки, хотя разбора нет и там.
 *
 * Правило: обещание, помеченное в демонстрации, обязано иметь пару для рабочего контура.
 * Исключения — только то, что существует из-за самой имитации, и у каждого записана причина.
 */

const ROOT = new URL("../..", import.meta.url).pathname;
const UI = ["src/components", "src/routes"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const ui = UI.flatMap((dir) => files(join(ROOT, dir))).map((full) => ({
  path: relative(ROOT, full),
  text: readFileSync(full, "utf8"),
}));

describe("пометки контуров", () => {
  test("у каждого обещания две редакции, и они разные", () => {
    for (const [id, pair] of Object.entries(PROMISE_NOTES)) {
      expect(pair.demo.length, id).toBeGreaterThan(20);
      expect(pair.server.length, id).toBeGreaterThan(20);
      expect(pair.server, `${id}: редакции совпали — значит пары нет`).not.toBe(pair.demo);
      // Рабочая редакция не говорит «в демонстрации»: это текст для заказчика
      expect(/демонстрац/i.test(pair.server), `${id}: рабочая редакция про демонстрацию`).toBe(
        false,
      );
    }
  });

  test("у каждой пометки без пары записана причина", () => {
    for (const [id, only] of Object.entries(DEMO_ONLY_NOTES)) {
      expect(only.text.length, id).toBeGreaterThan(10);
      expect(only.why.length, `${id}: не сказано, почему пары нет`).toBeGreaterThan(30);
    }
  });

  test("в рабочем контуре обещание помечено, а имитация молчит", () => {
    expect(note("upload", "server")).toContain("подключается отдельно");
    expect(note("upload", "demo")).toContain("демонстрации");
    expect(demoOnly("shipment", "server")).toBe("");
    expect(demoOnly("shipment", "demo").length).toBeGreaterThan(10);
  });

  test("экраны не решают сами, что показать в каком контуре", () => {
    /*
     * Текст, завязанный на `dataSource === "demo"` прямо в разметке, — это и есть способ
     * потерять пару для рабочего контура. Разрешены два места, где разница настоящая:
     * метка демонстрации и сброс демо-данных. Обоих в рабочем контуре не существует.
     */
    const allowed = new Map([
      ["src/components/layout/Topbar.tsx", "метка «Демо» — в рабочем контуре данные настоящие"],
      ["src/components/layout/Sidebar.tsx", "«Сбросить демо-данные» — сбрасывать нечего"],
    ]);
    const offenders = ui
      .filter((file) => /dataSource\s*===\s*"demo"|dataSource\s*!==\s*"demo"/.test(file.text))
      .map((file) => file.path)
      .filter((path) => !allowed.has(path));
    expect(offenders).toEqual([]);
  });

  test("обход проверки закрыт: сырые тексты пометок не разбросаны по экранам", () => {
    const raw = ui.filter((file) => /В демонстрации [а-я]/.test(file.text)).map((f) => f.path);
    expect(raw, "пометка написана строкой на экране, а не взята из contour-copy").toEqual([]);
  });
});
