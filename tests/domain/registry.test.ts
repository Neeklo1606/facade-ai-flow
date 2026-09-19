import { describe, expect, test } from "bun:test";
import type { Project, ProjectOverview } from "@/contracts";
import { registryColumns, registryRows, type RegistryItem } from "@/domain/registry";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "ЖК «Северная Корона», корпус 3",
    code: "СК-3",
    region: "Москва",
    stage: "Монтаж фасада, этап 1",
    status: "active",
    startDate: "2026-05-12",
    endDate: "2027-03-31",
    customerId: "c-stroyinvest",
    customer: "СтройИнвест",
    contractId: "ct-1",
    contract: "ДСК-2026/008",
    manager: "e-sokolov",
    ...overrides,
  };
}

function overview(overrides: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    projectId: "p-1",
    region: "Москва",
    stage: "Монтаж фасада, этап 1",
    docVersion: "Рев. 3",
    specTotal: 0,
    specUnverified: 0,
    inRequests: 0,
    offersReceived: 0,
    ordered: 0,
    inTransit: 0,
    delivered: 0,
    activeRequests: 0,
    overdueRequests: 0,
    openChanges: 0,
    missingReports: 0,
    deliveriesToAccept: 0,
    openRemarks: 0,
    ...overrides,
  };
}

/** Строка реестра: объект и сводка с одним id */
function item(
  id: string,
  over: Partial<ProjectOverview> = {},
  proj: Partial<Project> = {},
): RegistryItem {
  return {
    project: project({ id, ...proj }),
    overview: overview({ projectId: id, ...over }),
  };
}

const ids = (rows: RegistryItem[]) => rows.map((row) => row.project.id);

describe("registryRows: фильтр", () => {
  test("пустой список — пусто", () => {
    expect(registryRows([], {})).toEqual([]);
    expect(registryRows([], { region: "Москва", unverified: true })).toEqual([]);
  });

  test("пустой фильтр оставляет все объекты", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(ids(registryRows(items, {})).sort()).toEqual(["a", "b", "c"]);
  });

  test("регион берётся из сводки", () => {
    const items = [
      item("msk", { region: "Москва" }),
      item("spb", { region: "Санкт-Петербург" }, { region: "Москва" }),
    ];
    expect(ids(registryRows(items, { region: "Санкт-Петербург" }))).toEqual(["spb"]);
    expect(ids(registryRows(items, { region: "Казань" }))).toEqual([]);
  });

  test("ответственный", () => {
    const items = [
      item("a", {}, { manager: "e-sokolov" }),
      item("b", {}, { manager: "e-petrova" }),
    ];
    expect(ids(registryRows(items, { managerId: "e-petrova" }))).toEqual(["b"]);
  });

  test("статус объекта", () => {
    const items = [
      item("a", {}, { status: "active" }),
      item("b", {}, { status: "at_risk" }),
      item("c", {}, { status: "done" }),
    ];
    expect(ids(registryRows(items, { status: "at_risk" }))).toEqual(["b"]);
  });

  test("«только с непроверенными»: 0 — нет, 1 — да", () => {
    const items = [item("zero", { specUnverified: 0 }), item("one", { specUnverified: 1 })];
    expect(ids(registryRows(items, { unverified: true }))).toEqual(["one"]);
  });

  test("unverified: false не фильтрует", () => {
    const items = [item("zero", { specUnverified: 0 }), item("one", { specUnverified: 1 })];
    expect(registryRows(items, { unverified: false })).toHaveLength(2);
  });

  test("условия складываются через «и»", () => {
    const items = [
      item("match", { region: "Москва", specUnverified: 5 }, { manager: "e-1", status: "active" }),
      item("region", { region: "Казань", specUnverified: 5 }, { manager: "e-1", status: "active" }),
      item(
        "manager",
        { region: "Москва", specUnverified: 5 },
        { manager: "e-2", status: "active" },
      ),
      item("status", { region: "Москва", specUnverified: 5 }, { manager: "e-1", status: "paused" }),
      item(
        "verified",
        { region: "Москва", specUnverified: 0 },
        { manager: "e-1", status: "active" },
      ),
    ];
    const filter = {
      region: "Москва",
      managerId: "e-1",
      status: "active",
      unverified: true,
    } as const;
    expect(ids(registryRows(items, filter))).toEqual(["match"]);
  });
});

