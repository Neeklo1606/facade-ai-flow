/**
 * Поиск «Монохрома» (ADR-055, раздел 2.6): индекс по данным роли и сопоставление запроса.
 *
 * Без учёта регистра и «ё/е», по началу слов и по номерам: «42» находит «ГЗ-00042»,
 * «дем луг» находит «х. Демо-Луговой». Индекс строит контур из данных своих портов,
 * права режутся здесь же: бригадир не находит сумм, чужих записей, смет и людей.
 * Логика чистая, без React: её проверяет bun test, палитра только рисует результат.
 */

export type SearchGroup =
  | "actions"
  | "records"
  | "objects"
  | "brigades"
  | "estimates"
  | "requests"
  | "suppliers"
  | "documents"
  | "people";

export const GROUP_LABEL: Record<SearchGroup, string> = {
  actions: "Действия",
  records: "Записи",
  objects: "Объекты",
  brigades: "Бригады",
  estimates: "Сметы",
  requests: "Заявки",
  suppliers: "Поставщики",
  documents: "Документы",
  people: "Люди",
};

/** Порядок групп в выдаче: действия первыми, дальше от частого к редкому */
export const GROUP_ORDER: readonly SearchGroup[] = [
  "actions",
  "records",
  "objects",
  "brigades",
  "estimates",
  "requests",
  "suppliers",
  "documents",
  "people",
];

export interface SearchItem {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle?: string | undefined;
  /** Адрес перехода; у действия может не быть адреса, тогда его выполняет палитра */
  to?: string | undefined;
  search?: Record<string, string> | undefined;
  /** Ключ действия палитры: «theme» и т. п. */
  action?: string | undefined;
  /** Слова, по которым ещё ищется, но которые не показываются */
  keywords?: readonly string[] | undefined;
}

/** Нижний регистр, «ё» как «е», одинарные пробелы */
export function normalize(text: string): string {
  return text.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Слова текста: буквы и цифры, дефис и точка разделяют («ГЗ-00042» → «гз», «00042») */
export function words(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const stripZeros = (digits: string) => digits.replace(/^0+(?=\d)/, "");

/** Подходит ли слово запроса к слову текста: начало слова, у номеров без ведущих нулей */
function tokenMatches(token: string, word: string): boolean {
  if (word.startsWith(token)) return true;
  if (/^\d+$/.test(token) && /^\d+$/.test(word)) {
    return stripZeros(word).startsWith(stripZeros(token));
  }
  return false;
}

/**
 * Насколько элемент подходит запросу; 0 — не подходит. Каждое слово запроса должно найтись
 * в начале какого-то слова. Совпадение в названии весит больше, чем в подписи.
 */
export function score(item: SearchItem, query: string): number {
  const tokens = words(query);
  if (tokens.length === 0) return 0;
  const title = words(item.title);
  const rest = [...words(item.subtitle ?? ""), ...(item.keywords ?? []).flatMap(words)];
  let total = 0;
  for (const token of tokens) {
    const inTitle = title.find((word) => tokenMatches(token, word));
    if (inTitle) {
      total += inTitle === token ? 4 : 3;
      continue;
    }
    if (rest.some((word) => tokenMatches(token, word))) {
      total += 1;
      continue;
    }
    return 0;
  }
  return total;
}

export interface SearchGroupResult {
  group: SearchGroup;
  label: string;
  items: SearchItem[];
}

/** Выдача по группам: в группе до limit элементов по убыванию веса, группы в GROUP_ORDER */
export function searchIndex(
  index: readonly SearchItem[],
  query: string,
  limit = 6,
): SearchGroupResult[] {
  const scored = index
    .map((item) => ({ item, weight: score(item, query) }))
    .filter((row) => row.weight > 0);
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    items: scored
      .filter((row) => row.item.group === group)
      .sort((a, b) => b.weight - a.weight || a.item.title.localeCompare(b.item.title, "ru"))
      .slice(0, limit)
      .map((row) => row.item),
  })).filter((result) => result.items.length > 0);
}

/**
 * Куски текста с подсветкой совпадений: начала слов, которые совпали со словами запроса.
 * Сравнение по нормализованному тексту, куски — из исходного (длина «ё» и «е» одна).
 */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = words(query);
  if (tokens.length === 0) return [{ text, hit: false }];
  const norm = text.toLocaleLowerCase("ru").replace(/ё/g, "е");
  const marks = new Array<boolean>(text.length).fill(false);
  for (const match of norm.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = match[0];
    const at = match.index ?? 0;
    for (const token of tokens) {
      if (word.startsWith(token)) {
        for (let i = 0; i < token.length; i++) marks[at + i] = true;
      } else if (/^\d+$/.test(token) && /^\d+$/.test(word)) {
        const zeros = word.length - stripZeros(word).length;
        const t = stripZeros(token);
        if (stripZeros(word).startsWith(t)) {
          for (let i = 0; i < t.length; i++) marks[at + zeros + i] = true;
        }
      }
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else parts.push({ text: text[i]!, hit: marks[i]! });
  }
  return parts;
}

/* ---------------------------------------------------------------- Недавние запросы */

export const RECENT_KEY = "neeklo-search-recent";
const RECENT_LIMIT = 5;

/** Добавить запрос в недавние: свежий первым, без повторов, до пяти */
export function pushRecent(list: readonly string[], query: string): string[] {
  const q = query.trim();
  if (!q) return [...list];
  return [q, ...list.filter((item) => normalize(item) !== normalize(q))].slice(0, RECENT_LIMIT);
}
