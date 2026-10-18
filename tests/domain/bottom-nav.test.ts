import { describe, expect, test } from "bun:test";
import { can, MATRIX_ROLES } from "@/domain/access";
import { allNavItems, bottomNavFor, homeRouteFor, plusActionsFor } from "@/lib/navigation";

/**
 * Нижняя панель (ADR-026, карта ГАЙКИ — ADR-034, п. 1). Проверяется то, ради чего карта
 * менялась: набор позиций один для всех ролей, меняется только первая — рабочий экран роли,
 * и подпись этой позиции равна названию экрана. Плюс две прежние границы: в панели нет
 * раздела, закрытого роли, и у директора нет кнопок создания — прав на запись у роли нет.
 */

const PROJECT = "p-korona";

describe("набор позиций по роли", () => {
  test("у каждой роли матрицы три позиции плюс кнопка записи и «Ещё»", () => {
    for (const role of MATRIX_ROLES) {
      const items = bottomNavFor(role, PROJECT);
      // У снабжения рабочий экран и есть «Входящие»: второй такой же двери в панели нет (ADR-041)
      expect(items.length, role).toBe(role === "supply" ? 2 : 3);
    }
  });

  test("в панели нет раздела, закрытого роли", () => {
    for (const role of MATRIX_ROLES) {
      for (const item of bottomNavFor(role, PROJECT)) {
        const nav = allNavItems.find((navItem) => navItem.key === item.key);
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

  test("набор один для всех ролей, меняется только первая позиция (ADR-034, п. 1)", () => {
    const keys = (role: Parameters<typeof bottomNavFor>[0]) =>
      bottomNavFor(role, PROJECT).map((item) => item.key);
    expect(keys("foreman")).toEqual(["today", "projects", "inbox"]);
    expect(keys("pto")).toEqual(["check", "projects", "inbox"]);
    expect(keys("supply")).toEqual(["inbox", "projects"]);
    expect(keys("manager")).toEqual(["attention", "projects", "inbox"]);
    expect(keys("director")).toEqual(["attention", "projects", "inbox"]);
    // Вторая и третья позиции у всех одни и те же: это и есть «набор панели один»
    for (const role of MATRIX_ROLES) {
      if (role === "supply") continue;
      expect(keys(role).slice(1), role).toEqual(["projects", "inbox"]);
    }
    // Первой стоит рабочий экран роли: панель начинается там же, где начинается день
    for (const role of MATRIX_ROLES) {
      const first = bottomNavFor(role, PROJECT)[0]!;
      expect(first.to, role).toBe(homeRouteFor(role));
    }
  });

  test("модулей прежнего контура в панели нет: они за флагом (ADR-034, п. 4)", () => {
    for (const role of MATRIX_ROLES) {
      for (const item of bottomNavFor(role, PROJECT)) {
        expect(item.to, `${role} → ${item.key}`).not.toMatch(
          /\/(materials|procurement|deliveries|documents)/u,
        );
      }
    }
  });

  test("без выбранного объекта позиции ведут в реестр или на экран роли", () => {
    for (const role of MATRIX_ROLES) {
      for (const item of bottomNavFor(role, null)) {
        const home = ["/attention", "/today", "/check", "/inbox"].includes(item.to);
        expect(item.to.startsWith("/projects") || home, `${role} → ${item.to}`).toBe(true);
      }
    }
  });

  test("роль вне матрицы прав не получает выдуманных разделов", () => {
    const items = bottomNavFor("worker", PROJECT);
    // Рабочий экран роли и есть реестр: вторая такая же позиция не рисуется
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

  test("номенклатура справочника остаётся: справочники — контур ГАЙКИ", () => {
    expect(plusActionsFor("supply", PROJECT).map((action) => action.key)).toContain("import");
  });

  test("действий модулей за флагом в шторке нет (ADR-034, п. 4)", () => {
    for (const role of MATRIX_ROLES) {
      const keys = plusActionsFor(role, PROJECT).map((action) => action.key);
      for (const key of ["document", "request", "supplier", "acceptance"]) {
        expect(keys, `${role} → ${key}`).not.toContain(key);
      }
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
