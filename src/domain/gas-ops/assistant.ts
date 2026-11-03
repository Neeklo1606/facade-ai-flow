/**
 * Помощник (ADR-061, 13; раздел 4.8 документа табеля): правило-движок по заготовленным
 * вопросам. Ответ строится по данным недели теми же функциями, что экраны, и ссылается
 * на записи. Суммы видят только роли с финансами. Помощник может подготовить черновик
 * действия, но выполняет его человек: модель записи не принимает и не возвращает.
 */
import { fmtHours, hoursOfMinutes } from "./calc";
import { crewOn, headcountOf } from "./crew";
import { costBreakdown, costLine, entryInfo } from "./entry-info";
import type { Role, TimeEntry } from "./model";
import { entryView, type GasData } from "./view";
import type { CloseReason, CloseReasonKind } from "./week";

export type AssistantIntent = "close-week" | "overlaps" | "no-crew" | "brigade-hours" | "no-sum";

export interface AssistantItem {
  text: string;
  /** Ссылка на запись или экран; null — строка без перехода */
  to: string | null;
}

/** Черновик действия: выполняется только кнопкой человека */
export interface AssistantDraft {
  kind: "clarify";
  entryIds: string[];
  question: string;
  /** Подпись кнопки: «Вернуть 2 записи на уточнение» */
  label: string;
}

export interface AssistantAnswer {
  intent: AssistantIntent | null;
  text: string[];
  items: AssistantItem[];
  /** Откуда ответ: «по данным недели 28.09–03.10» */
  source: string;
  draft: AssistantDraft | null;
}

export interface AssistantContext {
  role: Role;
  data: GasData;
  /** Причины закрытия из той же выборки, что «Неделя» (`useGasWeekView`) */
  reasons: readonly CloseReason[];
}

/** Роли, которым видны суммы (таблица 3.3): бригадир и полевые роли сумм не видят */
export const MONEY_ROLES: readonly Role[] = ["admin", "manager", "director"];

const norm = (text: string) => text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const entryLink = (entry: Pick<TimeEntry, "number">) =>
  `/gas/entries?q=${encodeURIComponent(entry.number)}`;
const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** Какой это вопрос. null — свободный вопрос: без модели помощник на него не отвечает */
export function classify(question: string): AssistantIntent | null {
  const q = norm(question);
  if (/сумм/.test(q) && /(гз|запис|\d)/.test(q)) return "no-sum";
  if (/пересе/.test(q)) return "overlaps";
  if (/состав/.test(q)) return "no-crew";
  if (/час/.test(q) && /бригад/.test(q)) return "brigade-hours";
  if (/закры|мешает/.test(q)) return "close-week";
  return null;
}

/** Улица и дом из адреса объекта: «ул. Демо, 23» — так объект называют вслух */
function streetOf(label: string): string {
  const match = /((?:ул|пер|пр|пр-т|мкр)\.?\s[^,]+,\s*\d+[а-яa-z]?)/i.exec(label);
  return match ? match[1]! : label.split(" - ")[0]!;
}

/** Подсказанные вопросы раздела 4.8, примеры подставлены из данных недели */
export function suggestions(data: GasData): string[] {
  const week = new Set(data.week.days);
  const own = data.entries.filter((e) => week.has(e.day) && e.status !== "rejected");
  const list = [
    "Что мешает закрыть неделю?",
    "Записи с пересечением за неделю",
    "У каких бригад не указан состав?",
  ];
  const sample = own.find((e) => e.status === "pending") ?? own[0];
  const brigade = sample && data.brigades.find((b) => b.id === sample.brigadeId);
  const object = sample && data.objects.find((o) => o.id === sample.objectId);
  if (brigade && object)
    list.push(`Сколько часов у бригады ${brigade.code} на ${streetOf(object.label)}?`);
  const noSum = own.find((e) => e.amountRub === null);
  if (noSum) list.push(`Почему у записи ${noSum.number} нет суммы?`);
  return list;
}

const KIND_ORDER: CloseReasonKind[] = [
  "pending",
  "clarify",
  "final-check",
  "overlap",
  "missing",
  "no-estimate",
  "over-crew",
];