describe("registryRows: порядок", () => {
  test("сначала больше просроченных ответов, затем больше непроверенных строк", () => {
    const items = [
      item("a", { overdueRequests: 0, specUnverified: 50 }),
      item("b", { overdueRequests: 2, specUnverified: 0 }),
      item("c", { overdueRequests: 1, specUnverified: 300 }),
      item("d", { overdueRequests: 1, specUnverified: 10 }),
    ];
    expect(ids(registryRows(items, {}))).toEqual(["b", "c", "d", "a"]);
  });

  test("просроченный ответ важнее любого числа непроверенных строк", () => {
    // Объёмы по плану: 847 позиций на документ, десятки документов на объект — десятки тысяч строк
    const items = [
      item("many-unverified", { overdueRequests: 0, specUnverified: 25_000 }),
      item("one-overdue", { overdueRequests: 1, specUnverified: 0 }),
    ];
    expect(ids(registryRows(items, {}))).toEqual(["one-overdue", "many-unverified"]);
  });

  test("равный вес — порядок входа сохраняется", () => {
    const items = [
      item("x", { overdueRequests: 1, specUnverified: 7 }),
      item("y", { overdueRequests: 1, specUnverified: 7 }),
      item("z", { overdueRequests: 1, specUnverified: 7 }),
    ];
    expect(ids(registryRows(items, {}))).toEqual(["x", "y", "z"]);
  });

  test("входной массив не меняется", () => {
    const items = [item("low", { specUnverified: 1 }), item("high", { specUnverified: 9 })];
    registryRows(items, {});
    expect(ids(items)).toEqual(["low", "high"]);
  });

  test("возвращает те же элементы с дополнительными полями", () => {
    const extra = { ...item("a"), note: "с отметкой" };
    const [row] = registryRows([extra], {});
    expect(row).toBe(extra);
    expect(row?.note).toBe("с отметкой");
  });
});

describe("registryColumns", () => {
  const names: Record<string, string> = { "e-sokolov": "Соколов А. В." };
  const columns = registryColumns((id) => names[id] ?? `?${id}`);
  const column = (header: string) => {
    const found = columns.find((item) => item.header === header);
    if (!found) throw new Error(`Нет колонки «${header}»`);
    return found;
  };

  const row = item(
    "p-1",
    {
      region: "Санкт-Петербург",
      docVersion: "Рев. 2",
      specTotal: 847,
      specUnverified: 112,
      activeRequests: 4,
      overdueRequests: 1,
      openChanges: 3,
    },
    {
      name: "ЖК «Приморский квартал», дом 7",
      code: "ПК-7",
      region: "Москва",
      customer: "СтройИнвест",
      manager: "e-sokolov",
      status: "at_risk",
    },
  );

  test("двенадцать колонок, уникальные заголовки, положительная ширина", () => {
    expect(columns).toHaveLength(12);
    expect(new Set(columns.map((item) => item.header)).size).toBe(12);
    for (const item of columns) expect(item.width).toBeGreaterThan(0);
  });

  test("колонки объекта берутся из объекта", () => {
    expect(column("Объект").value(row)).toBe("ЖК «Приморский квартал», дом 7");
    expect(column("Код").value(row)).toBe("ПК-7");
    expect(column("Заказчик").value(row)).toBe("СтройИнвест");
  });

  test("регион — из сводки, как в фильтре", () => {
    expect(column("Регион").value(row)).toBe("Санкт-Петербург");
  });

  test("ответственный — имя сотрудника по id", () => {
    expect(column("Ответственный").value(row)).toBe("Соколов А. В.");
    const other = item("p-2", {}, { manager: "e-unknown" });
    expect(column("Ответственный").value(other)).toBe("?e-unknown");
  });

  test("числа сводки выгружаются числами", () => {
    expect(column("Версия документации").value(row)).toBe("Рев. 2");
    expect(column("Позиций материалов").value(row)).toBe(847);
    expect(column("Непроверенных строк").value(row)).toBe(112);
    expect(column("Активных запросов").value(row)).toBe(4);
    expect(column("Просроченных ответов").value(row)).toBe(1);
    expect(column("Открытых изменений").value(row)).toBe(3);
  });

  test("нули остаются нулями, прочерк версии — прочерком", () => {
    const empty = item("p-3", { docVersion: "—" });
    expect(column("Позиций материалов").value(empty)).toBe(0);
    expect(column("Непроверенных строк").value(empty)).toBe(0);
    expect(column("Версия документации").value(empty)).toBe("—");
  });

  test("статус — подписью словаря контрактов", () => {
    const status = column("Статус");
    expect(status.value(item("a", {}, { status: "active" }))).toBe("В работе");
    expect(status.value(item("b", {}, { status: "at_risk" }))).toBe("Под риском");
    expect(status.value(item("c", {}, { status: "paused" }))).toBe("Приостановлен");
    expect(status.value(item("d", {}, { status: "done" }))).toBe("Завершён");
  });
});
