/**
 * «Спросить ГАЙКУ» (ADR-052): вопрос обычными словами → ответ с числами и источниками.
 *
 * Модели нет: намерение находит правило по словам вопроса, числа считает тот же domain, что
 * отчёт и проверка. У каждой строки ответа есть источник (запись, бригада, объект, отчёт),
 * как сноска у Perplexity. Чего правило не поняло, то оно честно говорит и предлагает вопросы.
 * Модель позже войдёт через порт ModelGateway, а правило останется проверкой её чисел.
 */
import { totalsOf, type Totals } from "./calc";
import { MARK_LABEL, MARK_LEVEL, markKeysOf, requiresAttention } from "./marks";
import { FLAG_LABEL, type EntryFlag, type TimeEntry } from "./model";
import {
  brigadeCards,
  dashboardMetrics,
  entryView,
  objectCards,
  queue,
  type EntryView,
  type GasData,
} from "./view";

export type AskIntent =
  "week" | "brigade" | "object" | "review" | "issues" | "day" | "best" | "worst" | "unknown";

export type AskSourceKind = "report" | "brigade" | "object" | "entry" | "review";

export interface AskSource {
  kind: AskSourceKind;
  /** Для записи, бригады и объекта: id; для отчёта и проверки: день или null */
  id: string | null;
  label: string;
}

export interface AskMetric {
  label: string;
  kind: "rub" | "hours" | "rate" | "count";
  value: number | null;
}

export interface AskRow {
  label: string;
  sub: string | null;
  metric: AskMetric | null;
  /** Номер сноски в `sources`, с единицы */
  source: number | null;
}

export interface AskAnswer {
  intent: AskIntent;
  understood: boolean;
  title: string;
  /** Короткий вывод одной фразой: что важно в этих числах */
  lead: string;
  metrics: AskMetric[];
  rows: AskRow[];
  sources: AskSource[];
  followUps: string[];
}

const WEEKDAYS: Record<string, number> = {
  понедельник: 0,
  вторник: 1,
  сред: 2,
  четверг: 3,
  пятниц: 4,
  суббот: 5,
  воскресень: 6,
};

