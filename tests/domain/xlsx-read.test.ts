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

/**
 * Файл, собранный руками: `write-excel-file` не пишет самозакрывающихся ячеек, а Excel и
 * выгрузки из 1С пишут. Проверять разбор только на своём писателе — значит проверять себя.
 * Записи кладём без сжатия (метод 0): разбор его поддерживает, и zip получается читаемым.
 */
function storedZip(files: { name: string; text: string }[]) {
  const encoder = new TextEncoder();
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const sum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, sum, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const head = new DataView(entry.buffer);
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(6, 20, true);
    head.setUint32(16, sum, true);
    head.setUint32(20, data.length, true);
    head.setUint32(24, data.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const tail = new DataView(end.buffer);
  tail.setUint32(0, 0x06054b50, true);
  tail.setUint16(8, files.length, true);
  tail.setUint16(10, files.length, true);
  tail.setUint32(12, centralSize, true);
  tail.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const size = all.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const item of all) {
    out.set(item, at);
    at += item.length;
  }
  return out.buffer;
}

const sheet = (rows: string) =>
  storedZip([
    {
      name: "xl/sharedStrings.xml",
      text: "<sst><si><t>Кронштейн</t></si><si><t>шт</t></si><si><t>Подконструкция</t></si></sst>",
    },
    {
      name: "xl/worksheets/sheet1.xml",
      text: `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
    },
  ]);

describe("xlsx из чужого писателя", () => {
  test("самозакрывающаяся пустая ячейка не сдвигает соседей", async () => {
    const { rows } = await readXlsx(
      sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"/><c r="C1" t="s"><v>1</v></c></row>',
      ),
    );
    // Раньше значение C1 оказывалось в колонке A: регулярное выражение съедало пустую ячейку
    expect(rows[0]).toEqual(["Кронштейн", "", "шт"]);
  });

  test("самозакрывающаяся пустая строка остаётся строкой", async () => {
    const { rows, total } = await readXlsx(
      sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"/><row r="3"><c r="A3" t="s"><v>2</v></c></row>',
      ),
    );
    expect(total).toBe(3);
    expect(rows[1]).toEqual([""]);
    expect(rows[2]).toEqual(["Подконструкция"]);
  });

  test("хвост из пустых строк не превращается в непринятые строки", async () => {
    const { rows, total } = await readXlsx(
      sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"/><row r="3"/>'),
    );
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
  });
});
