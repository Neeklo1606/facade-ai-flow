/**
 * Серверная сторона порта учёта времени (ADR-061, 14; BACKEND HANDOFF v1.1, раздел 3).
 *
 * Каждый метод порта вызывается только через `callGasMethod`: кто действует, берётся
 * из сессии, а не из снимка; роль сверяется с таблицей доступа до вызова; ответ проходит
 * выборку по роли. Скрытая кнопка не защита: бригадир, вызвавший проверку записи прямым
 * запросом, получает отказ здесь, а суммы не покидают сервер.
 *
 * Правила записи те же, что во вкладке: порт один (`createGasOpsDemo`), меняется только
 * хранилище. Без сброса: базу к исходному набору не возвращают.
 */
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { retrying, type GasStore } from "@/adapters/gas-ops/store";
import { gasMethodArgs } from "@/contracts/gas-api";
import type { Role, User } from "@/domain/gas-ops/model";
import type { FieldSnapshot } from "@/domain/gas-ops/field";
import {
  GAS_OPS_METHODS,
  GasOpsError,
  type GasOpsPort,
  type GasOpsSnapshot,
} from "@/ports/gas-ops";

export type GasMethod = keyof GasOpsPort;

const TIME: readonly Role[] = ["foreman", "manager", "admin"];
const OFFICE: readonly Role[] = ["manager", "admin"];
const WEEK: readonly Role[] = ["director", "admin"];
const ALL: readonly Role[] = ["admin", "manager", "foreman", "director", "prorab", "supply", "pto"];

/**
 * Кто может вызвать метод. Порт проверяет то же своими правилами (`mustManager` и другие):
 * таблица — первая линия, чтобы чужой метод не дошёл до хранилища вовсе.
 * Пустой список — метод недоступен на сервере: роль выбирает вход, а не снимок.
 */
export const GAS_METHOD_ROLES: Record<GasMethod, readonly Role[]> = {
  snapshot: ALL,
  signIn: [],
  createEntry: TIME,
  updateEntry: TIME,
  submitEntry: TIME,
  review: OFFICE,
  undoReview: OFFICE,
  setEstimate: OFFICE,
  addEstimateVersion: OFFICE,
  discardEstimateVersion: OFFICE,
  setUserRole: ["admin"],
  linkEstimateVersion: OFFICE,
  reviewEstimateIssues: OFFICE,
  confirmEstimateVersion: OFFICE,
  confirmCostRule: OFFICE,
  saveCostRule: OFFICE,
  undoCostRule: OFFICE,
  applySchedule: OFFICE,
  restoreSchedule: OFFICE,
  setBrigadeWeek: OFFICE,
  setReviewSettings: OFFICE,
  finalCheck: OFFICE,
  issueReport: OFFICE,
  fieldSnapshot: TIME,
  answerClarify: TIME,
  closeWeek: WEEK,
  reopenWeek: WEEK,
  setRate: WEEK,
  addCrewMember: OFFICE,
  endCrewMember: OFFICE,
  // Ставки импортирует руководитель, бригады и сотрудников — менеджер: тип проверяет порт
  importDirectory: ["manager", "admin", "director"],
  addObject: OFFICE,
  reset: [],
};

export const GAS_METHODS = GAS_OPS_METHODS;

/** Суммы, сметы и начисления видят только эти роли (ТЗ, п. 5.6; HANDOFF, раздел 3) */
export const GAS_MONEY_ROLES: readonly Role[] = ["admin", "manager", "director"];

/** Отказ сервера: статус ответа и текст для человека */
export class GasAccessError extends Error {
  constructor(
    readonly status: 401 | 403 | 501,
    message: string,
  ) {
    super(message);
    this.name = "GasAccessError";
  }
}

/**
 * Хранилище от имени пользователя сессии: порт видит его в `actorId`, а в базу `actorId`
 * не пишется. Снимок решения передаётся хранилищу исходным, чтобы проверка версии работала
 */
export function actingAs(store: GasStore, userId: string): GasStore {
  const origin = new WeakMap<GasOpsSnapshot, GasOpsSnapshot>();
  const as = (snapshot: GasOpsSnapshot) => {
    const view = { ...snapshot, actorId: userId };
    origin.set(view, snapshot);
    return view;
  };
  return {
    read: async () => as(await store.read()),
    update: async (change, base) =>
      as(
        await store.update(
          (s) => ({ ...change({ ...s, actorId: userId }), actorId: s.actorId }),
          base ? (origin.get(base) ?? base) : undefined,
        ),
      ),
  };
}

/* ---------------------------------------------------------------- Выборка по роли */

/** Поля денег в ответах учёта времени: у ролей без денег они пустые */
const MONEY_KEYS = new Set(["amountRub", "revenueInFile", "accruedRub", "totalRub"]);

function scrub<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = MONEY_KEYS.has(key) && item !== undefined ? null : scrub(item);
  }
  return out as T;
}

/**
 * Снимок для роли без денег. Бригадир видит только записи своей бригады; сметы, ставки,
 * правила стоимости, сданные отчёты и журнал действий не уходят вовсе. Закрытые версии
 * нужны экрану (закрытый день не правится), но без копий записей
 */
