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
import { allowedObjectIdsFor } from "@/domain/gas-ops/view";
import {
  GAS_OPS_METHODS,
  GasOpsError,
  type GasOpsPort,
  type GasOpsSnapshot,
} from "@/ports/gas-ops";

export type GasMethod = keyof GasOpsPort;

const TIME: readonly Role[] = ["foreman", "manager", "admin"];
const OFFICE: readonly Role[] = ["manager", "admin"];
const ESTIMATES: readonly Role[] = ["manager", "admin", "director"];
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
  undoAutoAccept: OFFICE,
  setEstimate: OFFICE,
  addEstimateVersion: ESTIMATES,
  discardEstimateVersion: ESTIMATES,
  setUserRole: ["admin"],
  linkEstimateVersion: ESTIMATES,
  reviewEstimateIssues: ESTIMATES,
  correctEstimateValue: ESTIMATES,
  confirmEstimateVersion: ESTIMATES,
  confirmCostRule: OFFICE,
  saveCostRule: OFFICE,
  undoCostRule: OFFICE,
  resetObjectRule: OFFICE,
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
  undoDirectoryImport: ["manager", "admin", "director"],
  addObject: OFFICE,
  addBrigade: OFFICE,
  // Папка смет (ADR-077): файлы загружает сервер маршрутом /api/gas/estimate-files, не клиент
  intakeEstimateFile: [],
  reparseEstimateFile: [],
  createObjectFromEstimate: ESTIMATES,
  // Назначения и режим начисления (ADR-078): менеджер и администратор; ответ «закончены» — бригадир
  assignSection: OFFICE,
  unassignSection: OFFICE,
  setSectionDone: TIME,
  setAccrualMode: OFFICE,
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
/** accrual — начисление по доле раздела (ADR-078): доля и суммы роли без денег не нужны */
/** rubPerHour — ставка: лежит и в копии справочников до импорта (`directoryUndo`) */
const MONEY_KEYS = new Set([
  "amountRub",
  "revenueInFile",
  "accruedRub",
  "totalRub",
  "accrual",
  "rubPerHour",
]);

/**
 * Причины автопилота о деньгах (ADR-070): доходность, сумма, смета. Роль без денег видит,
 * что запись ждёт менеджера, но не видит, что дело в сумме
 */
const MONEY_REASONS = new Set([
  "high-rate",
  "no-cost",
  "no-amount",
  "manual-amount",
  "needs-agreement",
  "no-confirmed-cost",
]);

function scrub<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "autoDecision" && item && typeof item === "object") {
      const decision = item as { reasons?: { key: string }[] };
      out[key] = {
        ...decision,
        reasons: (decision.reasons ?? []).filter((r) => !MONEY_REASONS.has(r.key)),
      };
      continue;
    }
    out[key] = MONEY_KEYS.has(key) && item !== undefined ? null : scrub(item);
  }
  return out as T;
}

/**
 * Объекты, которые роль видит (ADR-012, «свои объекты»): бригадиру — объекты его бригады
 * (записи, назначения, график, разделы), прорабу — его список. null — все объекты
 */
function objectScope(user: User, s: GasOpsSnapshot): Set<string> | null {
  if (user.role === "foreman") {
    if (!user.brigadeId) return new Set();
    const allowed = allowedObjectIdsFor(s, user);
    return allowed === "all" ? null : allowed;
  }
  return user.allowedObjectIds === "all" ? null : new Set(user.allowedObjectIds);
}

/** Строки со ссылкой на объект — только своих объектов; строки без объекта остаются */
function inScope<T>(list: readonly T[], scope: Set<string> | null): T[] {
  if (!scope) return [...list];
  return list.filter((item) => {
    const id = (item as { objectId?: unknown }).objectId;
    return typeof id !== "string" || scope.has(id);
  });
}