/** Ответ на вопрос. Без распознанного вопроса — список того, на что помощник отвечает */
export function answer(question: string, ctx: AssistantContext): AssistantAnswer {
  const { data } = ctx;
  const source = `По данным недели ${shortDay(data.week.from)}–${shortDay(data.week.to)}`;
  const week = new Set(data.week.days);
  const own = data.entries.filter((e) => week.has(e.day) && e.status !== "rejected");
  const intent = classify(question);
  const base = { intent, source, draft: null } as const;

  switch (intent) {
    case "close-week": {
      if (!ctx.reasons.length)
        return {
          ...base,
          text: ["Неделю можно закрывать: причин не осталось."],
          items: [{ text: "Открыть «Неделю»", to: "/gas/week" }],
        };
      const sorted = [...ctx.reasons].sort(
        (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
      );
      const hard = ctx.reasons.filter((r) => !r.acceptable).length;
      return {
        ...base,
        text: [
          `Закрыть неделю мешает причин: ${ctx.reasons.length}.`,
          hard
            ? `Из них ${hard} нельзя принять как есть: непроверенное не попадает в итог.`
            : "Все можно принять как есть с причиной на экране «Неделя».",
        ],
        items: [
          ...sorted.slice(0, 8).map((r) => {
            const first = r.entryIds[0];
            const entry = first ? data.entries.find((e) => e.id === first) : undefined;
            return { text: r.text, to: entry ? entryLink(entry) : "/gas/week" };
          }),
          ...(sorted.length > 8 ? [{ text: `И ещё ${sorted.length - 8}`, to: "/gas/week" }] : []),
        ],
      };
    }

    case "overlaps": {
      const overlaps = ctx.reasons.filter((r) => r.kind === "overlap");
      if (!overlaps.length)
        return { ...base, text: ["Пересечений времени за неделю нет."], items: [] };
      const ids = [...new Set(overlaps.flatMap((r) => r.entryIds))];
      const returnable = ids
        .map((id) => data.entries.find((e) => e.id === id))
        .filter((e): e is TimeEntry => !!e && e.status === "pending");
      return {
        ...base,
        text: [
          `Пересечений за неделю: ${overlaps.length}. Время одной бригады за день пересекается.`,
        ],
        items: overlaps.map((r) => {
          const entry = data.entries.find((e) => e.id === r.entryIds[0]);
          return { text: r.text, to: entry ? entryLink(entry) : "/gas/entries" };
        }),
        draft: returnable.length
          ? {
              kind: "clarify",
              entryIds: returnable.map((e) => e.id),
              question:
                "Время записи пересекается с другой записью бригады за этот день. Уточните начало и окончание.",
              label: `Вернуть ${returnable.length} ${plural(returnable.length, "запись", "записи", "записей")} на уточнение`,
            }
          : null,
      };
    }

    case "no-crew": {
      const without = data.brigades.filter(
        (b) => crewOn(data.crew ?? [], b.id, data.today).length === 0,
      );
      const noHeadcount = own.filter((e) => headcountOf(e) === null);
      return {
        ...base,
        text: [
          without.length
            ? `Без состава на ${shortDay(data.today)}: ${without.length} ${plural(without.length, "бригада", "бригады", "бригад")}.`
            : `У всех бригад состав указан на ${shortDay(data.today)}.`,
          noHeadcount.length
            ? `Записей недели без числа людей: ${noHeadcount.length}. Человеко-часы по ним не считаются.`
            : "У всех записей недели указано число людей.",
        ],
        items: [
          ...without.map((b) => ({ text: b.name, to: "/gas/brigades" })),
          ...(noHeadcount.length
            ? [{ text: "Записи без числа людей", to: "/gas/entries?crew=none" }]
            : []),
        ],
      };
    }

    case "brigade-hours":
      return brigadeHours(question, ctx, own, base);

    case "no-sum":
      return noSum(question, ctx, base);

    default:
      return {
        ...base,
        text: [
          "Без подключённой модели помощник отвечает только на эти вопросы. Нажмите вопрос, чтобы задать его.",
        ],
        items: suggestions(data).map((text) => ({ text, to: null })),
      };
  }
}

type Base = Pick<AssistantAnswer, "intent" | "source" | "draft">;

/** Слово вопроса совпадает со словом адреса по началу: «Вишнёвой» и «Вишнёвая» */
function tokenMatches(token: string, words: string[]): boolean {
  if (/^\d+[а-яa-z]?$/.test(token)) return words.includes(token);
  const stem = token.length > 4 ? token.slice(0, token.length - 2) : token;
  return words.some((w) => w.startsWith(stem));
}

function brigadeHours(
  question: string,
  ctx: AssistantContext,
  own: TimeEntry[],
  base: Base,
): AssistantAnswer {
  const { data } = ctx;
  const q = norm(question).replace(/\?/g, "");
  const code = /бригад\S*\s+(?:№\s*)?([\d.]+\d|\d)/.exec(q)?.[1];
  const brigade = code ? data.brigades.find((b) => b.code === code) : undefined;
  if (!brigade)
    return {
      ...base,
      text: [
        "Не нашёл бригаду в вопросе. Напишите номер: «Сколько часов у бригады 3 на ул. Демо, 23?»",
      ],
      items: [],
    };
  const place = /\sна\s(.+)$/.exec(q)?.[1] ?? "";
  const tokens = place
    .split(/[\s,.-]+/)
    .filter((t) => t.length > 2 || /^\d/.test(t))
    .filter((t) => !["ул", "улица", "объекте", "объект"].includes(t));
  // Номер объекта «ОБ-102» — точное совпадение, адрес — по словам
  const byCode = data.objects.filter((o) => norm(o.code) === place.trim());
  const objects = byCode.length
    ? byCode
    : tokens.length
      ? data.objects.filter((o) => {
          const words = norm(`${o.label} ${o.code}`).split(/[\s,.-]+/);
          return tokens.every((t) => tokenMatches(t, words));
        })
      : [];
  const mine = objects.filter((o) =>
    own.some((e) => e.objectId === o.id && e.brigadeId === brigade.id),
  );
  const object = (mine.length ? mine : objects).length === 1 ? (mine[0] ?? objects[0]) : undefined;
  if (!object)
    return {
      ...base,
      text: [
        objects.length > 1
          ? "Под адрес подходит несколько объектов. Уточните адрес или номер объекта."
          : "Не нашёл объект в вопросе. Напишите адрес или номер объекта.",
      ],
      items: objects.slice(0, 3).map((o) => ({ text: `${o.code} · ${o.label}`, to: null })),
    };
  const list = own.filter((e) => e.brigadeId === brigade.id && e.objectId === object.id);
  const sum = (items: TimeEntry[]) => items.reduce((a, e) => a + e.minutes, 0);
  const confirmed = list.filter((e) => e.status === "confirmed");
  const open = list.filter((e) => e.status !== "confirmed");
  const where = `${brigade.name} на ${object.label}`;
  if (!list.length) return { ...base, text: [`${where}: записей за неделю нет.`], items: [] };
  return {
    ...base,
    text: [
      `${where}: подтверждено ${fmtHours(hoursOfMinutes(sum(confirmed)))} (${sum(confirmed)} мин, записей ${confirmed.length}).`,
      open.length
        ? `Ещё не подтверждено ${fmtHours(hoursOfMinutes(sum(open)))} (записей ${open.length}): в итог недели они не входят.`
        : "Неподтверждённых записей нет.",
    ],
    items: list.map((e) => ({
      text: `${e.number}, ${shortDay(e.day)}, ${e.minutes} мин`,
      to: entryLink(e),
    })),
  };
}

function noSum(question: string, ctx: AssistantContext, base: Base): AssistantAnswer {
  const { data } = ctx;
  const digits = /(?:гз-?\s*)?(\d{1,5})/.exec(norm(question))?.[1];
  const number = digits ? `ГЗ-${digits.padStart(5, "0")}` : null;
  const entry = number ? data.entries.find((e) => e.number === number) : undefined;
  if (!entry)
    return {
      ...base,
      text: [
        number
          ? `Записи ${number} нет.`
          : "Напишите номер записи: «Почему у записи ГЗ-00011 нет суммы?»",
      ],
      items: [],
    };
  if (!MONEY_ROLES.includes(ctx.role))
    return {
      ...base,
      text: ["Суммы вашей роли не показываются."],
      items: [{ text: entry.number, to: entryLink(entry) }],
    };
  const view = entryView(data, entry);
  const cost = costBreakdown(view);
  const finance = entryInfo(view).finance;
  if (entry.amountRub !== null)
    return {
      ...base,
      text: [`У записи ${entry.number} сумма есть: ${costLine(cost)}.`],
      items: [{ text: `Открыть ${entry.number}`, to: entryLink(entry) }],
    };
  return {
    ...base,
    text: [
      cost.amountRub !== null
        ? `${entry.number} ещё не принята: сумма начислится при принятии, ${costLine(cost)}.`
        : `У записи ${entry.number} нет суммы: ${cost.source}.`,
      cost.formula,
    ],
    items: [
      ...finance.map((r) => ({ text: `${r.label}: ${r.found} ${r.todo}`, to: null })),
      { text: `Открыть ${entry.number}`, to: entryLink(entry) },
    ],
  };
}