function snapshotFor(user: User, s: GasOpsSnapshot): GasOpsSnapshot {
  const foreman = user.role === "foreman";
  const own = (brigadeId: string) => !foreman || brigadeId === user.brigadeId;
  const entries = s.entries.filter((e) => own(e.brigadeId));
  const ids = new Set(entries.map((e) => e.id));
  return scrub({
    ...s,
    entries,
    reviews: s.reviews
      .filter((r) => ids.has(r.entryId))
      .map((r) => ({ ...r, changes: r.changes.filter((c) => c.field !== "Сумма начисления") })),
    estimates: [],
    estimateVersions: [],
    costRules: [],
    rates: [],
    reportIssues: [],
    finalChecks: [],
    audit: [],
    periods: s.periods.map((p) => ({ ...p, entries: [] })),
    supply: foreman
      ? { ...s.supply, requests: [], offers: [], receipts: [], limits: [] }
      : s.supply,
    docs: foreman
      ? { ...s.docs, works: [], docs: [], files: [], registries: [], journal: [] }
      : s.docs,
  });
}

/** Ответ метода для роли: у ролей с деньгами без изменений */
export function redactFor<T>(user: User, method: GasMethod, value: T): T {
  if (GAS_MONEY_ROLES.includes(user.role)) return value;
  if (method === "snapshot") return snapshotFor(user, value as GasOpsSnapshot) as T;
  if (method === "fieldSnapshot") return scrub(value as FieldSnapshot) as T;
  return scrub(value);
}

/* ---------------------------------------------------------------- Вызов */

export interface GasCall {
  store: GasStore;
  /** Пользователь `gas_users` из сессии; null — сессии нет */
  userId: string | null;
  method: string;
  args: unknown[];
}

const isMethod = (method: string): method is GasMethod => method in GAS_METHOD_ROLES;

/**
 * Записи чужой бригады бригадир не создаёт и не правит, даже если порт пропустил бы:
 * бригада записи берётся из хранилища, а не из запроса
 */
async function mustOwnBrigade(
  store: GasStore,
  user: User,
  method: GasMethod,
  args: unknown[],
): Promise<void> {
  if (user.role !== "foreman") return;
  const first = args[0] as Record<string, unknown> | string | undefined;
  let brigadeId: unknown = null;
  if (method === "createEntry") brigadeId = (first as Record<string, unknown>)?.["brigadeId"];
  else if (method === "updateEntry" || method === "submitEntry" || method === "answerClarify") {
    const id = typeof first === "string" ? first : first?.["id"];
    const entry = (await store.read()).entries.find((e) => e.id === id);
    if (!entry) throw new GasOpsError("not-found", "Запись не найдена.");
    brigadeId = entry.brigadeId;
  } else if (method === "fieldSnapshot") {
    brigadeId = first ?? user.brigadeId;
  } else return;
  if (brigadeId !== user.brigadeId) {
    throw new GasAccessError(403, "Записи другой бригады недоступны.");
  }
}

/** Вызов метода порта от имени пользователя сессии с проверкой роли и выборкой ответа */
export async function callGasMethod({ store, userId, method, args }: GasCall): Promise<unknown> {
  if (!isMethod(method)) throw new GasAccessError(403, "Неизвестное действие.");
  if (!userId) throw new GasAccessError(401, "Войдите, чтобы продолжить.");
  const user = (await store.read()).users.find((u) => u.id === userId);
  if (!user) throw new GasAccessError(403, "Вас нет среди пользователей учёта времени.");
  if (!GAS_METHOD_ROLES[method].includes(user.role)) {
    throw new GasAccessError(403, "Это действие недоступно вашей роли.");
  }
  await mustOwnBrigade(store, user, method, args);
  const port = retrying(createGasOpsDemo(actingAs(store, user.id), null));
  const run = port[method] as (...input: unknown[]) => Promise<unknown>;
  const value = await run.apply(port, args);
  return redactFor(user, method, value);
}

/* ---------------------------------------------------------------- Ответ по сети */

/** Ответ серверной функции: код ошибки правил доходит до экрана, как во вкладке */
export type GasCallResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 401 | 403 | 422 | 501; code: string; message: string };

/**
 * Вызов из серверной функции: проверка аргументов схемой контракта, затем `callGasMethod`.
 * `store` null — рабочая база не подключена (нет `DATABASE_URL`), отвечаем 501
 */
export async function answerGasCall(
  input: { method: string; args: unknown[] },
  userId: string | null,
  store: GasStore | null,
): Promise<GasCallResult> {
  if (!store) {
    return {
      ok: false,
      status: 501,
      code: "not-configured",
      message: "Рабочая база учёта времени не подключена.",
    };
  }
  const schema = gasMethodArgs[input.method];
  if (schema && !schema.safeParse(input.args).success) {
    return { ok: false, status: 400, code: "bad-request", message: "Неверные данные запроса." };
  }
  try {
    return { ok: true, value: await callGasMethod({ store, userId, ...input }) };
  } catch (error) {
    if (error instanceof GasAccessError) {
      return { ok: false, status: error.status, code: "forbidden", message: error.message };
    }
    if (error instanceof GasOpsError) {
      return { ok: false, status: 422, code: error.code, message: error.message };
    }
    throw error;
  }
}
