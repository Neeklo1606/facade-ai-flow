import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { resetState } from "@/adapters/gas-ops/state";
import { GasOpsError } from "@/ports/gas-ops";
import {
  DIRECTORY_TEMPLATE,
  guessDirectoryHeader,
  normName,
  normPhone,
  planDirectoryImport,
  readDirectory,
  type DirectoryState,
} from "@/domain/gas-ops/directory-import";

/** Импорт справочников из Excel (ADR-062, F3): разбор, дубли, план и порт. Данные демо */

const state: DirectoryState = {
  brigades: [
    { id: "b1", name: "Бригада 1", phone: "+7 900 111-11-11", leadName: "Демо Иван" },
    { id: "b2", name: "Бригада 2", phone: null, leadName: null },
  ],
  crew: [
    { id: "c1", brigadeId: "b1", employeeId: "e1", name: "Демо Пётр Ильич", to: null },
    { id: "c2", brigadeId: "b2", employeeId: "e2", name: "Демо Олег", to: null },
  ],
  rates: [{ employeeId: null, brigadeId: "b1", rubPerHour: 600, from: "2026-10-01" }],
};

describe("разбор листа", () => {
  test("шаблоны узнаются сами: заголовок и колонки", () => {
    expect(guessDirectoryHeader("brigades", DIRECTORY_TEMPLATE.brigades)).toEqual({
      row: 0,
      map: { brigade: 0, lead: 1, phone: 2 },
    });
    expect(guessDirectoryHeader("employees", DIRECTORY_TEMPLATE.employees)?.map).toEqual({
      name: 0,
      brigade: 1,
      from: 2,
    });
    expect(guessDirectoryHeader("rates", DIRECTORY_TEMPLATE.rates)?.map).toEqual({
      brigade: 0,
      name: 1,
      rate: 2,
      from: 3,
    });
  });

  test("неполные строки пропускаются с причиной, дата Excel читается", () => {
    const grid = [
      ["ФИО", "Бригада", "Дата начала"],
      ["Демо Анна", "Бригада 1", 46_298],
      ["", "Бригада 1", "03.10.2026"],
      ["Демо Борис", "Бригада 2", "вчера"],
      [null, null, null],
    ];
    const read = readDirectory("employees", grid, 0, { name: 0, brigade: 1, from: 2 });
    expect(read.rows.map((r) => [r.row, r.name, r.from])).toEqual([[2, "Демо Анна", "2026-10-03"]]);
    expect(read.skipped).toEqual([
      { row: 3, reason: "нет значения «ФИО»" },
      { row: 4, reason: "дата «вчера» не распознана" },
    ]);
  });

  test("сравнение ФИО и телефона", () => {
    expect(normName("  Демо  Пётр.Ильич ")).toBe(normName("демо петр ильич"));
    expect(normPhone("8 (900) 111-11-11")).toBe(normPhone("+7 900 1111111"));
    expect(normPhone("12-34")).toBeNull();
  });
});

const row = (r: number, part: Partial<Parameters<typeof planDirectoryImport>[1][number]>) => ({
  row: r,
  brigade: "",
  lead: "",
  phone: "",
  name: "",
  from: null,
  rate: null,
  ...part,
});

