import { describe, expect, test } from "bun:test";
import { can, MATRIX_ROLES } from "@/domain/access";
import { allNavItems, bottomNavFor, homeRouteFor, plusActionsFor } from "@/lib/navigation";

/**
 * Нижняя панель (ADR-026). Проверяется то, из-за чего панель была бесполезной: набор позиций
 * не зависел от роли, и прорабу предлагалась «Проверка» — экран, которого он по матрице
 * ADR-012 не видит. Плюс граница директора: у роли нет ни одного права на запись, и кнопки
 * создания у неё быть не должно.
 */

const PROJECT = "p-korona";

describe("набор позиций по роли", () => {
  test("у каждой роли матрицы три позиции слева и справа плюс «+» и «Ещё»", () => {
    for (const role of MATRIX_ROLES) {
      const items = bottomNavFor(role, PROJECT);
      expect(items.length, role).toBe(3);
    }
  });

  test("в панели нет раздела, закрытого роли", () => {
    for (const role of MATRIX_ROLES) {
      for (const item of bottomNavFor(role, PROJECT)) {
        // Позиция может называться иначе, чем её пункт меню (ADR-031, п. 5)
        const nav = allNavItems.find((navItem) => navItem.key === (item.navKey ?? item.key));
        expect(nav, `${role} → ${item.key}: позиция без пункта меню`).toBeTruthy();
        if (nav?.access) expect(can(role, nav.access), `${role} → ${item.key}`).toBe(true);
        if (nav?.anyOf)
          expect(
            nav.anyOf.some((section) => can(role, section)),
            `${role} → ${item.key}`,
          ).toBe(true);
      }
    }
  });

  test("состав — таблица целевой карты (ADR-026, поправка)", () => {
    const keys = (role: Parameters<typeof bottomNavFor>[0]) =>
      bottomNavFor(role, PROJECT).map((item) => item.key);
    expect(keys("foreman")).toEqual(["today", "deliveries", "field-reports"]);
    expect(keys("pto")).toEqual(["check", "documents", "projects"]);
    // «Закупки» заменены на раздел «Снабжение» (ADR-031, п. 5)
    expect(keys("supply")).toEqual(["attention", "supply", "projects"]);
    expect(keys("manager")).toEqual(["attention", "projects", "supply"]);
    expect(keys("director")).toEqual(["attention", "projects", "supply"]);
    // Прорабу не предлагается проверка документов: раздел ему закрыт
    expect(keys("foreman")).not.toContain("documents");
    // Первой стоит рабочий экран роли: панель начинается там же, где начинается день
    for (const role of MATRIX_ROLES) {
      const first = bottomNavFor(role, PROJECT)[0]!;
      expect(first.to, role).toBe(homeRouteFor(role));
    }
  });

  test("без выбранного объекта разделы объекта ведут в реестр за выбором", () => {
    for (const role of MATRIX_ROLES) {
      for (const item of bottomNavFor(role, null)) {
        const home = ["/attention", "/today", "/check", "/catalogs"].includes(item.to);
        expect(item.to.startsWith("/projects") || home, `${role} → ${item.to}`).toBe(true);
      }
    }
  });

  test("роль вне матрицы прав не получает выдуманных разделов", () => {
    const items = bottomNavFor("worker", PROJECT);
    expect(items.map((item) => item.key)).toEqual(["projects"]);
  });
});

describe("действия шторки «+»", () => {
  test("у директора действий нет: у роли нет прав на запись", () => {
    expect(plusActionsFor("director", PROJECT)).toEqual([]);
    for (const section of ["documents", "materials", "procurement", "field-reports"] as const) {
      expect(can("director", section, "write")).toBe(false);
    }
  });

  test("каждое действие роли опирается на её право на запись", () => {
    const need: Record<string, Parameters<typeof can>[1]> = {
      report: "field-reports",
      document: "documents",
      request: "procurement",
      supplier: "suppliers",
      acceptance: "deliveries",
      material: "catalogs",
      import: "catalogs",
      project: "projects",
      employee: "access",
    };
    for (const role of MATRIX_ROLES) {
      for (const action of plusActionsFor(role, PROJECT)) {
        const section = need[action.key];
        expect(section, `нет раздела для действия ${action.key}`).toBeTruthy();
        expect(can(role, section!, "write"), `${role} → ${action.key}`).toBe(true);
      }
    }
  });

  test("у каждого действия есть пояснение: человек знает, что будет, до нажатия", () => {
    for (const role of MATRIX_ROLES) {
      for (const action of plusActionsFor(role, PROJECT)) {
        expect(action.hint.length, `${role} → ${action.key}`).toBeGreaterThan(10);
      }
    }
  });

  test("голоса и бота в шторке нет: их нет в продукте", () => {
    for (const role of MATRIX_ROLES) {
      const labels = plusActionsFor(role, PROJECT).map((action) => action.label.toLowerCase());
      for (const label of labels) {
        expect(label).not.toContain("голос");
        expect(label).not.toContain("telegram");
      }
    }
  });
});
