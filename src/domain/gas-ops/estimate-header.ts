/**
 * Шапка сметы (ADR-077): наименование работ и объекта, адрес, номер, дата, вид работ.
 * Чистые функции над сеткой строк. Правило одно: значение берётся из строки файла и несёт её
 * номер; не нашли — поле пустое с причиной, догадок нет.
 *
 * Ресурсная смета (КП): наименование стоит строкой выше подписи
 * «(наименование работ и затрат, наименование объекта)», номер КП и дата — в верхних строках.
 * ГРАНД-Смета: наименование объекта над «(наименование объекта капитального строительства)»,
 * работ — над «(наименование работ и затрат)», номер — «к Договору № …».
 */
import type {
  EstimateAddress,
  EstimateFormat,
  EstimateHeader,
  Grid,
  HeaderField,
} from "./estimate-labels";

const text = (cell: unknown): string =>
  typeof cell === "string" ? cell.replace(/\s+/g, " ").trim() : "";

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

const none = (reason: string): HeaderField => ({ value: null, row: null, reason });

/** Сколько верхних строк смотреть: шапка не ниже таблицы */
const HEAD_ROWS = 60;

/** Тексты строки слева направо без пустых */
function rowTexts(row: unknown[] | undefined): string[] {
  return (row ?? []).map(text).filter(Boolean);
}

/** Строка с подписью-подсказкой: «(наименование …)» */
function findCaption(grid: Grid, test: (t: string) => boolean): number | null {
  for (let i = 0; i < Math.min(grid.length, HEAD_ROWS); i++) {
    if (rowTexts(grid[i]).some((t) => test(norm(t)))) return i;
  }
  return null;
}

/** Ближайшая непустая строка выше подписи, не служебная подпись в скобках */
function valueAbove(grid: Grid, captionIndex: number): { value: string; row: number } | null {
  for (let i = captionIndex - 1; i >= Math.max(0, captionIndex - 3); i--) {
    const found = rowTexts(grid[i]).find(
      (t) => !t.startsWith("(") && !/^_+$/.test(t) && !/^от\s*_/i.test(t),
    );
    if (found) return { value: found, row: i + 1 };
  }
  return null;
}

/** Номер КП или договора: «105144-З-26-СМР», «Д-88-2026-26-СМР» */
const DOC_NUMBER = /^[\p{L}\p{N}]+(?:[-–][\p{L}\p{N}]+){2,}$/u;

function findNumber(grid: Grid, format: EstimateFormat): HeaderField {
  for (let i = 0; i < Math.min(grid.length, HEAD_ROWS); i++) {
    for (const t of rowTexts(grid[i])) {
      const contract = /к\s+договору\s*№\s*([^\s,;]+)/i.exec(t);
      if (contract?.[1] && /\d/.test(contract[1])) {
        return { value: contract[1], row: i + 1, confidence: "high" };
      }
      const estimate = /(?:смет\p{L}*|расчет\p{L}*|предложени\p{L}*)\s*№\s*([^\s,;]+)/iu.exec(t);
      if (estimate?.[1] && /\d/.test(estimate[1])) {
        return { value: estimate[1], row: i + 1, confidence: "high" };
      }
      if (format === "resource" && DOC_NUMBER.test(t) && /\d/.test(t) && /\p{L}/u.test(t)) {
        return { value: t, row: i + 1, confidence: "medium" };
      }
    }
  }
  return none(
    format === "grand"
      ? "Номера сметы нет: строка «ЛОКАЛЬНЫЙ СМЕТНЫЙ РАСЧЕТ (СМЕТА) №» пустая, договора в шапке нет"
      : "В шапке нет номера КП или сметы",
  );
}

