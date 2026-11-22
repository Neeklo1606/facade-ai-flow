import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDriver, type Driver } from "@/adapters/db";
import { createGasDbStore } from "@/adapters/gas-ops/db-store";
import { weekReasons } from "@/adapters/gas-ops/demo";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import { GasStaleError, type GasStore } from "@/adapters/gas-ops/store";
import { exportPayloadOf, gasExportFromStore } from "@/api/gas-export";
import { parseEstimateBytes } from "@/api/gas-estimate-files";
import {
  GAS_METHOD_ROLES,
  GAS_METHODS,
  GAS_MONEY_ROLES,
  GasAccessError,
  callGasMethod,
  type GasMethod,
} from "@/api/gas-ops-server";
import { allowedObjectIdsFor } from "@/domain/gas-ops/view";
import { FULL_BP, accruedRub, sectionWorkRub } from "@/domain/gas-ops/section-accrual";
import type { Role, TimeEntry, User } from "@/domain/gas-ops/model";
import { isDayLocked } from "@/domain/gas-ops/week";
import { GasOpsError, type GasOpsSnapshot } from "@/ports/gas-ops";
import { assistantAccess } from "@/server/gas-assistant";

/**
 * Права, деньги бригадира и изоляция на сервере (план критического тестирования, раздел 2;
 * инвариант 3 ТЗ; ADR-012). Все вызовы идут через `callGasMethod` — тот же вход, что у
 * серверной функции и бота.
 *
 * Хранилище: PostgreSQL, если задана `GAS_SECURITY_DATABASE_URL` (база с применёнными
 * миграциями, её содержимое учёта времени перезаписывается); иначе хранилище в памяти с тем же
 * исходным набором. Запуск на базе: создать базу, `dbmate up`, затем
 * `GAS_SECURITY_DATABASE_URL=postgres://… bun test tests/negative/gas-server-security.test.ts`.
 */

// Мост снимка пишет таблицы целиком: на PostgreSQL сценарий идёт секунды, а не миллисекунды
setDefaultTimeout(120_000);

const DB_URL = process.env["GAS_SECURITY_DATABASE_URL"]?.trim() || null;
let driver: Driver | null = null;
let store: GasStore;
let memoryState: GasOpsSnapshot | null = null;

function fresh(): GasOpsSnapshot {
  const state = structuredClone(getServerSnapshot());
  state.users = [
    ...state.users,
    {
      id: "u-foreman-2",
      name: "Бригадир 2",
      role: "foreman",
      brigadeId: "brg-2",
      allowedObjectIds: [],
    },
  ];
  return state;
}

beforeEach(async () => {
  if (DB_URL) {
    driver ??= createDriver({ kind: "pg", url: DB_URL });
    const db = createGasDbStore(driver, { timeZone: "Europe/Moscow" });
    await db.seed(fresh());
    store = db;
  } else {
    memoryState = fresh();
    // Как вкладка и база: решение по устаревшему снимку отвергается и повторяется
    store = {
      read: async () => memoryState!,
      update: async (change, base) => {
        if (base && base !== memoryState) throw new GasStaleError();
        return (memoryState = change(memoryState!));
      },
    };
  }
});

afterAll(async () => {
  await driver?.close();
});

const as = <T = unknown>(userId: string | null, method: GasMethod | string, ...args: unknown[]) =>
  callGasMethod({ store, userId, method, args }) as Promise<T>;

async function refusal(run: () => Promise<unknown>): Promise<number | string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof GasAccessError) return error.status;
    if (error instanceof GasOpsError) return error.code;
    throw error;
  }
}

/**
 * Все следы денег в ответе: числовое поле с именем про рубли, ставку, начисление, сумму или
 * доходность, и любой текст со знаком рубля. У бригадира список должен быть пустым
 */
/** Знак рубля или слово «руб.»: «Труба» сюда не попадает */
const RUBLE = /₽|(?:^|[^а-яё])руб/i;
const MONEY_KEY = /rub|revenue|accru|amount|price|cost|profit|yield|rate/i;
function moneyTraces(value: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item, i) => moneyTraces(item, `${path}[${i}]`, found));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (MONEY_KEY.test(key) && typeof item === "number") found.push(`${path}.${key}=${item}`);
      else moneyTraces(item, `${path}.${key}`, found);
    }
  } else if (typeof value === "string" && RUBLE.test(value)) found.push(`${path}: «${value}»`);
  return found;
}

