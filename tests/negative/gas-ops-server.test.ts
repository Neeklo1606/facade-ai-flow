import { describe, expect, test } from "bun:test";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import {
  GAS_METHOD_ROLES,
  GAS_METHODS,
  GasAccessError,
  answerGasCall,
  callGasMethod,
  redactFor,
} from "@/api/gas-ops-server";
import type { TimeEntry, User } from "@/domain/gas-ops/model";
import { createGasOpsRemote } from "@/adapters/gas-ops/remote";
import { GAS_OPS_METHODS, GasOpsError, type GasOpsSnapshot } from "@/ports/gas-ops";

/**
 * Серверные функции учёта времени (ADR-061, 14; HANDOFF v1.1, раздел 3): роль проверяется
 * на сервере до вызова порта, бригадиру суммы не возвращаются ни одним методом.
 */

function memory(): GasStore & { now(): GasOpsSnapshot } {
  let state = structuredClone(getServerSnapshot());
  return {
    read: async () => state,
    update: async (change) => (state = change(state)),
    now: () => state,
  };
}

/** Все значения денег в ответе: у бригадира их быть не должно */
function money(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const item of value) money(item, found);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/rub|revenue/i.test(key) && typeof item === "number") found.push(`${key}=${item}`);
      else money(item, found);
    }
  }
  return found;
}

async function refusal(run: () => Promise<unknown>): Promise<number | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof GasAccessError ? error.status : -1;
  }
}

const FOREMAN = "u-foreman-1";

describe("серверные функции учёта времени: доступ", () => {
  test("у каждого метода порта есть строка доступа, вход и сброс на сервере закрыты", () => {
    expect([...GAS_METHODS].sort() as string[]).toEqual(Object.keys(GAS_METHOD_ROLES).sort());
    expect(new Set(GAS_METHODS).size).toBe(GAS_METHODS.length);
    expect(GAS_METHOD_ROLES.signIn).toEqual([]);
    expect(GAS_METHOD_ROLES.reset).toEqual([]);
    expect(GAS_METHOD_ROLES.review).not.toContain("foreman");
    expect(GAS_METHOD_ROLES.closeWeek).toEqual(["director", "admin"]);
  });

  test("без сессии 401, чужой пользователь и неизвестное действие 403", async () => {
    const store = memory();
    const call = (userId: string | null, method = "snapshot") =>
      refusal(() => callGasMethod({ store, userId, method, args: [] }));
    expect(await call(null)).toBe(401);
    expect(await call("u-nobody")).toBe(403);
    expect(await call("u-manager", "dropDatabase")).toBe(403);
    expect(await call("u-manager", "reset")).toBe(403);
    expect(await call("u-manager", "signIn")).toBe(403);
  });

  test("бригадир не проверяет записи прямым запросом, менеджер проверяет", async () => {
    const store = memory();
    const pending = store.now().entries.find((e) => e.status === "pending")!;
    const review = (userId: string) =>
      callGasMethod({
        store,
        userId,
        method: "review",
        args: [{ id: pending.id, action: "confirm" }],
      });
    expect(await refusal(() => review(FOREMAN))).toBe(403);
    expect(store.now().entries.find((e) => e.id === pending.id)!.status).toBe("pending");
    const done = (await review("u-manager")) as TimeEntry;
    expect(done.status).toBe("confirmed");
    // Кто действовал, решает сессия; в хранилище `actorId` не меняется
    expect(store.now().actorId).toBe(getServerSnapshot().actorId);
    expect(store.now().reviews[0]!.actor).toBe("u-manager");
  });

  test("бригадир не вносит и не правит записи другой бригады", async () => {
    const store = memory();
    const other = store.now().entries.find((e) => e.brigadeId !== "brg-1")!;
    const create = refusal(() =>
      callGasMethod({
        store,
        userId: FOREMAN,
        method: "createEntry",
        args: [
          {
            day: store.now().today,
            brigadeId: other.brigadeId,
            employeeId: null,
            objectId: "obj-m1",
            start: "6:00",
            end: "7:00",
            breakMinutes: 0,
            submit: true,
          },
        ],
      }),
    );
    expect(await create).toBe(403);
    expect(
      await refusal(() =>
        callGasMethod({ store, userId: FOREMAN, method: "submitEntry", args: [other.id] }),
      ),
    ).toBe(403);
  });

  test("неделю закрывает руководитель: менеджеру закрытие недоступно", async () => {
    const store = memory();
    expect(
      await refusal(() =>
        callGasMethod({
          store,
          userId: "u-manager",
          method: "closeWeek",
          args: [{ accepted: [] }],
        }),
      ),
    ).toBe(403);
  });
});

