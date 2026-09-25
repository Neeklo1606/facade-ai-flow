import { describe, expect, test } from "bun:test";
import writeXlsxFile from "write-excel-file/node";
import { readXlsx } from "@/lib/xlsx-read";

/**
 * Разбор .xlsx (ADR-023, п. 4). Проверка круговая: файл пишется тем же `write-excel-file`,
 * которым продукт делает выгрузки, и читается нашим разбором. Свой разбор чужого формата —
 * место, где ломается то, чего мы не писали, и держать его должен опыт, а не вера.
 */

async function xlsx(rows: (string | number)[][]) {
  // Сборка `/node` всегда отдаёт `{ toBuffer, toStream, toFile }` — отдельная настройка не нужна
  const written = await writeXlsxFile(
    rows.map((row) =>
      row.map((value) =>
        typeof value === "number" ? { type: Number, value } : { type: String, value },
      ),
    ),
  );
  const buffer = await written.toBuffer();
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe("чтение xlsx", () => {
  test("строки и колонки возвращаются как в файле", async () => {
    const file = await xlsx([
      ["Наименование", "Ед.", "Категория"],
      ["Кронштейн КР-150 оцинкованный", "шт", "Подконструкция"],
      ["Керамогранит 600×600, антрацит", "м²", "Облицовка"],
    ]);
    const { rows, total } = await readXlsx(file);
    expect(total).toBe(3);
    expect(rows[0]).toEqual(["Наименование", "Ед.", "Категория"]);
    expect(rows[1]?.[0]).toBe("Кронштейн КР-150 оцинкованный");
    expect(rows[2]?.[1]).toBe("м²");
  });

  test("числа читаются числами, а не ссылками на общий список", async () => {
    const file = await xlsx([
      ["Материал", "Количество"],
      ["Анкер клиновой 10×100", 2400],
    ]);
    const { rows } = await readXlsx(file);
    expect(rows[1]?.[1]).toBe("2400");
  });

  test("кавычки и амперсанд не превращаются в разметку", async () => {
    const file = await xlsx([["Наименование"], ["Нащельник «угловой» & примыкание <АР>"]]);
    const { rows } = await readXlsx(file);
    expect(rows[1]?.[0]).toBe("Нащельник «угловой» & примыкание <АР>");
  });

  test("предпросмотр берёт часть строк, но говорит, сколько их всего", async () => {
    const many = [["Наименование"], ...Array.from({ length: 50 }, (_, i) => [`Материал ${i + 1}`])];
    const { rows, total } = await readXlsx(await xlsx(many), 5);
    expect(rows).toHaveLength(5);
    expect(total).toBe(51);
  });

  test("пустые ячейки не сдвигают колонки", async () => {
    const file = await xlsx([
      ["Наименование", "Ед.", "Категория"],
      ["Мембрана ветрозащитная", "", "Утепление"],
    ]);
    const { rows } = await readXlsx(file);
    expect(rows[1]).toEqual(["Мембрана ветрозащитная", "", "Утепление"]);
  });

  test("чужой файл отвергается понятной ошибкой, а не падением разбора", async () => {
    const notZip = new TextEncoder().encode("это не файл Excel").buffer as ArrayBuffer;
    await expect(readXlsx(notZip)).rejects.toThrow(/не файл Excel|Повреждённый/u);
  });
});
