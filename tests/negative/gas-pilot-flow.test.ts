import { describe, expect, test } from "bun:test";
import { withRealCalendar } from "@/adapters/gas-ops/calendar-store";
import type { GasStore } from "@/adapters/gas-ops/store";
import { GasAccessError, callGasMethod } from "@/api/gas-ops-server";
import type { Grid } from "@/domain/gas-ops/estimate-labels";
import { parseEstimateWorkbook } from "@/domain/gas-ops/estimate-parse";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { addGasUser, emptyCompany } from "@/domain/gas-ops/pilot";
import { DEFAULT_RULE_TERMS, extraKey } from "@/domain/gas-ops/work-cost";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

/**
 * Рабочий контур пилота (ADR-069) целиком на сервере: пустая компания без демо-набора,
 * пользователи с идентификаторами сотрудников входа, роли проверяются `callGasMethod`.
 * Тот же путь, что показ заказчику (e2e/gas-customer-flow.spec.ts), но без вкладки:
 * справочники → объект → график → смета → формула → бригадир → проверка → новая неделя.
 */

const OWNER = "7f1d0a10-0000-4000-8000-000000000001";
const MANAGER = "7f1d0a10-0000-4000-8000-000000000002";
const FOREMAN = "7f1d0a10-0000-4000-8000-000000000003";

function memory(initial: GasOpsSnapshot): GasStore {
  let state = initial;
  return { read: async () => state, update: async (change) => (state = change(state)) };
}

/** Синтетическая ГРАНД-Смета с теми же итогами, что e2e/gas-estimate-file.cli.ts --extras */
function estimateGrid(): Grid {
  const grid: Grid = Array.from({ length: 526 }, () => Array<null>(16).fill(null));
  const put = (row: number, cols: Record<number, string | number>) => {
    for (const [c, v] of Object.entries(cols)) grid[row - 1]![Number(c)] = v;
  };
  put(10, { 6: "ГРАНД-Смета, версия 2026.2" });
  put(43, { 10: "всего с учетом коэффициентов", 15: "всего в текущем уровне цен" });
  put(450, { 2: "Всего по разделу 1 Монтаж стальных газопроводов", 15: 90000.08 });
  put(483, { 2: "Всего по разделу 2 Испытания газопроводов", 15: 30000.16 });
  put(487, { 2: "Итоги по смете:" });
  put(493, { 2: " Материалы", 15: 20000.01 });
  put(519, { 2: "Всего", 15: 120000.24 });
  put(523, { 2: " НДС 22%", 15: 26400.05 });
  put(524, { 2: "ВСЕГО по смете", 15: 146400.29 });
  put(525, { 2: "Технадзор", 15: 5000 });
  return grid;
}

