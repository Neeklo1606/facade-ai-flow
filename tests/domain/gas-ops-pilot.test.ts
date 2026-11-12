import { describe, expect, test } from "bun:test";
import {
  addGasUser,
  advanceCalendar,
  emptyCompany,
  localDay,
  weekOf,
} from "@/domain/gas-ops/pilot";

const owner = { id: "0b7c9a52-1111-4c3e-9d1f-000000000001", name: "Соколов Артём" };

describe("календарь пилота", () => {
  test("неделя понедельник–суббота, как в отчёте заказчика", () => {
    expect(weekOf("2026-10-03")).toEqual({
      from: "2026-09-28",
      to: "2026-10-03",
      days: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"],
    });
    expect(weekOf("2026-09-28").from).toBe("2026-09-28");
  });

  test("воскресенье относится к прошедшей неделе", () => {
    expect(weekOf("2026-10-04").from).toBe("2026-09-28");
    expect(weekOf("2026-10-05").from).toBe("2026-10-05");
  });

  test("неделя через границу месяца и года", () => {
    expect(weekOf("2027-01-01")).toMatchObject({ from: "2026-12-28", to: "2027-01-02" });
  });

  test("день считается в часовом поясе компании", () => {
    const lateUtc = new Date("2026-11-12T22:30:00Z");
    expect(localDay(lateUtc, "Europe/Moscow")).toBe("2026-11-13");
    expect(localDay(lateUtc, "UTC")).toBe("2026-11-12");
  });

  test("календарь идёт вперёд и не возвращается назад", () => {
    const start = emptyCompany({ today: "2026-11-12", groupName: "Стальные", owner });
    const next = advanceCalendar(start, "2026-11-16");
    expect(next.today).toBe("2026-11-16");
    expect(next.week.from).toBe("2026-11-16");
    expect(advanceCalendar(next, "2026-11-10")).toBe(next);
    expect(advanceCalendar(next, "2026-11-16")).toBe(next);
  });
});

describe("пустая компания", () => {
  test("без демо-данных: одно подразделение, правило по умолчанию, администратор", () => {
    const s = emptyCompany({ today: "2026-11-12", groupName: " 1. Стальные ", owner });
    expect(s.groups).toEqual([{ id: "grp-1", name: "1. Стальные", code: null, excelRow: null }]);
    expect(s.objects).toHaveLength(0);
    expect(s.entries).toHaveLength(0);
    expect(s.brigades).toHaveLength(0);
    expect(s.supply.requests).toHaveLength(0);
    expect(s.docs.works).toHaveLength(0);
    expect(s.costRules).toHaveLength(1);
    expect(s.users).toEqual([
      { id: owner.id, name: owner.name, role: "admin", brigadeId: null, allowedObjectIds: "all" },
    ]);
    expect(s.actorId).toBe(owner.id);
    expect(s.week).toEqual(weekOf("2026-11-12"));
  });

  test("пустое подразделение отклоняется", () => {
    expect(() => emptyCompany({ today: "2026-11-12", groupName: "  ", owner })).toThrow();
  });
});

describe("пользователь учёта времени", () => {
  const base = emptyCompany({ today: "2026-11-12", groupName: "Стальные", owner });
  const withBrigade = {
    ...base,
    brigades: [
      {
        ...({} as (typeof base.brigades)[number]),
        id: "brg-a",
        name: "Бригада 1",
        groupId: "grp-1",
      },
    ],
  };

  test("менеджер без бригады", () => {
    const s = addGasUser(base, { id: "u-2", name: "Иванова Ольга", role: "manager" });
    expect(s.users.at(-1)).toMatchObject({ id: "u-2", role: "manager", brigadeId: null });
  });

  test("бригадир привязан к бригаде по названию без учёта регистра", () => {
    const s = addGasUser(withBrigade, {
      id: "u-3",
      name: "Петров Илья",
      role: "foreman",
      brigadeName: "бригада 1",
    });
    expect(s.users.at(-1)).toMatchObject({ role: "foreman", brigadeId: "brg-a" });
  });

  test("бригадир без бригады в справочнике отклоняется с причиной", () => {
    expect(() =>
      addGasUser(base, {
        id: "u-3",
        name: "Петров Илья",
        role: "foreman",
        brigadeName: "Бригада 9",
      }),
    ).toThrow("Бригады «Бригада 9» нет в справочнике");
  });

  test("повтор сотрудника отклоняется", () => {
    expect(() => addGasUser(base, { id: owner.id, name: "Ещё раз", role: "manager" })).toThrow(
      "уже заведён",
    );
  });
});

describe("бригада для просмотра ввода", () => {
  test("демо-бригада, если есть, иначе первая из справочника, иначе нет", async () => {
    const { viewBrigadeId } = await import("@/domain/gas-ops/pilot");
    expect(viewBrigadeId([{ id: "brg-7" }, { id: "brg-1" }])).toBe("brg-1");
    expect(viewBrigadeId([{ id: "b-uuid" }, { id: "b-2" }])).toBe("b-uuid");
    expect(viewBrigadeId([])).toBeNull();
  });
});