describe("план импорта", () => {
  test("бригады: новая, обновление бригадира, телефон чужой бригады, повтор в файле", () => {
    const plan = planDirectoryImport(
      "brigades",
      [
        row(2, { brigade: "Бригада 12", lead: "Демо Семён", phone: "+7 900 000-00-12" }),
        row(3, { brigade: "бригада  2", lead: "Демо Глеб" }),
        row(4, { brigade: "Бригада 13", phone: "8 900 111 11 11" }),
        row(5, { brigade: "Бригада 12" }),
        row(6, { brigade: "Бригада 1", lead: "демо иван" }),
      ],
      state,
    );
    expect(plan.added.map((c) => c.row)).toEqual([2]);
    expect(plan.updated).toEqual([
      { kind: "brigade-update", row: 3, brigadeId: "b2", lead: "Демо Глеб", phone: null },
    ]);
    expect(plan.skipped).toEqual([
      { row: 4, reason: "телефон уже у бригады «Бригада 1»" },
      { row: 5, reason: "повтор строки 2" },
      { row: 6, reason: "бригада уже есть, без изменений" },
    ]);
  });

  test("сотрудники: новый, переход в другую бригаду, уже в составе, нет бригады", () => {
    const plan = planDirectoryImport(
      "employees",
      [
        row(2, { name: "Демо Анна", brigade: "Бригада 1", from: "2026-10-03" }),
        row(3, { name: "демо олег", brigade: "Бригада 1", from: "2026-10-05" }),
        row(4, { name: "Демо Пётр Ильич", brigade: "1", from: "2026-10-03" }),
        row(5, { name: "Демо Вера", brigade: "Бригада 9", from: "2026-10-03" }),
      ],
      state,
    );
    expect(plan.added.map((c) => c.row)).toEqual([2]);
    expect(plan.updated[0]).toMatchObject({ kind: "member-move", memberId: "c2", brigadeId: "b1" });
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      "уже в составе «Бригада 1»",
      "нет бригады «Бригада 9» в справочнике",
    ]);
  });

  test("ставки: на бригаду и на человека, та же ставка, человека нет в составе", () => {
    const plan = planDirectoryImport(
      "rates",
      [
        row(2, { brigade: "Бригада 1", rate: 650, from: "2026-10-01" }),
        row(3, { brigade: "Бригада 1", name: "Демо Пётр Ильич", rate: 700, from: "2026-10-01" }),
        row(4, { brigade: "Бригада 2", name: "Демо Пётр Ильич", rate: 700, from: "2026-10-01" }),
        row(5, { brigade: "Бригада 2", rate: 0, from: "2026-10-01" }),
      ],
      state,
    );
    expect(plan.updated).toEqual([
      expect.objectContaining({ row: 2, rubPerHour: 650, update: true }),
    ]);
    expect(plan.added).toEqual([expect.objectContaining({ row: 3, employeeId: "e1" })]);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      "«Демо Пётр Ильич» нет в составе «Бригада 2»",
      "ставка должна быть больше нуля",
    ]);
  });
});

/* ---------------------------------------------------------------- Порт */

const port = createGasOpsDemo();

beforeEach(async () => {
  resetState();
  await port.signIn("u-manager");
});

async function errorCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof GasOpsError ? error.code : "unknown";
  }
}

describe("порт", () => {
  test("бригада с бригадиром и телефоном, затем сотрудник в неё; повтор пропускается", async () => {
    const report = await port.importDirectory({
      kind: "brigades",
      rows: [row(2, { brigade: "Бригада 77", lead: "Демо Семён", phone: "+7 900 000-00-77" })],
    });
    expect(report).toEqual({ added: 1, updated: 0, skipped: [] });
    let s = await port.snapshot();
    const brigade = s.brigades.find((b) => b.name === "Бригада 77")!;
    expect(brigade.phone).toBe("+7 900 000-00-77");
    expect(s.employees.find((e) => e.brigadeId === brigade.id)).toMatchObject({
      name: "Демо Семён",
      isLead: true,
    });
    expect(s.crew.find((m) => m.brigadeId === brigade.id)?.role).toBe("lead");
    expect(s.audit[0]?.detail).not.toContain("Семён");

    const employees = await port.importDirectory({
      kind: "employees",
      rows: [
        row(2, { name: "Демо Анна", brigade: "Бригада 77", from: "2026-10-03" }),
        row(3, { name: "Демо Анна", brigade: "Бригада 77", from: "2026-10-03" }),
      ],
      skipped: [{ row: 4, reason: "нет значения «ФИО»" }],
    });
    expect(employees.added).toBe(1);
    expect(employees.skipped.map((x) => x.row)).toEqual([3, 4]);
    s = await port.snapshot();
    expect(s.crew.filter((m) => m.brigadeId === brigade.id).map((m) => m.name)).toContain(
      "Демо Анна",
    );
  });

  test("ставки импортирует руководитель, менеджеру отказ", async () => {
    const rows = [row(2, { brigade: "Бригада 1", rate: 640, from: "2026-11-02" })];
    expect(await errorCode(() => port.importDirectory({ kind: "rates", rows }))).toBe(
      "not-allowed",
    );
    await port.signIn("u-director");
    expect((await port.importDirectory({ kind: "rates", rows })).added).toBe(1);
    const s = await port.snapshot();
    expect(s.rates.at(-1)).toMatchObject({ rubPerHour: 640, from: "2026-11-02", to: null });
  });

  test("«Добавить объект»: номер уникален, вид работ необязателен", async () => {
    const object = await port.addObject({ label: "ул. Демо, 300", code: "ОБ-300", workType: null });
    expect(object).toMatchObject({ label: "ул. Демо, 300", code: "ОБ-300", workType: null });
    expect((await port.snapshot()).objects.some((o) => o.id === object.id)).toBe(true);
    expect(
      await errorCode(() => port.addObject({ label: "другой", code: "об-300", workType: "котел" })),
    ).toBe("duplicate");
    expect(
      await errorCode(() => port.addObject({ label: "", code: "ОБ-301", workType: null })),
    ).toBe("comment-required");
  });
});
