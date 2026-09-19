import { describe, expect, test } from "bun:test";
import {
  MATRIX_ROLES,
  SECTIONS,
  can,
  canAny,
  canOpenProject,
  grantOf,
  ownOnly,
  projectOfPath,
  rolesWith,
  sectionOfPath,
  type AccessSession,
  type Section,
} from "@/domain/access";
import type { EmployeeRole } from "@/contracts";

/**
 * Матрица прав — таблица ADR-012, п. 1, переписанная сюда руками. Ожидание — постановка Q3
 * и ADR, а не код: расхождение ячейки с таблицей ADR должно ронять тест.
 */
type Cell = "—" | "R" | "W" | "R*" | "W*";
const TABLE: Record<Section, [Cell, Cell, Cell, Cell, Cell]> = {
  //                 руководитель, снабжение, ПТО, прораб, директор
  dashboard: ["R", "—", "—", "—", "R"],
  projects: ["W", "R", "R", "R*", "R"],
  documents: ["W", "R", "W", "—", "R"],
  materials: ["W", "W", "—", "R*", "R"],
  procurement: ["W", "W", "R", "—", "R"],
  suppliers: ["W", "W", "—", "—", "R"],
  deliveries: ["W", "W", "—", "—", "R"],
  "field-reports": ["W", "—", "—", "W*", "R"],
  timeline: ["R", "—", "R", "—", "R"],
  agent: ["R", "—", "—", "—", "R"],
  analytics: ["R", "—", "—", "—", "R"],
  export: ["R", "—", "—", "—", "R"],
  access: ["R", "—", "—", "—", "R"],
};
const ROLES: EmployeeRole[] = ["manager", "supply", "pto", "foreman", "director"];

describe("матрица прав совпадает с таблицей ADR-012", () => {
  test("столбцы матрицы — пять ролей экрана выбора в порядке таблицы", () => {
    expect(MATRIX_ROLES).toEqual(ROLES);
  });

  test("в матрице ровно разделы таблицы", () => {
    expect([...SECTIONS].sort()).toEqual(Object.keys(TABLE).sort() as Section[]);
  });

  for (const section of SECTIONS) {
    for (const [index, role] of ROLES.entries()) {
      const cell = TABLE[section][index]!;
      test(`${section} × ${role}: ${cell}`, () => {
        const grant = grantOf(role, section);
        const level = cell === "—" ? "none" : cell.startsWith("W") ? "write" : "read";
        expect(grant.level).toBe(level);
        expect(grant.own).toBe(cell.endsWith("*"));
      });
    }
  }

  test("роли без персон: финансы и рабочий только читают объекты", () => {
    for (const role of ["finance", "worker"] as const) {
      expect(SECTIONS.filter((section) => can(role, section))).toEqual(["projects"]);
      expect(SECTIONS.some((section) => can(role, section, "write"))).toBe(false);
    }
  });
});

describe("can, canAny, ownOnly, rolesWith", () => {
  test("запись включает чтение, чтение не даёт записи", () => {
    expect(can("pto", "documents", "read")).toBe(true);
    expect(can("pto", "procurement", "read")).toBe(true);
    expect(can("pto", "procurement", "write")).toBe(false);
  });

  test("canAny: хватает одного раздела; пустой список — нет доступа", () => {
    expect(canAny("foreman", ["documents", "materials"])).toBe(true);
    expect(canAny("foreman", ["documents", "procurement"])).toBe(false);
    expect(canAny("manager", [])).toBe(false);
  });

  test("ownOnly: «свои» только если во всех подходящих разделах область своя", () => {
    expect(ownOnly("foreman", ["materials"])).toBe(true);
    // Документы прорабу закрыты, из подходящих остаются материалы — свои
    expect(ownOnly("foreman", ["documents", "materials"])).toBe(true);
    expect(ownOnly("manager", ["materials"])).toBe(false);
    // Нет ни одного подходящего раздела — область не действует
    expect(ownOnly("foreman", ["procurement"])).toBe(false);
  });

  test("rolesWith: у кого есть доступ, в порядке столбцов", () => {
    expect(rolesWith("timeline")).toEqual(["manager", "pto", "director"]);
    expect(rolesWith("field-reports", "write")).toEqual(["manager", "foreman"]);
    expect(rolesWith("access", "write")).toEqual([]);
  });
});

describe("canOpenProject", () => {
  const foreman: AccessSession = { actorId: "e-gareev", role: "foreman", projectIds: ["p-korona"] };
  const supply: AccessSession = { actorId: "e-dorohov", role: "supply", projectIds: [] };

  test("прораб: свой объект открыт, чужой закрыт", () => {
    expect(canOpenProject(foreman, ["field-reports"], "p-korona")).toBe(true);
    expect(canOpenProject(foreman, ["field-reports"], "p-meridian")).toBe(false);
  });

  test("прораб без записи в разделе объекта не открывает и свой", () => {
    expect(canOpenProject(foreman, ["materials"], "p-korona", "write")).toBe(false);
  });

  test("снабжение не ограничено своими объектами", () => {
    expect(canOpenProject(supply, ["procurement"], "p-meridian", "write")).toBe(true);
  });

  test("раздел закрыт роли — объект не спасает", () => {
    expect(canOpenProject(supply, ["timeline"], "p-korona")).toBe(false);
  });
});

describe("sectionOfPath и projectOfPath", () => {
  const cases: [string, string | undefined, Section | null][] = [
    ["/", undefined, "dashboard"],
    ["/agent", undefined, "agent"],
    ["/analytics/", undefined, "analytics"],
    ["/access", undefined, "access"],
    ["/projects", undefined, "projects"],
    ["/projects/p-korona", undefined, "projects"],
    ["/projects/p-korona/documents/pd-1", undefined, "documents"],
    ["/projects/p-korona/materials", undefined, "materials"],
    ["/projects/p-korona/procurement", undefined, "procurement"],
    ["/projects/p-korona/procurement", "suppliers", "suppliers"],
    ["/projects/p-korona/procurement/sr-1", undefined, "procurement"],
    ["/projects/p-korona/deliveries", undefined, "deliveries"],
    ["/projects/p-korona/field-reports", undefined, "field-reports"],
    ["/projects/p-korona/timeline", undefined, "timeline"],
    // Неизвестный подраздел объекта — часть карточки объекта
    ["/projects/p-korona/unknown", undefined, "projects"],
    // Заглушки и служебные экраны вне матрицы
    ["/demo-stats", undefined, null],
    ["/tasks", undefined, null],
  ];
  for (const [path, view, section] of cases) {
    test(`${path}${view ? `?view=${view}` : ""} → ${section ?? "вне матрицы"}`, () => {
      expect(sectionOfPath(path, view)).toBe(section);
    });
  }

  test("объект из адреса", () => {
    expect(projectOfPath("/projects/p-korona/materials")).toBe("p-korona");
    expect(projectOfPath("/projects")).toBeNull();
    expect(projectOfPath("/")).toBeNull();
  });
});