const FIXTURE = join(import.meta.dir, "..", "fixtures", "estimates", "resource-b.xls");

/** Смета → объект → разделы бригадам 1 и 2, ставки и импорт ставок руководителем */
async function richState() {
  const parsed = await parseEstimateBytes(new Uint8Array(readFileSync(FIXTURE)));
  if (!parsed.ok) throw new Error(parsed.message);
  const p = parsed.parsed;
  const file = await as<{ kind: string; versionId?: string }>("u-manager", "intakeEstimateFile", {
    sha256: "f".repeat(64),
    name: "смета.xls",
    size: 1,
    storagePath: null,
    parsed: p,
  }).catch(async (error) => {
    // Метод закрыт на сервере (файлы загружает маршрут): кладём тем же портом от имени менеджера
    if (!(error instanceof GasAccessError)) throw error;
    const { createGasOpsDemo } = await import("@/adapters/gas-ops/demo");
    const { actingAs } = await import("@/api/gas-ops-server");
    return createGasOpsDemo(actingAs(store, "u-manager"), null).intakeEstimateFile({
      sha256: "f".repeat(64),
      name: "смета.xls",
      size: 1,
      storagePath: null,
      parsed: p,
    });
  });
  if (file.kind !== "added" || !file.versionId) throw new Error("смета не добавлена");
  const object = await as<{ id: string }>("u-manager", "createObjectFromEstimate", {
    versionId: file.versionId,
    label: "ул. Проверочная, 1",
    code: p.header!.number.value!,
    workType: "Перемонтаж",
    address: p.header!.address.value,
    estimateNumber: p.header!.number.value,
  });
  const sections = ((await store.read()).objectSections ?? []).filter(
    (s) => s.objectId === object.id,
  );
  const s3 = sections.find((s) => s.number === "3")!;
  const s7 = sections.find((s) => s.number === "7")!;
  const week = (await store.read()).week;
  await as("u-manager", "assignSection", {
    objectId: object.id,
    sectionKey: s3.key,
    brigadeId: "brg-1",
    from: week.from,
    to: null,
  });
  await as("u-manager", "assignSection", {
    objectId: object.id,
    sectionKey: s7.key,
    brigadeId: "brg-2",
    from: week.from,
    to: null,
  });
  await as("u-director", "setRate", {
    employeeId: null,
    brigadeId: "brg-1",
    rubPerHour: 777,
    from: week.from,
  });
  await as("u-director", "importDirectory", {
    kind: "rates",
    rows: [
      {
        row: 2,
        brigade: "Бригада 1",
        lead: "",
        phone: "",
        name: "",
        from: week.days[1],
        rate: 812,
      },
    ],
  });
  return { object, s3, s7, week };
}

const shift = (day: string, objectId: string, brigadeId: string, clientKey: string) => ({
  day,
  brigadeId,
  employeeId: null,
  objectId,
  start: "8:00",
  end: "17:00",
  breakMinutes: 60,
  submit: true,
  headcount: 2,
  clientKey,
});

/* ---------------------------------------------------------------- Деньги бригадира */