/** Дата «От __10___ _____07_____ 2026» или «от 10.07.2026» */
function findDate(grid: Grid): HeaderField {
  for (let i = 0; i < Math.min(grid.length, HEAD_ROWS); i++) {
    for (const t of rowTexts(grid[i])) {
      const blanks = /^от\s*_*\s*(\d{1,2})\s*_*\s+_*\s*(\d{1,2})\s*_*\s*(\d{4})/i.exec(t);
      const dotted = /^от\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(t);
      const m = blanks ?? dotted;
      if (!m) continue;
      const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
      const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return { value: iso, row: i + 1, confidence: "high" };
    }
  }
  return none("Даты документа в шапке нет");
}

/* ---------------------------------------------------------------- Адрес */

const SETTLEMENT =
  /(?:^|[\s,(])(г\.|с\.|х\.|ст-ца|ст\.|п\.|пос\.|пгт\.?|д\.|аул|хутор|станица|село|город)\s*([А-ЯЁ][а-яё]+(?:-[а-яё]+-[А-ЯЁ][а-яё]+|-[А-ЯЁа-яё]+)*)/u;
const STREET =
  /(ул\.|улица|пер\.|переулок|пр-т|проспект|пр\.|ш\.|шоссе|б-р|бульвар|мкр\.?|микрорайон|пл\.|площадь|проезд)\s*([А-ЯЁ0-9][\p{L}0-9 .-]*?)\s*,\s*(?:д\.\s*)?(\d+(?:[А-ЯЁа-яё](?![\p{L}])|\s[А-ЯЁ](?![\p{L}]))?(?:\/\d+)?)/u;
const APARTMENT = /кв\.?\s*(\d+)/i;

/** Адрес из наименования: населённый пункт, улица, дом, квартира. Падеж как в файле */
export function parseAddress(name: string): EstimateAddress | null {
  const s = name.replace(/\s+/g, " ");
  const street = STREET.exec(s);
  const settlement = SETTLEMENT.exec(s);
  const apartment = APARTMENT.exec(s);
  if (!street && !settlement) return null;
  return {
    settlement: settlement ? `${settlement[1]} ${settlement[2]}` : null,
    street: street ? `${street[1]} ${street[2]!.trim()}` : null,
    house: street ? street[3]!.replace(/\s+/g, " ").trim() : null,
    apartment: apartment ? apartment[1]! : null,
  };
}

/** Начало наименования до адреса: «Перемонтаж дворового газопровода» */
function workKindOf(name: string): string | null {
  const s = name.replace(/\s+/g, " ").trim();
  const at = s.search(
    /\s(?:по|на)\s+(?:ул\.|улиц|пер\.|переул|пр-т|просп|ш\.|б-р|мкр|пл\.|проезд)/i,
  );
  const kind = (at > 0 ? s.slice(0, at) : "").trim().replace(/[,.]$/, "");
  return kind.length >= 5 ? kind : null;
}

/* ---------------------------------------------------------------- Шапка */

export function parseEstimateHeader(grid: Grid, format: EstimateFormat): EstimateHeader {
  let works: HeaderField = none("Не нашли подпись «(наименование работ и затрат)»");
  let object: HeaderField = none("Не нашли подпись «(наименование объекта)»");
  let docKind: HeaderField = none("Вид документа в шапке не назван");

  if (format === "resource") {
    const caption = findCaption(grid, (t) => t.startsWith("(наименование работ и затрат"));
    const found = caption !== null ? valueAbove(grid, caption) : null;
    if (found) {
      works = { ...found, confidence: "high" };
      // Одна строка на работы и объект: подпись так и называется
      object = { ...found, confidence: "high" };
    } else if (caption !== null) {
      works = none("Над подписью «(наименование работ и затрат …)» пусто");
      object = works;
    }
  } else {
    const objectCaption = findCaption(grid, (t) =>
      t.startsWith("(наименование объекта капитального строительства"),
    );
    const objectFound = objectCaption !== null ? valueAbove(grid, objectCaption) : null;
    if (objectFound) object = { ...objectFound, confidence: "high" };
    const worksCaption = findCaption(grid, (t) => t === "(наименование работ и затрат)");
    const worksFound = worksCaption !== null ? valueAbove(grid, worksCaption) : null;
    if (worksFound) works = { ...worksFound, confidence: "high" };
  }

  for (let i = 0; i < Math.min(grid.length, HEAD_ROWS); i++) {
    const t = rowTexts(grid[i]).find((x) =>
      /^(коммерческое предложение|локальный (ресурсный )?сметный расчет)/i.test(norm(x)),
    );
    if (t) {
      docKind = { value: t.replace(/\s*№\s*$/, "").trim(), row: i + 1, confidence: "high" };
      break;
    }
  }

  // Адрес и вид работ — из наименования объекта, если его нет — из наименования работ
  const source = object.value !== null ? object : works;
  let address: EstimateHeader["address"] = {
    value: null,
    row: null,
    reason: "Нет наименования объекта, адрес не из чего выделить",
  };
  let workKind: HeaderField = none("Нет наименования работ");
  if (source.value !== null) {
    const parsed = parseAddress(source.value);
    address = parsed
      ? { value: parsed, row: source.row }
      : { value: null, row: null, reason: "В наименовании нет улицы и населённого пункта" };
    const kind = workKindOf(works.value ?? source.value);
    workKind = kind
      ? { value: kind, row: works.row ?? source.row, confidence: "medium" }
      : none("Вид работ не отделяется от адреса в наименовании");
  }

  return {
    works,
    object,
    address,
    number: findNumber(grid, format),
    date: findDate(grid),
    workKind,
    docKind,
  };
}

/* ---------------------------------------------------------------- Ключ адреса */

/** Окончания падежей: «Вишневой» и «Вишневая», «Нещадимовском» и «Нещадимовский» дают одно */
const ENDINGS =
  /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ской|ском|ский|ская|ское|ской|ой|ей|ая|яя|ое|ее|ые|ие|ом|ем|ам|ям|ах|ях|ий|ый|ую|юю|а|я|е|и|ы|у|ю|о)$/;