/** Подсказки на пустом экране: по одной на каждое намерение, которое правило понимает */
export const ASK_SUGGESTIONS = [
  "Сколько заработали за неделю?",
  "Что ждёт проверки?",
  "Какая бригада самая доходная?",
  "Где замечания: дубли и пересечения?",
  "Как прошла суббота?",
  "Покажи бригаду 1",
] as const;

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    // Точка внутри числа остаётся: «02.10» это дата, «3.10» это бригада
    .replace(/[«»"?!,;:]/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function weekdayOf(data: GasData, iso: string): string {
  const index = data.week.days.indexOf(iso);
  return index >= 0 ? (WEEKDAY_SHORT[index] ?? "") : "";
}

function dayLabel(data: GasData, iso: string): string {
  return `${weekdayOf(data, iso)} ${shortDay(iso)}`.trim();
}

function totalsMetrics(totals: Totals): AskMetric[] {
  return [
    // Подписи короткие: три числа в строку на телефоне 360
    { label: "Сумма", kind: "rub", value: totals.amountRub },
    { label: "Часы", kind: "hours", value: totals.hours },
    { label: "Доходность", kind: "rate", value: totals.revenuePerHour },
  ];
}

function sourceIndex(sources: AskSource[], source: AskSource): number {
  const found = sources.findIndex((s) => s.kind === source.kind && s.id === source.id);
  if (found >= 0) return found + 1;
  sources.push(source);
  return sources.length;
}

/** День из вопроса: «сегодня», «вчера», день недели или дата 02.10 */
function findDay(data: GasData, text: string): string | null {
  if (has(text, "сегодня")) return data.today;
  if (has(text, "вчера")) {
    const index = data.week.days.indexOf(data.today);
    return data.week.days[index - 1] ?? null;
  }
  for (const [stem, index] of Object.entries(WEEKDAYS)) {
    if (text.includes(stem)) return data.week.days[index] ?? null;
  }
  const date = text.match(/(\d{1,2})[./](\d{1,2})/);
  if (date) {
    const iso = data.week.days.find((d) => {
      const [, m, dd] = d.split("-");
      return Number(dd) === Number(date[1]) && Number(m) === Number(date[2]);
    });
    if (iso) return iso;
  }
  return null;
}

/** Бригада из вопроса: «бригада 3», «бригаду №3», «третья бригада» по коду или имени */
function findBrigade(data: GasData, text: string) {
  const number =
    text.match(/бригад\S*\s*№?\s*(\d+(?:\.\d+)?)/) ?? text.match(/(\d+(?:\.\d+)?)\s*бригад/);
  if (number) {
    const n = number[1]!;
    return (
      data.brigades.find((b) => norm(b.name) === `бригада ${n}`) ??
      data.brigades.find((b) => b.code === n) ??
      null
    );
  }
  return data.brigades.find((b) => text.includes(norm(b.name))) ?? null;
}

/** Объект: код ОБ-200, номер дома после улицы или название населённого пункта */
function findObject(data: GasData, text: string) {
  const code = text.match(/об\s*-?\s*(\d+)/);
  if (code) {
    const found = data.objects.find((o) => norm(o.code).replace(/\s/g, "") === `об-${code[1]}`);
    if (found) return found;
  }
  // Номер дома: после «дом», «демо» или любое отдельное число рядом с названием пункта
  const house =
    text.match(/(?:дом|д|демо)\s*(\d{1,4})\b/) ?? text.match(/(?:^|\s)(\d{1,4})(?:\s|$)/);
  const candidates = data.objects.filter((o) => {
    const settlement = o.settlement ? norm(o.settlement).replace(/^(ст|г|х|п|с)\s+/, "") : "";
    return (
      settlement.length > 3 &&
      text.includes(settlement.slice(0, Math.max(5, settlement.length - 2)))
    );
  });
  if (house) {
    const pool = candidates.length ? candidates : data.objects;
    const exact = pool.filter((o) => new RegExp(`демо,?\\s*${house[1]}\\b`).test(norm(o.label)));
    if (exact.length === 1) return exact[0]!;
  }
  return candidates.length === 1 ? candidates[0]! : null;
}

function detectIntent(text: string): AskIntent {
  if (has(text, "провер", "подтверд", "ждет", "ждут", "очеред")) return "review";
  if (has(text, "дубл", "пересеч", "замечан", "ошибк", "без суммы", "проблем", "аномал"))
    return "issues";
  if (has(text, "самая доход", "самый доход", "лучш", "выгодн", "больше всех", "самая прибыл"))
    return "best";
  if (has(text, "худш", "хуже", "меньше всех", "низк", "отста", "слаб")) return "worst";
  if (has(text, "бригад")) return "brigade";
  if (has(text, "объект", "об-", "об ", "адрес", "демо")) return "object";
  if (
    has(text, "сегодня", "вчера", "понедельник", "вторник", "сред", "четверг", "пятниц", "суббот")
  )
    return "day";
  if (/\d{1,2}[./]\d{1,2}/.test(text)) return "day";
  if (has(text, "недел", "итог", "заработ", "выработ", "сколько", "всего", "сумм", "выручк"))
    return "week";
  return "unknown";
}

function weekAnswer(data: GasData): AskAnswer {
  const metrics = dashboardMetrics(data);
  const sources: AskSource[] = [];
  sourceIndex(sources, {
    kind: "report",
    id: null,
    label: `Недельный отчёт ${shortDay(data.week.from)}–${shortDay(data.week.to)}`,
  });
  const best = [...metrics.byDay].sort((a, b) => b.amountRub - a.amountRub)[0];
  const rows: AskRow[] = metrics.byDay
    .filter((d) => d.minutes > 0)
    .map((d) => ({
      label: dayLabel(data, d.day),
      sub: null,
      metric: { label: "Сумма", kind: "rub", value: d.amountRub },
      source: sourceIndex(sources, {
        kind: "report",
        id: d.day,
        label: `Отчёт за ${dayLabel(data, d.day)}`,
      }),
    }));
  return {
    intent: "week",
    understood: true,
    title: `Итог недели ${shortDay(data.week.from)}–${shortDay(data.week.to)}`,
    lead:
      `Подтверждено ${metrics.totals.count} ${plural(metrics.totals.count, "запись", "записи", "записей")} от ${metrics.activeBrigades} ${plural(metrics.activeBrigades, "бригады", "бригад", "бригад")} на ${metrics.activeObjects} ${plural(metrics.activeObjects, "объекте", "объектах", "объектах")}.` +
      (best && best.amountRub > 0 ? ` Сильнее всего день ${dayLabel(data, best.day)}.` : "") +
      (metrics.pending
        ? ` Ещё ${waits(metrics.pending)} и в итог не ${metrics.pending === 1 ? "вошла" : "вошли"}.`
        : ""),
    metrics: totalsMetrics(metrics.totals),
    rows,
    sources,
    followUps: [
      "Какая бригада самая доходная?",
      "Что ждёт проверки?",
      "Где замечания: дубли и пересечения?",
    ],
  };
}

function brigadeAnswer(data: GasData, text: string): AskAnswer {
  const brigade = findBrigade(data, text);
  if (!brigade) return rankAnswer(data, "best");
  const card = brigadeCards(data, "confirmed").find((c) => c.brigade.id === brigade.id);
  const sources: AskSource[] = [];
  const own = sourceIndex(sources, { kind: "brigade", id: brigade.id, label: brigade.name });
  const confirmed = data.entries.filter(
    (e) => e.brigadeId === brigade.id && e.status === "confirmed",
  );
  const byObject = new Map<string, TimeEntry[]>();
  for (const entry of confirmed)
    byObject.set(entry.objectId, [...(byObject.get(entry.objectId) ?? []), entry]);
  const rows: AskRow[] = [...byObject.entries()]
    .map(([objectId, entries]) => ({ objectId, totals: totalsOf(entries) }))
    .sort((a, b) => b.totals.amountRub - a.totals.amountRub)
    .slice(0, 5)
    .map(({ objectId, totals }) => {
      const object = data.objects.find((o) => o.id === objectId);
      return {
        label: object?.label ?? "Объект",
        sub: `${totals.count} ${plural(totals.count, "запись", "записи", "записей")}`,
        metric: { label: "Сумма", kind: "rub", value: totals.amountRub },
        source: object
          ? sourceIndex(sources, { kind: "object", id: object.id, label: object.label })
          : own,
      };
    });
  const totals = card?.totals ?? totalsOf(confirmed);
  return {
    intent: "brigade",
    understood: true,
    title: brigade.name,
    lead:
      `${totals.count} подтверждённых ${plural(totals.count, "запись", "записи", "записей")} на ${byObject.size} ${plural(byObject.size, "объекте", "объектах", "объектах")}.` +
      (card?.pending ? ` Ещё ${waits(card.pending)}.` : "") +
      (card?.lead ? ` Бригадир: ${card.lead.name}.` : ""),
    metrics: totalsMetrics(totals),
    rows,
    sources,
    followUps: [
      "Какая бригада самая доходная?",
      "Сколько заработали за неделю?",
      "Что ждёт проверки?",
    ],
  };
}

function objectAnswer(data: GasData, text: string): AskAnswer {
  const object = findObject(data, text);
  if (!object)
    return unknownAnswer(
      data,
      "Не нашла объект в вопросе. Назовите номер, например «ОБ-200», или адрес.",
    );
  const card = objectCards(data).find((c) => c.object.id === object.id)!;
  const sources: AskSource[] = [];
  sourceIndex(sources, { kind: "object", id: object.id, label: object.label });
  const rows: AskRow[] = card.entries
    .map((entry) => entryView(data, entry))
    .sort((a, b) => a.entry.day.localeCompare(b.entry.day))
    .slice(0, 6)
    .map((view) => ({
      label: `${view.entry.number} · ${dayLabel(data, view.entry.day)}`,
      sub: `${view.brigade?.name ?? "Бригада"} · ${view.entry.status === "confirmed" ? "подтверждено" : "ждёт решения"}`,
      metric: { label: "Сумма", kind: "rub", value: view.entry.amountRub },
      source: sourceIndex(sources, { kind: "entry", id: view.entry.id, label: view.entry.number }),
    }));
  return {
    intent: "object",
    understood: true,
    title: object.label,
    lead:
      `${card.entries.length} ${plural(card.entries.length, "запись", "записи", "записей")}, ${card.brigades.length} ${plural(card.brigades.length, "бригада", "бригады", "бригад")}.` +
      (card.estimate ? "" : " Подтверждённой стоимости работ нет: сумма не считается.") +
      (card.flags.length
        ? ` Признаки: ${card.flags.map((f) => FLAG_LABEL[f].toLowerCase()).join(", ")}.`
        : ""),
    metrics: totalsMetrics(card.totals),
    rows,
    sources,
    followUps: ["Что ждёт проверки?", "Сколько заработали за неделю?"],
  };
}

function reviewAnswer(data: GasData): AskAnswer {
  const pending = queue(data, "pending");
  const sources: AskSource[] = [];
  sourceIndex(sources, { kind: "review", id: null, label: "Очередь проверки" });
  // Как в проверке: «Требуют внимания» только с признаком, который требует решения
  const flagged = pending.filter((v) => requiresAttention(v));
  const rows: AskRow[] = [...flagged, ...pending.filter((v) => !requiresAttention(v))]
    .slice(0, 6)
    .map((view) => ({
      label: view.object?.label ?? view.entry.number,
      sub: [
        view.entry.number,
        view.brigade?.name,
        view.flags.map((f) => FLAG_LABEL[f]).join(", ") || "без замечаний",
      ]
        .filter(Boolean)
        .join(" · "),
      metric: { label: "Сумма", kind: "rub", value: view.entry.amountRub },
      source: sourceIndex(sources, { kind: "entry", id: view.entry.id, label: view.entry.number }),
    }));
  const clean = pending.length - flagged.length;
  return {
    intent: "review",
    understood: true,
    title: pending.length ? `Ждут проверки: ${pending.length}` : "Очередь проверки пуста",
    lead: pending.length
      ? `С замечаниями ${flagged.length}, их стоит открыть первыми. Без замечаний ${clean}: их можно подтвердить пачкой.`
      : "Все записи недели решены.",
    metrics: [
      { label: "Ждут проверки", kind: "count", value: pending.length },
      { label: "С замечаниями", kind: "count", value: flagged.length },
      {
        label: "Сумма в очереди",
        kind: "rub",
        value: pending.reduce((s, v) => s + (v.entry.amountRub ?? 0), 0),
      },
    ],
    rows,
    sources,
    followUps: ["Где замечания: дубли и пересечения?", "Сколько заработали за неделю?"],
  };
}

function issuesAnswer(data: GasData): AskAnswer {
  const views = data.entries.filter((e) => e.status !== "rejected").map((e) => entryView(data, e));
  const serious: EntryFlag[] = ["duplicate", "overlap", "no-amount", "high-rate"];
  const counts = serious.map((flag) => ({
    flag,
    count: views.filter((v) => v.flags.includes(flag)).length,
  }));
  const sources: AskSource[] = [];
  const rows: AskRow[] = views
    .filter((v) => v.flags.some((f) => serious.includes(f)))
    .slice(0, 6)
    .map((view) => ({
      label: view.object?.label ?? view.entry.number,
      sub: `${view.entry.number} · ${view.flags
        .filter((f) => serious.includes(f))
        .map((f) => FLAG_LABEL[f])
        .join(", ")}`,
      metric: null,
      source: sourceIndex(sources, { kind: "entry", id: view.entry.id, label: view.entry.number }),
    }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  return {
    intent: "issues",
    understood: true,
    title: total ? "Замечания по записям недели" : "Замечаний нет",
    lead: total
      ? counts
          .filter((c) => c.count)
          .map((c) => `${FLAG_LABEL[c.flag]}: ${c.count}`)
          .join(". ") + ". Каждое видно в проверке до подтверждения."
      : "Дублей, пересечений и записей без суммы нет.",
    metrics: counts
      .filter((c) => c.count)
      .slice(0, 3)
      .map((c) => ({ label: FLAG_LABEL[c.flag], kind: "count", value: c.count })),
    rows,
    sources,
    followUps: ["Что ждёт проверки?", "Сколько заработали за неделю?"],
  };
}

function dayAnswer(data: GasData, text: string): AskAnswer {
  const day = findDay(data, text);
  if (!day) return weekAnswer(data);
  const entries = data.entries.filter((e) => e.day === day && e.status === "confirmed");
  const totals = totalsOf(entries);
  const sources: AskSource[] = [];
  sourceIndex(sources, { kind: "report", id: day, label: `Отчёт за ${dayLabel(data, day)}` });
  const byBrigade = new Map<string, TimeEntry[]>();
  for (const e of entries) byBrigade.set(e.brigadeId, [...(byBrigade.get(e.brigadeId) ?? []), e]);
  const rows: AskRow[] = [...byBrigade.entries()]
    .map(([id, list]) => ({
      brigade: data.brigades.find((b) => b.id === id),
      totals: totalsOf(list),
    }))
    .sort((a, b) => b.totals.amountRub - a.totals.amountRub)
    .map(({ brigade, totals: t }) => ({
      label: brigade?.name ?? "Бригада",
      sub: `${t.count} ${plural(t.count, "запись", "записи", "записей")}`,
      metric: { label: "Сумма", kind: "rub", value: t.amountRub },
      source: brigade
        ? sourceIndex(sources, { kind: "brigade", id: brigade.id, label: brigade.name })
        : 1,
    }));
  const pending = data.entries.filter((e) => e.day === day && e.status === "pending").length;
  return {
    intent: "day",
    understood: true,
    title: dayLabel(data, day),
    lead: entries.length
      ? `${byBrigade.size} ${plural(byBrigade.size, "бригада", "бригады", "бригад")} работали, ${entries.length} подтверждённых ${plural(entries.length, "запись", "записи", "записей")}.` +
        (pending ? ` Ещё ${waits(pending)}.` : "")
      : pending
        ? `Подтверждённых записей нет, ${waits(pending)}.`
        : "В этот день записей нет.",
    metrics: totalsMetrics(totals),
    rows,
    sources,
    followUps: ["Сколько заработали за неделю?", "Какая бригада самая доходная?"],
  };
}

function rankAnswer(data: GasData, direction: "best" | "worst"): AskAnswer {
  const cards = brigadeCards(data, "confirmed").filter(
    (c) => c.totals.revenuePerHour !== null && c.totals.count > 0,
  );
  const sorted = [...cards].sort((a, b) =>
    direction === "best"
      ? (b.totals.revenuePerHour ?? 0) - (a.totals.revenuePerHour ?? 0)
      : (a.totals.revenuePerHour ?? 0) - (b.totals.revenuePerHour ?? 0),
  );
  const sources: AskSource[] = [];
  const rows: AskRow[] = sorted.slice(0, 5).map((card) => ({
    label: card.brigade.name,
    sub: `${card.totals.count} ${plural(card.totals.count, "запись", "записи", "записей")} · ${card.objects.length} ${plural(card.objects.length, "объект", "объекта", "объектов")}`,
    metric: { label: "Доходность", kind: "rate", value: card.totals.revenuePerHour },
    source: sourceIndex(sources, {
      kind: "brigade",
      id: card.brigade.id,
      label: card.brigade.name,
    }),
  }));
  const top = sorted[0];
  return {
    intent: direction,
    understood: true,
    title:
      direction === "best" ? "Самая доходная бригада недели" : "Самая низкая доходность недели",
    lead: top
      ? `${top.brigade.name}: доходность часа считается от суммы по смете и минут, как в вашем файле.`
      : "Подтверждённых записей с суммой пока нет.",
    metrics: top ? totalsMetrics(top.totals) : [],
    rows,
    sources,
    followUps: top
      ? [`Покажи ${top.brigade.name.toLowerCase()}`, "Сколько заработали за неделю?"]
      : ["Что ждёт проверки?"],
  };
}

function unknownAnswer(_data: GasData, lead?: string): AskAnswer {
  return {
    intent: "unknown",
    understood: false,
    title: "Пока не понимаю такой вопрос",
    lead:
      lead ??
      "В демо я отвечаю про неделю, бригады, объекты, проверку, замечания и дни. Попробуйте один из вопросов ниже.",
    metrics: [],
    rows: [],
    sources: [],
    followUps: [...ASK_SUGGESTIONS.slice(0, 4)],
  };
}

/** «1 ждёт», «6 ждут» */
const waits = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "ждёт" : "ждут"} проверки`;

/** Подписи признаков, которые требуют решения: как в экране проверки */
const attentionLabels = (view: EntryView) =>
  markKeysOf(view)
    .filter((key) => MARK_LEVEL[key] !== "info")
    .map((key) => MARK_LABEL[key])
    .join(", ");

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function askGaika(question: string, data: GasData): AskAnswer {
  const text = norm(question);
  if (!text) return unknownAnswer(data);
  const intent = detectIntent(text);
  switch (intent) {
    case "week":
      return weekAnswer(data);
    case "brigade":
      return brigadeAnswer(data, text);
    case "object":
      return objectAnswer(data, text);
    case "review":
      return reviewAnswer(data);
    case "issues":
      return issuesAnswer(data);
    case "day":
      return dayAnswer(data, text);
    case "best":
    case "worst":
      return rankAnswer(data, intent);
    default:
      return unknownAnswer(data);
  }
}
