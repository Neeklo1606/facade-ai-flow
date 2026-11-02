import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { getSnapshot, resetState, update } from "@/adapters/gas-ops/state";
import {
  detectAmountCol,
  parseEstimateGrid,
  parseEstimateWorkbook,
} from "@/domain/gas-ops/estimate-parse";
import type { Grid } from "@/domain/gas-ops/estimate-labels";
import {
  ESTIMATE_TEMPLATE,
  SCHEDULE_TEMPLATE,
  columnsOf,
  estimateCheck,
  firstFilledSheet,
  guessVatIncluded,
  rawPreview,
  scheduleCheck,
} from "@/domain/gas-ops/import-wizard";
import { guessHeader, readSchedule } from "@/domain/gas-ops/schedule-import";
import { inviteOf, staffRows } from "@/domain/gas-ops/staff";
import { GasOpsError } from "@/ports/gas-ops";

/**
 * Мастер импорта Excel (ADR-061, 12; раздел 4.7): лист, колонки с примером, файл как есть,
 * шаблоны, плашка проверки; отмена импорта сметы и смена роли в порту.
 */

const template = ESTIMATE_TEMPLATE as Grid;

describe("лист, колонки и файл как есть", () => {
  test("первый непустой лист", () => {
    expect(
      firstFilledSheet([
        { name: "Пусто", grid: [[null, ""]] },
        { name: "График", grid: [["Объект"]] },
      ]),
    ).toBe(1);
    expect(firstFilledSheet([])).toBe(0);
  });

  test("колонки: подпись заголовка и пример значения из первой строки данных", () => {
    const grid = SCHEDULE_TEMPLATE as Grid;
    const columns = columnsOf(grid, 0);
    expect(columns.map((c) => c.label)).toEqual(["Объект", "Номер", "Бригада", "Дата"]);
    expect(columns[2]!.sample).toBe("Бригада 1");
    // Пустые заголовки получают «Колонка N», числа показываются с запятой
    expect(
      columnsOf(
        [
          [null, "Сумма"],
          [7, 1.5],
        ],
        0,
      ),
    ).toEqual([
      { index: 0, label: "Колонка 1", sample: "7" },
      { index: 1, label: "Сумма", sample: "1,5" },
    ]);
  });

  test("файл как есть: номера строк файла и заданная ширина", () => {
    const preview = rawPreview(template, 3, 2);
    expect(preview).toEqual([
      { row: 1, cells: ["ГРАНД-Смета", ""] },
      { row: 2, cells: ["ЛОКАЛЬНЫЙ СМЕТНЫЙ РАСЧЕТ (СМЕТА)", ""] },
      { row: 3, cells: ["№ п/п", "Наименование работ и затрат"] },
    ]);
  });
});

describe("график", () => {
  test("шаблон графика узнаётся без ручного выбора колонок", () => {
    const grid = SCHEDULE_TEMPLATE as Grid;
    const header = guessHeader(grid)!;
    expect(header.row).toBe(0);
    const parse = readSchedule(grid, header.row, header.map);
    expect(parse.rows).toHaveLength(2);
    expect(scheduleCheck(parse)).toEqual({
      level: "ok",
      title: "Все строки прочитаны: 2",
      details: [],
    });
  });

  test("пропущенные строки — жёлтая плашка с номерами строк", () => {
    const grid: Grid = [...(SCHEDULE_TEMPLATE as Grid), ["ул. Демо, 9", "", "Бригада 2", "завтра"]];
    const header = guessHeader(grid)!;
    const check = scheduleCheck(readSchedule(grid, header.row, header.map));
    expect(check.level).toBe("warn");
    expect(check.details).toEqual(["Строка 4: день не распознан"]);
  });
});

describe("смета", () => {
  test("шаблон сметы разбирается без замечаний, разделы сходятся без НДС", () => {
    const parsed = parseEstimateGrid(template);
    expect(parsed.status).toBe("parsed");
    expect(guessVatIncluded(parsed)).toBe(false);
    expect(estimateCheck(parsed, false).level).toBe("ok");
  });

  test("«цены с НДС»: та же смета сверяется с «ВСЕГО по смете» и даёт жёлтую плашку", () => {
    const check = estimateCheck(parseEstimateGrid(template), true);
    expect(check.level).toBe("warn");
    expect(check.title).toContain("Проверьте колонки");
    expect(check.details[0]).toContain("строке 16");
  });

  test("колонка сумм вручную: разбор берёт выбранную колонку", () => {
    expect(detectAmountCol(template)).toBe(2);
    // Вторая колонка сумм с удвоенными значениями: так видно, какую колонку взял разбор
    const doubled: Grid = template.map((row) => [
      ...row,
      typeof row[2] === "number" ? row[2] * 2 : null,
    ]);
    expect(parseEstimateGrid(doubled).totals.total?.kopecks).toBe(12_200_000);
    expect(parseEstimateGrid(doubled, { amountCol: 3 }).totals.total?.kopecks).toBe(24_400_000);
  });

  test("строка начала: строки выше пропускаются", () => {
    const parsed = parseEstimateGrid(template, { fromRow: 6 });
    expect(parsed.sections.map((s) => s.title)).toEqual(["Раздел 2 Пусконаладка"]);
    expect(estimateCheck(parsed, false).level).toBe("warn");
  });

  test("выбранный лист разбирается, даже если другой лучше", () => {
    const sheets = [
      { name: "Смета", grid: template },
      { name: "Пустой", grid: [["Лист"]] as Grid },
    ];
    expect(parseEstimateWorkbook(sheets).sheet).toBe("Смета");
    const chosen = parseEstimateWorkbook(sheets, { sheet: "Пустой" });
    expect(chosen.sheet).toBe("Пустой");
    expect(estimateCheck(chosen, false).level).toBe("error");
  });
});