function stem(word: string): string {
  if (word.length < 5) return word;
  const cut = word.replace(ENDINGS, "");
  // «ском» и «ский» оставляют «ск»: «нещадимовск»
  return cut.length >= 3 ? cut : word;
}

function words(s: string): string[] {
  return norm(s)
    .replace(
      /(^|\s)(г|с|х|ст|п|пос|пгт|д|ул|пер|пр|ш|мкр|пл|кв|дом|улица|переулок)\.?(?=\s|$)/g,
      " ",
    )
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);
}

/**
 * Нормализованный ключ адреса: населённый пункт, улица, дом, квартира без сокращений и падежей.
 * «ул. Курская, 22, кв. 2 в г. Славянске-на-Кубани» и «г. Славянск-на-Кубани, ул. Курская 22-2»
 * сводятся к сравнимым частям. Пустой адрес — null
 */
export function addressKey(a: EstimateAddress | null | undefined): string | null {
  if (!a || (!a.street && !a.settlement)) return null;
  const house = a.house ? norm(a.house).replace(/\s+/g, "") : "";
  return [
    a.settlement ? words(a.settlement).join(" ") : "",
    a.street ? words(a.street).join(" ") : "",
    house,
    a.apartment ? `кв${a.apartment}` : "",
  ].join("|");
}

/** Слова адреса для «похожего» объекта: без номера дома, со стеммингом */
export function addressWords(s: string): Set<string> {
  return new Set(words(s).filter((w) => w.length >= 3 || /^\d+[\p{L}]?$/u.test(w)));
}

/** Номер сметы к сравнимому виду: «105144-З-26-СМР» и «105144 з 26 смр» равны */
export function numberKey(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = norm(s).replace(/[^\p{L}\p{N}]+/gu, "");
  return k.length >= 3 ? k : null;
}

/** Адрес строкой для подписи объекта: «Славянск-на-Кубани, ул. Курская, 22, кв. 2» */
export function addressLine(a: EstimateAddress): string {
  return [
    a.street ? `${a.street}${a.house ? `, ${a.house}` : ""}` : null,
    a.apartment ? `кв. ${a.apartment}` : null,
    a.settlement,
  ]
    .filter(Boolean)
    .join(", ");
}