describe("серверные функции учёта времени: финансы бригадиру не возвращаются", () => {
  test("снимок бригадира: своя бригада, ни одной суммы, без смет, ставок и журнала", async () => {
    const store = memory();
    expect(money(store.now()).length).toBeGreaterThan(0);
    const view = (await callGasMethod({
      store,
      userId: FOREMAN,
      method: "snapshot",
      args: [],
    })) as GasOpsSnapshot;
    expect(money(view)).toEqual([]);
    expect(view.entries.length).toBeGreaterThan(0);
    expect(view.entries.every((e) => e.brigadeId === "brg-1")).toBe(true);
    expect(view.estimates).toEqual([]);
    expect(view.estimateVersions).toEqual([]);
    expect(view.rates).toEqual([]);
    expect(view.audit).toEqual([]);
  });

  test("та же выборка у менеджера отдаёт суммы", async () => {
    const store = memory();
    const view = await callGasMethod({ store, userId: "u-manager", method: "snapshot", args: [] });
    expect(money(view).length).toBeGreaterThan(0);
  });

  test("запись, «Сегодня» и ответ на уточнение бригадира без сумм", async () => {
    const store = memory();
    const field = await callGasMethod({
      store,
      userId: FOREMAN,
      method: "fieldSnapshot",
      args: ["brg-1"],
    });
    expect(money(field)).toEqual([]);
    const created = (await callGasMethod({
      store,
      userId: FOREMAN,
      method: "createEntry",
      args: [
        {
          day: store.now().today,
          brigadeId: "brg-1",
          employeeId: null,
          objectId: "obj-m1",
          start: "5:00",
          end: "6:00",
          breakMinutes: 0,
          submit: true,
          channel: "bot",
        },
      ],
    })) as TimeEntry;
    expect(created.amountRub).toBeNull();

    const foreman = store.now().users.find((u) => u.id === FOREMAN) as User;
    const priced = store.now().entries.find((e) => e.amountRub !== null)!;
    expect(redactFor(foreman, "updateEntry", priced).amountRub).toBeNull();
    const manager = store.now().users.find((u) => u.id === "u-manager") as User;
    expect(redactFor(manager, "updateEntry", priced).amountRub).toBe(priced.amountRub);
  });
});

describe("серверные функции учёта времени: ответ по сети и клиент порта", () => {
  test("без базы 501, неверные данные 400, правило порта — его код", async () => {
    expect(await answerGasCall({ method: "snapshot", args: [] }, "u-manager", null)).toMatchObject({
      ok: false,
      status: 501,
      code: "not-configured",
    });
    const store = memory();
    expect(
      await answerGasCall({ method: "review", args: [{ id: 42 }] }, "u-manager", store),
    ).toMatchObject({ ok: false, status: 400 });
    const pending = store.now().entries.find((e) => e.status === "pending")!;
    // Вернуть на уточнение без вопроса нельзя: правило порта
    expect(
      await answerGasCall(
        { method: "review", args: [{ id: pending.id, action: "clarify" }] },
        "u-manager",
        store,
      ),
    ).toMatchObject({ ok: false, status: 422, code: "comment-required" });
  });

  test("клиент порта: отказ с тем же кодом, после действия снимок перечитан", async () => {
    const store = memory();
    const seen: GasOpsSnapshot[] = [];
    const remote = createGasOpsRemote(
      GAS_OPS_METHODS,
      async (method, args) =>
        JSON.parse(JSON.stringify(await answerGasCall({ method, args }, "u-manager", store))),
      (s) => seen.push(s),
    );
    const pending = store.now().entries.find((e) => e.status === "pending")!;
    await remote.review({ id: pending.id, action: "confirm" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.entries.find((e) => e.id === pending.id)!.status).toBe("confirmed");
    const other = store.now().entries.find((e) => e.status === "pending")!;
    let code: string | null = null;
    try {
      await remote.review({ id: other.id, action: "reject" });
    } catch (error) {
      code = error instanceof GasOpsError ? error.code : "other";
    }
    expect(code).toBe("comment-required");
    // Отказ не перечитывает снимок
    expect(seen).toHaveLength(1);
  });
});