describe("пилот на сервере: от пустой базы до принятой записи", () => {
  test("справочники, объект, график, смета, формула, бригадир, проверка, новая неделя", async () => {
    let clock = "2026-11-12";
    const store = withRealCalendar(
      memory(
        emptyCompany({
          today: clock,
          groupName: "1. Стальные",
          owner: { id: OWNER, name: "Соколов Артём" },
        }),
      ),
      () => clock,
    );
    const as = (userId: string, method: string, ...args: unknown[]) =>
      callGasMethod({ store, userId, method, args });

    // Сотрудник входа без строки учёта времени: понятный отказ, а не чужие данные
    await expect(as(MANAGER, "snapshot")).rejects.toBeInstanceOf(GasAccessError);

    // 1. Администратор: бригады из Excel, затем менеджер и бригадир с id сотрудников входа
    const report = (await as(OWNER, "importDirectory", {
      kind: "brigades",
      rows: [
        {
          row: 2,
          brigade: "Бригада 1",
          lead: "Петров Илья",
          phone: "+7 900 000-00-01",
          name: "",
          from: null,
          rate: null,
        },
      ],
    })) as { added: number };
    expect(report.added).toBe(1);
    await store.update((s) =>
      addGasUser(s, { id: MANAGER, name: "Иванова Ольга", role: "manager" }),
    );
    await store.update((s) =>
      addGasUser(s, {
        id: FOREMAN,
        name: "Петров Илья",
        role: "foreman",
        brigadeName: "Бригада 1",
      }),
    );
    const brigadeId = (await store.read()).brigades[0]!.id;

    // 2. Менеджер: объект и график на сегодня
    const object = (await as(MANAGER, "addObject", {
      label: "ст. Демо-Северная, ул. Демо, 300",
      code: "ОБ-300",
      workType: "котел",
    })) as { id: string };
    await as(MANAGER, "applySchedule", {
      rows: [
        {
          key: "ОБ-300|Бригада 1|2026-11-12",
          objectLabel: "ст. Демо-Северная, ул. Демо, 300",
          code: "ОБ-300",
          brigade: "Бригада 1",
          day: "2026-11-12",
          row: 2,
        },
      ],
      fileName: "График.xlsx",
    });

    // 3. Смета: разбор, привязка, замечания, подтверждение — 100 000 ₽ без НДС минус материалы
    const parsed = parseEstimateWorkbook([{ name: "Смета", grid: estimateGrid() }]);
    const version = (await as(MANAGER, "addEstimateVersion", {
      parsed,
      fileName: "Смета ОБ-300.xlsx",
      objectId: null,
    })) as { id: string };
    await as(MANAGER, "linkEstimateVersion", { id: version.id, objectId: object.id });
    await as(MANAGER, "reviewEstimateIssues", version.id);
    await as(MANAGER, "confirmEstimateVersion", version.id);
    expect((await store.read()).estimates.find((e) => e.objectId === object.id)?.amountRub).toBe(
      100_000,
    );

    // 4. Формула: технадзор плюсом, правило подтверждено — 105 000 ₽
    const terms = [...DEFAULT_RULE_TERMS, { key: extraKey("Технадзор"), sign: 1 as const }];
    await as(MANAGER, "saveCostRule", { objectId: null, terms });
    await as(MANAGER, "confirmCostRule", { objectId: null, terms });
    expect((await store.read()).estimates.find((e) => e.objectId === object.id)?.amountRub).toBe(
      105_000,
    );

    // 5. Бригадир вносит время своей бригады; чужую бригаду и проверку ему нельзя
    const entry = (await as(FOREMAN, "createEntry", {
      day: "2026-11-12",
      brigadeId,
      employeeId: null,
      objectId: object.id,
      start: "8:00",
      end: "17:00",
      breakMinutes: 60,
      submit: true,
    })) as TimeEntry;
    expect(entry.minutes).toBe(480);
    expect(entry).not.toHaveProperty("amountRub", 105_000);
    await expect(as(FOREMAN, "review", { id: entry.id, action: "confirm" })).rejects.toBeInstanceOf(
      GasAccessError,
    );

    // 6. Менеджер принимает: запись получает всю стоимость объекта по минутам
    const accepted = (await as(MANAGER, "review", {
      id: entry.id,
      action: "confirm",
    })) as TimeEntry;
    expect(accepted.status).toBe("confirmed");
    expect(accepted.amountRub).toBe(105_000);

    // 7. Новая неделя по часам сервера: неделя сменилась, запись прошлой недели на месте
    clock = "2026-11-16";
    const next = (await as(MANAGER, "snapshot")) as GasOpsSnapshot;
    expect(next.today).toBe("2026-11-16");
    expect(next.week.from).toBe("2026-11-16");
    expect(next.entries.find((e) => e.id === entry.id)?.amountRub).toBe(105_000);
    const monday = (await as(FOREMAN, "createEntry", {
      day: "2026-11-16",
      brigadeId,
      employeeId: null,
      objectId: object.id,
      start: "9:00",
      end: "12:00",
      breakMinutes: 0,
      submit: true,
    })) as TimeEntry;
    expect(monday.day).toBe("2026-11-16");
  });
});