describe("бригадир не получает денег ни в одном ответе сервера", () => {
  test("снимок, «Сегодня», запись, правка, отправка, ответ и «раздел закончен» без сумм и ставок", async () => {
    const { object, week } = await richState();
    const responses: Record<string, unknown> = {};
    const errors: string[] = [];
    const call = async (name: string, method: GasMethod, ...args: unknown[]) => {
      try {
        responses[name] = await as("u-foreman-1", method, ...args);
      } catch (error) {
        if (error instanceof GasOpsError || error instanceof GasAccessError)
          errors.push(`${name}: ${error.message}`);
        else throw error;
      }
      return responses[name] as TimeEntry;
    };
    const day = week.days[2]!;
    const created = await call("createEntry", "createEntry", shift(day, object.id, "brg-1", "s1"));
    await call("createEntry-повтор", "createEntry", shift(day, object.id, "brg-1", "s1"));
    await call("updateEntry", "updateEntry", { id: created.id, breakMinutes: 30 });
    await call("setSectionDone", "setSectionDone", { entryId: created.id, done: true });
    // Менеджер просит уточнить: бригадир отвечает
    await as("u-manager", "review", {
      id: created.id,
      action: "clarify",
      comment: "Сколько людей?",
    });
    await call("answerClarify", "answerClarify", { id: created.id, text: "Двое" });
    // Менеджер подтверждает с долей: начисление посчитано, бригадир видит запись без суммы
    await as("u-manager", "review", {
      id: created.id,
      action: "confirm",
      accrual: { kind: "share", percent: 40 },
    });
    const confirmed = (await store.read()).entries.find((e) => e.id === created.id)!;
    expect(confirmed.amountRub ?? 0).toBeGreaterThan(0);
    await call("snapshot", "snapshot");
    await call("fieldSnapshot", "fieldSnapshot", "brg-1");
    // Отказы правил тоже не называют сумм: правка принятой записи, чужой раздел
    await call("updateEntry-принятой", "updateEntry", { id: created.id, breakMinutes: 0 });
    await call("submitEntry", "submitEntry", created.id);

    expect(moneyTraces(responses)).toEqual([]);
    expect(errors.filter((e) => RUBLE.test(e))).toEqual([]);
    const snap = responses["snapshot"] as GasOpsSnapshot;
    expect(snap.rates).toEqual([]);
    expect(snap.directoryUndo ?? null).toBeNull();
    expect(snap.estimates).toEqual([]);
    expect(snap.costRules).toEqual([]);
  });

  test("роли без денег (прораб, снабжение, ПТО): ни смет, ни ставок, ни начислений", async () => {
    await richState();
    const users = (await store.read()).users.filter((u) => !GAS_MONEY_ROLES.includes(u.role));
    expect(users.map((u) => u.role).sort()).toEqual([
      "foreman",
      "foreman",
      "prorab",
      "pto",
      "supply",
    ]);
    for (const user of users) {
      const snap = await as<GasOpsSnapshot>(user.id, "snapshot");
      // Снабжение видит цены поставщиков своего раздела: проверяем учёт времени и ставки
      const timeAndRates = {
        entries: snap.entries,
        periods: snap.periods,
        rates: snap.rates,
        directoryUndo: snap.directoryUndo,
        estimates: snap.estimates,
        estimateVersions: snap.estimateVersions,
        objectSections: snap.objectSections,
        sectionProgress: snap.sectionProgress,
        costRules: snap.costRules,
        reviews: snap.reviews,
        audit: snap.audit,
      };
      expect({ role: user.role, traces: moneyTraces(timeAndRates) }).toEqual({
        role: user.role,
        traces: [],
      });
    }
  });

  test("выгрузка с суммами: бригадир, прораб, снабжение и ПТО получают 403, без сессии 401", async () => {
    const week = (await store.read()).week;
    const request = { kind: "approved" as const, weekFrom: week.from, version: null };
    for (const userId of ["u-foreman-1", "u-foreman-2", "u-prorab", "u-supply", "u-pto"]) {
      const status = await refusal(() => gasExportFromStore({ store, userId, request }));
      expect({ userId, status }).toEqual({ userId, status: 403 });
    }
    expect(await refusal(() => gasExportFromStore({ store, userId: null, request }))).toBe(401);
    const ok = await gasExportFromStore({ store, userId: "u-manager", request });
    expect(ok.file.byteLength).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------- Права по ролям */

describe("права проверяет сервер для каждой роли и каждого метода (ADR-012)", () => {
  test("метод вне строки роли — 403 до хранилища, без сессии 401, чужой id 403", async () => {
    const roles: Role[] = ["admin", "manager", "director", "foreman", "prorab", "supply", "pto"];
    const users = (await store.read()).users;
    const before = JSON.stringify((await store.read()).entries);
    for (const method of GAS_METHODS) {
      for (const role of roles) {
        if (GAS_METHOD_ROLES[method].includes(role)) continue;
        const user = users.find((u) => u.role === role)!;
        const status = await refusal(() => as(user.id, method, {}));
        expect({ method, role, status }).toEqual({ method, role, status: 403 });
      }
      expect(await refusal(() => as(null, method))).toBe(401);
      expect(await refusal(() => as("u-nobody", method))).toBe(403);
    }
    // Ни один отказ ничего не записал
    expect(JSON.stringify((await store.read()).entries)).toBe(before);
  });

  test("вход и сброс закрыты на сервере для всех ролей", async () => {
    for (const user of (await store.read()).users) {
      expect(await refusal(() => as(user.id, "signIn", "u-admin"))).toBe(403);
      expect(await refusal(() => as(user.id, "reset"))).toBe(403);
    }
  });

  test("бригадир не трогает записи и разделы чужой бригады", async () => {
    const { object, week } = await richState();
    const day = week.days[1]!;
    const other = await as<TimeEntry>(
      "u-foreman-2",
      "createEntry",
      shift(day, object.id, "brg-2", "b2"),
    );
    expect(
      await refusal(() => as("u-foreman-1", "createEntry", shift(day, object.id, "brg-2", "x"))),
    ).toBe(403);
    expect(
      await refusal(() => as("u-foreman-1", "updateEntry", { id: other.id, breakMinutes: 0 })),
    ).toBe(403);
    expect(await refusal(() => as("u-foreman-1", "submitEntry", other.id))).toBe(403);
    expect(
      await refusal(() => as("u-foreman-1", "setSectionDone", { entryId: other.id, done: true })),
    ).not.toBeNull();
    await as("u-manager", "review", { id: other.id, action: "clarify", comment: "Уточните" });
    expect(
      await refusal(() => as("u-foreman-1", "answerClarify", { id: other.id, text: "x" })),
    ).toBe(403);
    // «Сегодня» чужой бригады по параметру не отдаётся
    expect(await refusal(() => as("u-foreman-1", "fieldSnapshot", "brg-2"))).toBe(403);
    const stored = (await store.read()).entries.find((e) => e.id === other.id)!;
    expect(stored.sectionDone ?? null).toBeNull();
    expect(stored.breakMinutes).toBe(60);
  });
});

/* ---------------------------------------------------------------- Изоляция объектов */

describe("роль видит только свои объекты", () => {
  test("бригадир: объекты, записи, назначения и график только своей бригады", async () => {
    await richState();
    const full = await store.read();
    const foreman = full.users.find((u) => u.id === "u-foreman-1") as User;
    const allowed = allowedObjectIdsFor(full, foreman) as Set<string>;
    expect(allowed).toBeInstanceOf(Set);
    expect(allowed.size).toBeLessThan(full.objects.length);
    const snap = await as<GasOpsSnapshot>("u-foreman-1", "snapshot");
    expect(snap.objects.length).toBeGreaterThan(0);
    expect(snap.objects.filter((o) => !allowed.has(o.id)).map((o) => o.id)).toEqual([]);
    expect(snap.entries.filter((e) => e.brigadeId !== "brg-1")).toEqual([]);
    expect(snap.assignments.filter((a) => a.brigadeId !== "brg-1")).toEqual([]);
    expect((snap.sectionAssignments ?? []).filter((a) => a.brigadeId !== "brg-1")).toEqual([]);
    expect(snap.supply.requests).toEqual([]);
    // Своё на месте: экран бригадира работает на урезанном снимке
    for (const id of allowed) expect(snap.objects.some((o) => o.id === id)).toBe(true);
  });

  test("прораб: записи, объекты, заявки и документы только своих объектов", async () => {
    const full = await store.read();
    const prorab = full.users.find((u) => u.role === "prorab")!;
    const own = new Set(prorab.allowedObjectIds as string[]);
    const snap = await as<GasOpsSnapshot>(prorab.id, "snapshot");
    expect(snap.objects.map((o) => o.id).filter((id) => !own.has(id))).toEqual([]);
    expect(snap.entries.filter((e) => !own.has(e.objectId)).map((e) => e.id)).toEqual([]);
    expect(snap.supply.requests.filter((r) => !own.has(r.objectId)).map((r) => r.id)).toEqual([]);
    expect(snap.docs.works.filter((w) => !own.has(w.objectId)).map((w) => w.id)).toEqual([]);
    expect(snap.objects.length).toBeGreaterThan(0);
  });

  test("запись на чужой объект не создаётся: ни бригадиром, ни прорабом", async () => {
    const full = await store.read();
    const day = full.week.days[1]!;
    const foreman = full.users.find((u) => u.id === "u-foreman-1") as User;
    const foremanAllowed = allowedObjectIdsFor(full, foreman) as Set<string>;
    const foreign = full.objects.find((o) => !foremanAllowed.has(o.id))!;
    expect(foreign).toBeDefined();
    expect(
      await refusal(() =>
        as("u-foreman-1", "createEntry", shift(day, foreign.id, "brg-1", "foreign-1")),
      ),
    ).toBe("not-allowed");
    const prorab = full.users.find((u) => u.role === "prorab")!;
    const own = new Set(prorab.allowedObjectIds as string[]);
    const outside = full.objects.find((o) => !own.has(o.id));
    if (outside) {
      const result = await refusal(() =>
        as(prorab.id, "createEntry", shift(day, outside.id, "brg-1", "foreign-2")),
      );
      expect(result).not.toBeNull();
    }
    const after = await store.read();
    expect(after.entries.filter((e) => e.clientKey?.startsWith("foreign-"))).toEqual([]);
  });
});

/* ---------------------------------------------------------------- Закрытая неделя */

/** Строки отчёта заказчика по версии v1 недели: то, что попадает в утверждённый Excel */
function versionRows(s: GasOpsSnapshot): string {
  const payload = exportPayloadOf({
    kind: "approved",
    version: 1,
    week: s.week,
    data: {
      entries: s.entries,
      groups: s.groups,
      brigades: s.brigades,
      employees: s.employees,
      objects: s.objects,
      frames: s.frames,
      periods: s.periods,
    },
  });
  return JSON.stringify([payload.rows, payload.analytic]);
}

async function closeCurrentWeek(): Promise<void> {
  // Менеджер решил всё, что ждало: подготовка состояния, не предмет проверки
  await store.update((s) => ({
    ...s,
    entries: s.entries.map((e) =>
      e.status === "pending" || e.status === "clarify" || e.status === "draft"
        ? { ...e, status: "rejected" as const, comment: "Отклонено при подготовке" }
        : e,
    ),
  }));
  await as("u-manager", "finalCheck");
  const accepted = weekReasons(await store.read()).map((r) => ({
    key: r.key,
    reason: "Принято как есть",
  }));
  await as("u-director", "closeWeek", { accepted });
}

describe("закрытая неделя не меняется ни через какой метод", () => {
  test("правка, решение, отмена, новая запись, смета и правило не трогают закрытые дни", async () => {
    const { object, week } = await richState();
    const day = week.days[0]!;
    const entry = await as<TimeEntry>(
      "u-foreman-1",
      "createEntry",
      shift(day, object.id, "brg-1", "c1"),
    );
    await as("u-manager", "review", { id: entry.id, action: "confirm" });
    await closeCurrentWeek();
    const locked = (s: GasOpsSnapshot) =>
      JSON.stringify(
        s.entries
          .filter((e) => isDayLocked(s.periods, e.day))
          .map((e) => [e.id, e.status, e.minutes, e.amountRub ?? null, e.accrual ?? null]),
      );
    const before = await store.read();
    expect(isDayLocked(before.periods, day)).toBe(true);
    const frozen = locked(before);
    const rowsBefore = versionRows(before);

    const confirmed = before.entries.find(
      (e) => e.status === "confirmed" && week.days.includes(e.day),
    )!;
    const attempts: [string, string, unknown[]][] = [
      ["u-foreman-1", "createEntry", [shift(week.days[3]!, object.id, "brg-1", "c2")]],
      ["u-manager", "createEntry", [shift(week.days[3]!, object.id, "brg-1", "c3")]],
      ["u-manager", "updateEntry", [{ id: confirmed.id, breakMinutes: 0, comment: "поздно" }]],
      ["u-manager", "submitEntry", [confirmed.id]],
      ["u-manager", "review", [{ id: confirmed.id, action: "reject", comment: "поздно" }]],
      ["u-manager", "undoReview", [confirmed.id]],
      ["u-manager", "undoAutoAccept", [confirmed.id]],
      ["u-foreman-1", "setSectionDone", [{ entryId: entry.id, done: false }]],
      ["u-foreman-1", "answerClarify", [{ id: entry.id, text: "поздно" }]],
      ["u-manager", "setEstimate", [{ objectId: confirmed.objectId, amountRub: 999_999 }]],
      ["u-admin", "setEstimate", [{ objectId: object.id, amountRub: 1 }]],
    ];
    const outcomes: string[] = [];
    for (const [userId, method, args] of attempts) {
      const result = await refusal(() => as(userId, method, ...args));
      outcomes.push(`${method}: ${result ?? "ok"}`);
    }
    // Записи в закрытые дни не создаются и не меняются; суммы закрытых записей прежние
    expect(locked(await store.read())).toBe(frozen);
    // Строки файла закрытой версии v1 те же: файл строится из её копии записей
    expect(versionRows(await store.read())).toBe(rowsBefore);
    // Каждое изменение записей закрытой недели отвергнуто правилом закрытого периода
    expect(outcomes.slice(0, 9)).toEqual(
      attempts.slice(0, 9).map(([, method]) => `${method}: period-closed`),
    );
  });
});

/* ---------------------------------------------------------------- Начисления */

describe("начисления раздела на сервере не больше стоимости работ раздела", () => {
  test("случайные доли за несколько дней: сумма не больше стоимости, «завершён» — ровно она", async () => {
    const { object, s3, week } = await richState();
    const workRub = sectionWorkRub(s3)!;
    expect(workRub).toBeGreaterThan(0);
    // Детерминированный «случайный» ряд: доли могут идти вниз, вверх и выше 100
    let seed = 20261123;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const days = week.days.slice(0, 5);
    const ids: string[] = [];
    for (const [i, day] of days.entries()) {
      const e = await as<TimeEntry>(
        "u-foreman-1",
        "createEntry",
        shift(day, object.id, "brg-1", `r${i}`),
      );
      ids.push(e.id);
    }
    for (const [i, id] of ids.entries()) {
      const last = i === ids.length - 1;
      const percent = Math.round(next() * 140) - 10;
      const accrual = last ? { kind: "share", done: true } : { kind: "share", percent };
      await refusal(() => as("u-manager", "review", { id, action: "confirm", accrual }));
      const sum = accruedRub((await store.read()).entries, object.id, s3.key);
      expect(sum).toBeLessThanOrEqual(workRub);
      expect(sum).toBeGreaterThanOrEqual(0);
    }
    const all = (await store.read()).entries.filter((e) => ids.includes(e.id));
    if (all.every((e) => e.status === "confirmed")) {
      expect(accruedRub(all, object.id, s3.key)).toBe(workRub);
    }
    // Повторное «завершён» по новой записи сверх 100 % ничего не добавляет
    const extra = await as<TimeEntry>(
      "u-foreman-1",
      "createEntry",
      shift(week.days[5]!, object.id, "brg-1", "r-extra"),
    );
    await refusal(() =>
      as("u-manager", "review", {
        id: extra.id,
        action: "confirm",
        accrual: { kind: "share", done: true },
      }),
    );
    expect(accruedRub((await store.read()).entries, object.id, s3.key)).toBeLessThanOrEqual(
      workRub,
    );
    expect(FULL_BP).toBe(10_000);
  });
});

/* ---------------------------------------------------------------- Повторная отправка */

describe("повторная отправка записи не создаёт дубль", () => {
  test("три одновременные отправки с одним ключом — одна запись", async () => {
    const { object, week } = await richState();
    const input = shift(week.days[4]!, object.id, "brg-1", "same-key");
    const results = await Promise.all([
      as<TimeEntry>("u-foreman-1", "createEntry", input),
      as<TimeEntry>("u-foreman-1", "createEntry", input),
      as<TimeEntry>("u-foreman-1", "createEntry", input),
    ]);
    expect(new Set(results.map((e) => e.id)).size).toBe(1);
    const stored = (await store.read()).entries.filter((e) => e.clientKey === "same-key");
    expect(stored).toHaveLength(1);
    // Повтор позже, уже после проверки, — та же запись, а не новая
    await as("u-manager", "review", { id: stored[0]!.id, action: "confirm" });
    const later = await as<TimeEntry>("u-foreman-1", "createEntry", input);
    expect(later.id).toBe(stored[0]!.id);
    expect((await store.read()).entries.filter((e) => e.clientKey === "same-key")).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------- Помощник */

describe("помощник с платным ключом модели не открыт посторонним", () => {
  test("рабочий контур: без сессии 401, сессия не из учёта времени 403, пользователь проходит", async () => {
    const session = (id: string | null) => async () => id;
    expect(await assistantAccess(store, session(null))).toMatchObject({ ok: false, status: 401 });
    expect(await assistantAccess(store, session("u-nobody"))).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await assistantAccess(store, session("u-foreman-1"))).toEqual({ ok: true });
  });

  test("демонстрация без базы: вход не нужен, работает лимит адреса", async () => {
    expect(await assistantAccess(null, async () => null)).toEqual({ ok: true });
  });
});
