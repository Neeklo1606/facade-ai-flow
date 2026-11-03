/**
 * Бот бригадира в MAX: правила без сети (ADR-061, 14; раздел 6 документа табеля).
 *
 * - Привязка: менеджер создаёт одноразовый код, бригадир открывает ссылку на бота с кодом,
 *   бот связывает аккаунт MAX с пользователем. Без привязки бот отвечает «Обратитесь
 *   к менеджеру» и ничего не записывает.
 * - Идемпотентность: событие с уже принятым внешним id не обрабатывается второй раз.
 * - Контекст диалога собирается из снимка так же, как веб-симулятор: та же машина T2.
 */
import type { BotContext, BotKey, BotReply, BotState } from "./bot-dialog";
import { summaryOf } from "./bot-dialog";
import { crewOn, type CrewMember } from "./crew";
import type { User } from "./model";
import { allowedObjectIdsFor, dayObjects, type GasData } from "./view";

/** Срок жизни приглашения: трое суток, дальше менеджер отправляет новое */
export const INVITE_TTL_HOURS = 72;

/** Код из ссылки: без похожих символов, чтобы его можно было продиктовать */
export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 8;

export interface MaxLink {
  id: string;
  userId: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  maxUserId: string | null;
  linkedAt: string | null;
}

/** Код приглашения из случайных байтов: генератор передаёт тот, кто создаёт */
export function inviteCode(random: (n: number) => Uint8Array): string {
  return [...random(INVITE_LENGTH)]
    .map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length])
    .join("");
}

/** Местное время плюс часы, без пояса: как остальные метки учёта времени */
export function addHours(at: string, hours: number): string {
  const date = new Date(`${at.slice(0, 19)}Z`);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString().slice(0, 19);
}

export function createInvite(input: {
  id: string;
  userId: string;
  createdBy: string;
  now: string;
  code: string;
}): MaxLink {
  return {
    id: input.id,
    userId: input.userId,
    inviteCode: input.code,
    createdBy: input.createdBy,
    createdAt: input.now,
    expiresAt: addHours(input.now, INVITE_TTL_HOURS),
    maxUserId: null,
    linkedAt: null,
  };
}

/**
 * Ссылка на бота с кодом в параметре start. Формат ссылки MAX по открытым описаниям:
 * сверить с dev.max.ru до первой рассылки (B6)
 */
export function inviteUrl(botName: string, code: string): string {
  return `https://max.ru/${encodeURIComponent(botName)}?start=${encodeURIComponent(code)}`;
}

export type RedeemResult =
  | { ok: true; link: MaxLink; links: MaxLink[] }
  | { ok: false; reason: "unknown" | "used" | "expired" | "taken" };

export const REDEEM_TEXT: Record<Exclude<RedeemResult, { ok: true }>["reason"], string> = {
  unknown: "Код не найден. Обратитесь к менеджеру за новым приглашением.",
  used: "Этот код уже использован. Обратитесь к менеджеру за новым приглашением.",
  expired: "Срок приглашения истёк. Обратитесь к менеджеру за новым.",
  taken: "Этот аккаунт MAX уже привязан к другому сотруднику. Обратитесь к менеджеру.",
};

/** Привязать аккаунт MAX по коду: код одноразовый, аккаунт — у одного пользователя */
export function redeemInvite(
  links: readonly MaxLink[],
  input: { code: string; maxUserId: string; now: string },
): RedeemResult {
  const code = input.code.trim().toUpperCase();
  const link = links.find((l) => l.inviteCode === code);
  if (!link) return { ok: false, reason: "unknown" };
  if (link.maxUserId !== null) {
    // Повтор той же ссылки тем же человеком: уже привязан, это не ошибка
    if (link.maxUserId === input.maxUserId) return { ok: true, link, links: [...links] };
    return { ok: false, reason: "used" };
  }
  if (link.expiresAt < input.now) return { ok: false, reason: "expired" };
  const other = links.find((l) => l.maxUserId === input.maxUserId && l.userId !== link.userId);
  if (other) return { ok: false, reason: "taken" };
  const linked = { ...link, maxUserId: input.maxUserId, linkedAt: input.now };
  return {
    ok: true,
    link: linked,
    // Прежняя привязка того же пользователя снимается: действует последняя
    links: links.map((l) =>
      l.id === link.id
        ? linked
        : l.userId === link.userId && l.maxUserId !== null
          ? { ...l, maxUserId: null }
          : l,
    ),
  };
}

/** Пользователь системы по аккаунту MAX; null — не привязан */
export function linkedUserId(links: readonly MaxLink[], maxUserId: string): string | null {
  return links.find((l) => l.maxUserId === maxUserId)?.userId ?? null;
}

/** Событие новое: его внешний id ещё не принимали. Повтор доставки обрабатывать нельзя */
export function isNewEvent(seen: ReadonlySet<string>, externalId: string): boolean {
  return externalId.trim() !== "" && !seen.has(externalId);
}

/* ---------------------------------------------------------------- Диалог */

/**
 * Контекст машины диалога для бригадира из снимка: те же объекты дня, разрешённые объекты,
 * записи бригады и состав, что видит веб-симулятор (`BotChat`)
 */
export function botContextFor(
  data: GasData & { crew: readonly CrewMember[] },
  user: User,
  newKey: () => string,
): BotContext | null {
  const brigadeId = user.brigadeId;
  if (user.role !== "foreman" || !brigadeId) return null;
  const allowed = allowedObjectIdsFor(data, user);
  const plain = (o: { id: string; label: string; code: string; settlement: string | null }) => ({
    id: o.id,
    label: o.label,
    code: o.code,
    settlement: o.settlement,
  });
  const index = data.week.days.indexOf(data.today);
  return {
    speakerName: user.name,
    brigadeId,
    today: data.today,
    yesterday: index > 0 ? data.week.days[index - 1]! : data.today,
    dayObjects: dayObjects(data, brigadeId, data.today).map(plain),
    allowed: data.objects.filter((o) => allowed === "all" || allowed.has(o.id)).map(plain),
    entries: data.entries.filter((e) => e.brigadeId === brigadeId),
    crewSize: crewOn(data.crew as CrewMember[], brigadeId, data.today).length || null,
    newKey,
  };
}

export interface ChannelReply {
  text: string;
  /** Кнопки ответа: значение — id кнопки машины диалога */
  buttons: { label: string; callback: string }[];
}

const keyLabel = (key: BotKey) => (key.sub ? `${key.label} ${key.sub}` : key.label);

/** Ответ машины диалога сообщением канала: текст, пояснение, сводка и кнопки */
export function channelReply(reply: BotReply, state: BotState, ctx: BotContext): ChannelReply {
  const lines = [reply.text];
  if (reply.card === "summary") {
    const summary = summaryOf(state, ctx);
    lines.push(...summary.rows.map(([name, value]) => `${name}: ${value}`));
    lines.push(...summary.flags.map((f) => f.text));
  }
  if (reply.card === "mine") {
    lines.push(
      ...ctx.entries
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
        .map((e) => `${e.number}: ${e.day.slice(8, 10)}.${e.day.slice(5, 7)}, ${e.minutes} мин`),
    );
  }
  if (reply.hint) lines.push(reply.hint);
  return {
    text: lines.join("\n"),
    buttons: reply.groups
      .flatMap((g) => g.keys)
      .filter((k) => !k.disabled)
      .map((k) => ({ label: keyLabel(k), callback: k.id })),
  };
}