describe("порт: отмена импорта и роли", () => {
  beforeEach(() => resetState());

  test("неподтверждённая версия сметы удаляется, подтверждённая — нет", async () => {
    const port = createGasOpsDemo();
    const parsed = { ...parseEstimateGrid(template), sheet: "Смета" };
    const version = await port.addEstimateVersion({ parsed, fileName: "s.xlsx", objectId: null });
    expect(getSnapshot().estimateVersions.some((v) => v.id === version.id)).toBe(true);
    await port.discardEstimateVersion(version.id);
    expect(getSnapshot().estimateVersions.some((v) => v.id === version.id)).toBe(false);
    expect(getSnapshot().audit[0]!.action).toBe("estimate.discard");

    const kept = await port.addEstimateVersion({ parsed, fileName: "s.xlsx", objectId: null });
    update((s) => ({
      ...s,
      estimateVersions: s.estimateVersions.map((v) =>
        v.id === kept.id
          ? { ...v, confirmedAt: "2026-10-03T12:00:00", confirmedBy: "u-manager" }
          : v,
      ),
    }));
    await expect((async () => port.discardEstimateVersion(kept.id))()).rejects.toBeInstanceOf(
      GasOpsError,
    );
  });

  test("роль меняет только администратор и не себе", async () => {
    const port = createGasOpsDemo();
    const foreman = getSnapshot().users.find((u) => u.role === "foreman")!;
    await expect(
      (async () => port.setUserRole({ userId: foreman.id, role: "manager" }))(),
    ).rejects.toBeInstanceOf(GasOpsError);
    const admin = getSnapshot().users.find((u) => u.role === "admin")!;
    update((s) => ({ ...s, actorId: admin.id }));
    const changed = await port.setUserRole({ userId: foreman.id, role: "manager" });
    expect(changed.role).toBe("manager");
    expect(getSnapshot().audit[0]!.detail).toContain("Бригадир → Менеджер проверки");
    await expect(
      (async () => port.setUserRole({ userId: admin.id, role: "manager" }))(),
    ).rejects.toBeInstanceOf(GasOpsError);
  });
});

describe("сотрудники", () => {
  beforeEach(() => resetState());

  test("состав бригад и люди офиса в одной таблице; роль — у кого есть вход", () => {
    const s = getSnapshot();
    const rows = staffRows({ ...s, crew: s.crew ?? [] });
    const lead = rows.find((r) => r.brigadeId === "brg-1" && r.position === "Бригадир")!;
    expect(lead.role).toBe("foreman");
    expect(lead.userId).toBe("u-foreman-1");
    const worker = rows.find((r) => r.brigadeId === "brg-1" && r.position === "Монтажник")!;
    expect(worker.role).toBeNull();
    const manager = rows.find((r) => r.userId === "u-manager")!;
    expect(manager.brigadeId).toBeNull();
    // Бригадир не повторяется строкой офиса
    expect(rows.filter((r) => r.userId === "u-foreman-1")).toHaveLength(1);
    // Активность по записям, а не выдумана
    expect(lead.lastActivity).not.toBeNull();
  });

  test("деактивация закрывает период в составе", async () => {
    const port = createGasOpsDemo();
    const s = getSnapshot();
    const member = (s.crew ?? []).find((m) => m.source === "mock")!;
    await port.endCrewMember({ id: member.id, to: "2026-10-01" });
    const after = getSnapshot();
    const row = staffRows({ ...after, crew: after.crew ?? [] }).find((r) => r.id === member.id)!;
    expect(row.active).toBe(false);
  });

  test("приглашение: код из шести цифр, ссылка с ним, одно и то же для человека", () => {
    const a = inviteOf("crw-demo-brg-1-1");
    expect(a.code).toMatch(/^\d{6}$/);
    expect(a.link).toContain(a.code);
    expect(inviteOf("crw-demo-brg-1-1")).toEqual(a);
    expect(inviteOf("crw-demo-brg-1-2").code).not.toBe(a.code);
  });
});
