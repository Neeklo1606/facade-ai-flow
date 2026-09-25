/**
 * Разбор .xlsx без зависимостей (ADR-023, п. 4). Файл Excel — это zip, внутри которого XML:
 * `xl/sharedStrings.xml` со всеми текстами книги и `xl/worksheets/sheet1.xml` с ячейками,
 * где текст лежит ссылкой на общий список.
 *
 * Берём ровно это и ничего больше: строки первого листа как строки. Формулы не вычисляем —
 * Excel сохраняет рядом посчитанное значение, его и читаем. Даты приходят числом: сколько
 * дней от 30.12.1899, — переводим, потому что в выгрузках из 1С даты встречаются.
 */

/** Локальный заголовок файла в zip: сигнатура, метод сжатия, размеры, имя */
interface Entry {
  name: string;
  method: number;
  data: Uint8Array;
}

const u16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u32 = (b: Uint8Array, i: number) =>
  (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;

/**
 * Записи zip читаются по центральному каталогу с конца файла: только он даёт настоящие
 * размеры. У локальных заголовков они бывают нулевыми — там, где писавший выбрал потоковую
 * запись, а размеры отправил после данных.
 */
function entries(zip: Uint8Array): Entry[] {
  let end = zip.length - 22;
  while (end >= 0 && u32(zip, end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("Это не файл Excel: не найден конец zip-архива");
  const count = u16(zip, end + 10);
  let at = u32(zip, end + 16);
  const found: Entry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (u32(zip, at) !== 0x02014b50) throw new Error("Повреждённый архив: сбит каталог");
    const method = u16(zip, at + 10);
    const size = u32(zip, at + 20);
    const nameLength = u16(zip, at + 28);
    const extraLength = u16(zip, at + 30);
    const commentLength = u16(zip, at + 32);
    const offset = u32(zip, at + 42);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    // Данные лежат за локальным заголовком, длина его полей своя
    const localName = u16(zip, offset + 26);
    const localExtra = u16(zip, offset + 28);
    const start = offset + 30 + localName + localExtra;
    found.push({ name, method, data: zip.subarray(start, start + size) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return found;
}

/** Распаковка: `deflate-raw` есть и в браузере, и в Node — отдельный распаковщик не нужен */
async function inflate(entry: Entry): Promise<string> {
  if (entry.method === 0) return new TextDecoder().decode(entry.data);
  if (entry.method !== 8) throw new Error(`Неизвестное сжатие в архиве: ${entry.method}`);
  const stream = new Blob([entry.data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

/** Тексты книги: каждая строка — набор кусков `<t>`, между ними форматирование */
function sharedStrings(xml: string): string[] {
  const list: string[] = [];
  for (const item of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...item[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]!);
    list.push(unescapeXml(parts.join("")));
  }
  return list;
}

/** Номер колонки из адреса ячейки: A → 0, B → 1, AA → 26 */
function columnIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** Excel хранит дату числом дней от 30.12.1899 */
function excelDate(serial: number) {
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

export interface SheetRead {
  /** Строки листа; короткие строки дополнены пустыми ячейками до ширины таблицы */
  rows: string[][];
  /** Сколько строк в файле было: предпросмотр показывает часть, отчёт — всё */
  total: number;
}

/**
 * Первый лист книги как строки. `limit` ограничивает разбор: предпросмотру хватает десяти
 * строк, и незачем разворачивать в память файл на тысячи.
 */
export async function readXlsx(file: ArrayBuffer, limit = Infinity): Promise<SheetRead> {
  const zip = new Uint8Array(file);
  const list = entries(zip);
  const sheetEntry =
    list.find((item) => item.name === "xl/worksheets/sheet1.xml") ??
    list.find((item) => item.name.startsWith("xl/worksheets/"));
  if (!sheetEntry) throw new Error("В файле нет листов Excel");
  const stringsEntry = list.find((item) => item.name === "xl/sharedStrings.xml");
  const strings = stringsEntry ? sharedStrings(await inflate(stringsEntry)) : [];
  const xml = await inflate(sheetEntry);

  const rows: string[][] = [];
  let total = 0;
  /*
   * Пустые строки и ячейки Excel пишет самозакрывающимися: `<c r="B2" s="1"/>`. Регулярное
   * выражение без этой ветки склеивало такую ячейку со следующей — значение соседа
   * оказывалось в чужой колонке. Выгрузка из 1С полна таких ячеек, и сдвиг был бы молчаливым.
   */
  for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    total += 1;
    if (rows.length >= limit) continue;
    const cells: string[] = [];
    for (const cell of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]!;
      const body = cell[2];
      // Самозакрывающаяся ячейка пуста: колонку не занимаем, дыру дополнит выравнивание ниже
      if (body === undefined) continue;
      const at = columnIndex(/r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "A1");
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      let value: string;
      if (type === "s") value = strings[Number(raw)] ?? "";
      else if (type === "inlineStr")
        value = unescapeXml(/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? "");
      else if (type === "d") value = raw.slice(0, 10);
      else {
        const style = /s="(\d+)"/.exec(attrs)?.[1];
        // Дата отличается от числа только стилем; формат книги мы не читаем, поэтому
        // считаем датой только то, что похоже на неё и стоит в колонке со стилем
        value =
          style && raw && Number(raw) > 20_000 && Number(raw) < 60_000 && !raw.includes(".")
            ? excelDate(Number(raw))
            : unescapeXml(raw);
      }
      cells[at] = value.trim();
    }
    const width = cells.length;
    rows.push(Array.from({ length: width }, (_, i) => cells[i] ?? ""));
  }
  /*
   * Хвост из пустых строк Excel держит в файле после удаления данных. Обрезаем только хвост:
   * пустая строка в середине остаётся на месте, чтобы номера строк в отчёте о загрузке
   * совпадали с номерами в файле — по ним человек и правит выгрузку.
   */
  while (rows.length && rows[rows.length - 1]!.every((cell) => cell === "")) {
    rows.pop();
    total -= 1;
  }
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return { rows: rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? "")), total };
}
