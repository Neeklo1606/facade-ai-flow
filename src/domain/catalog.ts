/**
 * Номенклатура, категории и поставщики (ADR-014). Чистые правила: их вызывают фикстуры,
 * демо-адаптер, будущий адаптер БД и экраны через слой данных.
 */
import type {
  ContactStatus,
  Delivery,
  Material,
  MaterialCategory,
  SupplierOffer,
  SupplyRequest,
} from "@/contracts";
import { wallMs } from "./time";

/* ---------- Текст наименования ---------- */

/** Нижний регистр, «ё» как «е», без знаков: сравниваем слова, а не оформление */
export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'(),.;:/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Основы слов: первые пять букв слова из букв; числа и марки («КР-150», «600×600») — целиком */
export function stems(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => (/^[а-яa-z]+$/.test(word) && word.length > 5 ? word.slice(0, 5) : word));
}

/* ---------- Предложение материала ---------- */

export interface MaterialSuggestion {
  materialId: string;
  /** Доля слов образца, найденных в наименовании: 0…1 */
  score: number;
  /** С чем совпало: название, синоним или типичное написание */
  matchedBy: string;
}

/** Порог, ниже которого система материал не предлагает */
export const SUGGESTION_THRESHOLD = 0.6;

/**
 * Какой материал справочника описывает проектное наименование (ADR-014, п. 2). Образцы —
 * название, синонимы и типичные написания. Оценка — доля основ образца, найденных в наименовании:
 * наименование длиннее образца (захватка, оси, этажи), и лишние слова не штрафуются.
 * Равные оценки — побеждает более длинный образец: он точнее.
 */
export function suggestMaterial(
  projectName: string,
  catalog: Pick<Material, "id" | "name" | "synonyms" | "spellings">[],
): MaterialSuggestion | null {
  const words = new Set(stems(projectName));
  let best: (MaterialSuggestion & { length: number }) | null = null;
  for (const material of catalog) {
    for (const sample of [material.name, ...material.synonyms, ...material.spellings]) {
      const pattern = stems(sample);
      if (!pattern.length) continue;
      const found = pattern.filter((stem) => words.has(stem)).length;
      const score = found / pattern.length;
      if (!best || score > best.score || (score === best.score && pattern.length > best.length)) {
        best = { materialId: material.id, score, matchedBy: sample, length: pattern.length };
      }
    }
  }
  if (!best || best.score < SUGGESTION_THRESHOLD) return null;
  return { materialId: best.materialId, score: best.score, matchedBy: best.matchedBy };
}

/* ---------- Категории ---------- */

/** Категория верхнего уровня для любой категории дерева */
export function topCategory(categoryId: string, categories: MaterialCategory[]) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  let current = byId.get(categoryId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return current ?? null;
}

/**
 * Категория по наименованию: правило категории — основы слов; побеждает категория, чьё правило
 * нашлось в наименовании, из нескольких — более глубокая в дереве (точнее)
 */
export function categoryFor(name: string, categories: MaterialCategory[]) {
  const text = normalizeText(name);
  const depth = (item: MaterialCategory) => {
    let level = 0;
    let parent = item.parentId;
    while (parent && level < 10) {
      level += 1;
      parent = categories.find((c) => c.id === parent)?.parentId ?? null;
    }
    return level;
  };
  const hits = categories.filter((item) =>
    item.rules.some((rule) => text.includes(normalizeText(rule))),
  );
  return hits.sort((a, b) => depth(b) - depth(a) || a.sortOrder - b.sortOrder)[0] ?? null;
}

/* ---------- Подбор поставщиков ---------- */

export interface SupplierCandidate {
  supplierId: string;
  /** Категории верхнего уровня, которые поставщик закрывает из нужных запросу */
  matched: string[];
  regionMatch: boolean;
}

/**
 * Кому уходит запрос (ADR-014, п. 6): поставщики, чьи категории пересекаются с категориями
 * материалов запроса. Регион объекта — первым, затем по числу закрытых категорий.
 */
export function suppliersFor(
  needed: string[],
  region: string,
  profiles: { supplierId: string; region: string; categories: string[] }[],
): SupplierCandidate[] {
  const wanted = new Set(needed);
  return profiles
    .map((profile) => ({
      supplierId: profile.supplierId,
      matched: profile.categories.filter((category) => wanted.has(category)),
      regionMatch: profile.region === region,
    }))
    .filter((candidate) => candidate.matched.length > 0)
    .sort(
      (a, b) =>
        Number(b.regionMatch) - Number(a.regionMatch) || b.matched.length - a.matched.length,
    );
}

/* ---------- Карточка поставщика ---------- */

const DAY = 86_400_000;

/**
 * Свежесть контакта по дате проверки (ADR-014, п. 7): до 90 дней — проверен, до 180 — требует
 * проверки, дольше — устарел. Метка следует за датой, а не задаётся руками.
 */
export function contactFreshness(checkedAt: string, now: string): ContactStatus {
  const days = Math.floor((wallMs(now.slice(0, 10)) - wallMs(checkedAt.slice(0, 10))) / DAY);
  if (days <= 90) return "verified";
  if (days <= 180) return "needs_check";
  return "stale";
}

export interface SupplierStats {
  /** Запросы, отправленные поставщику */
  requests: number;
  /** На сколько он ответил предложением */
  answered: number;
  /** Среднее время ответа по фактическим предложениям, ч; null — ответов не было */
  avgReplyHours: number | null;
  /** Принятые поставки не позже ожидаемой даты; null — принятых поставок не было */
  onTimeShare: number | null;
  deliveriesReceived: number;
}

export function supplierStats(
  supplierId: string,
  s: { requests: SupplyRequest[]; offers: SupplierOffer[]; deliveries: Delivery[] },
): SupplierStats {
  const sent = s.requests.filter((request) => request.sentTo.includes(supplierId));
  const replies = sent.flatMap((request) => {
    const offer = s.offers.find(
      (item) => item.requestId === request.id && item.supplierId === supplierId,
    );
    return offer && request.sentAt ? [wallMs(offer.receivedAt) - wallMs(request.sentAt)] : [];
  });
  const received = s.deliveries.filter(
    (item) => item.supplierId === supplierId && item.receivedAt !== null,
  );
  const onTime = received.filter(
    (item) => wallMs(item.receivedAt!.slice(0, 10)) <= wallMs(item.expectedAt.slice(0, 10)),
  );
  return {
    requests: sent.length,
    answered: replies.length,
    avgReplyHours: replies.length
      ? Math.round(replies.reduce((acc, ms) => acc + ms, 0) / replies.length / 3_600_000)
      : null,
    onTimeShare: received.length ? onTime.length / received.length : null,
    deliveriesReceived: received.length,
  };
}