const norm = (v: string) => v.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/**
 * Снимок для роли без денег. Бригадир видит только записи своей бригады; сметы, ставки,
 * правила стоимости, сданные отчёты и журнал действий не уходят вовсе. Закрытые версии
 * нужны экрану (закрытый день не правится), но без копий записей. Объекты, записи,
 * назначения, график, заявки и документы — только своих объектов
 */
function snapshotFor(user: User, s: GasOpsSnapshot): GasOpsSnapshot {
  const foreman = user.role === "foreman";
  const own = (brigadeId: string) => !foreman || brigadeId === user.brigadeId;
  const scope = objectScope(user, s);
  const visible = (objectId: string) => !scope || scope.has(objectId);
  const entries = s.entries.filter((e) => own(e.brigadeId) && (foreman || visible(e.objectId)));
  const ids = new Set(entries.map((e) => e.id));
  const objects = s.objects.filter((o) => visible(o.id));
  const brigade = s.brigades.find((b) => b.id === user.brigadeId);
  const brigadeNames = new Set(brigade ? [norm(brigade.code), norm(brigade.name)] : []);
  const objectKeys = new Set(objects.flatMap((o) => [norm(o.code), norm(o.label)]));
  const schedule = s.schedule
    ? {
        ...s.schedule,
        rows: s.schedule.rows.filter((r) =>
          foreman
            ? brigadeNames.has(norm(r.brigade))
            : !scope ||
              objectKeys.has(norm(r.objectLabel)) ||
              (r.code !== null && objectKeys.has(norm(r.code))),
        ),
      }
    : s.schedule;
  const scopedLists = <T extends object>(part: T): T =>
    Object.fromEntries(
      Object.entries(part).map(([key, value]) => [
        key,
        Array.isArray(value) ? inScope(value, scope) : value,
      ]),
    ) as T;
  // Предложения и приёмки ссылаются на заявку, а не на объект: остаются только своих заявок
  const scopedSupply = (supply: GasOpsSnapshot["supply"]): GasOpsSnapshot["supply"] => {
    const requests = new Set(supply.requests.map((r) => r.id));
    return {
      ...supply,
      offers: supply.offers.filter((o) => requests.has(o.requestId)),
      receipts: supply.receipts.filter((r) => requests.has(r.requestId)),
    };
  };
  return scrub({
    ...s,
    objects,
    entries,
    reviews: s.reviews
      .filter((r) => ids.has(r.entryId))
      .map((r) => ({
        ...r,
        changes: r.changes.filter(
          (c) => c.field !== "Сумма начисления" && c.field !== "Доля раздела",
        ),
      })),
    frames: s.frames.filter((f) => own(f.brigadeId)),
    assignments: s.assignments
      .filter((a) => own(a.brigadeId))
      .map((a) => ({ ...a, objectIds: a.objectIds.filter(visible) }))
      .filter((a) => a.objectIds.length > 0),
    schedule,
    estimates: [],
    estimateVersions: [],
    // Папка смет и разделы с суммами (ADR-077): ролям без денег не отдаются
    estimateFiles: [],
    objectSections: [],
    sectionProgress: [],
    // Бригадир видит только разделы своей бригады: название без сумм лежит в назначении
    sectionAssignments: (s.sectionAssignments ?? []).filter(
      (a) => own(a.brigadeId) && visible(a.objectId),
    ),
    costRules: [],
    rates: [],
    // Отмена импорта хранит справочники до импорта, со ставками: роли без денег не нужна
    directoryUndo: null,
    reportIssues: [],
    finalChecks: [],
    audit: [],
    periods: s.periods.map((p) => ({ ...p, entries: [] })),
    supply: foreman
      ? { ...s.supply, requests: [], offers: [], receipts: [], limits: [] }
      : scopedSupply(scopedLists(s.supply)),
    docs: foreman
      ? { ...s.docs, works: [], docs: [], files: [], registries: [], journal: [] }
      : scopedLists(s.docs),
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
