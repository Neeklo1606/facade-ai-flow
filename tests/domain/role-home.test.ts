import { describe, expect, test } from "bun:test";
import { can, MATRIX_ROLES } from "@/domain/access";
import { allNavItems, homeRouteFor, navItemsFor, visibleFor } from "@/lib/navigation";

/**
 * Рабочий экран роли и видимость новых разделов (ADR-028). Проверяется то, ради чего задача
 * делалась: корень адреса ведёт не в общий дашборд, а туда, где у человека работа, и ни один
 * пункт меню не ведёт в раздел, которого роль не видит.
 */

describe("корень адреса ведёт на рабочий экран роли", () => {
  test("прораб начинает со «Сегодня», ПТО — с «Проверки»", () => {
    expect(homeRouteFor("foreman")).toBe("/today");
    expect(homeRouteFor("pto")).toBe("/check");
  });

  test("руководитель, снабжение и директор начинают со «Внимания»", () => {
    expect(homeRouteFor("manager")).toBe("/attention");
    expect(homeRouteFor("supply")).toBe("/attention");
    expect(homeRouteFor("director")).toBe("/attention");
  });

  test("роль без закупок и документов открывает реестр, а не пустой экран", () => {
    // У рабочего в матрице есть только объекты: «Обзор» было бы пустым
    expect(homeRouteFor("worker")).toBe("/projects");
  });

  test("у каждой роли матрицы рабочий экран ей виден", () => {
    for (const role of MATRIX_ROLES) {
      const home = homeRouteFor(role);
      const item = allNavItems.find((navItem) => navItem.to === home);
      // Реестр объектов пунктом «to» не описан: он ведётся разделом
      if (!item) {
        expect(home, role).toBe("/projects");
        continue;
      }
      expect(visibleFor(item, role), `${role} → ${home}`).toBe(true);
    }
  });
});

describe("видимость новых разделов", () => {
  test("«Обзор» видно тем, у кого открыты закупки или документы", () => {
    const attention = allNavItems.find((item) => item.key === "attention")!;
    for (const role of MATRIX_ROLES) {
      const expected = can(role, "procurement") || can(role, "documents");
      expect(visibleFor(attention, role), role).toBe(expected);
    }
  });

  test("прорабу «Обзор» не показываем: его источники ему закрыты", () => {
    const attention = allNavItems.find((item) => item.key === "attention")!;
    expect(visibleFor(attention, "foreman")).toBe(false);
  });

  test("«Проверку» ведут ПТО, руководитель и директор, но не прораб", () => {
    const check = allNavItems.find((item) => item.key === "check")!;
    expect(visibleFor(check, "pto")).toBe(true);
    expect(visibleFor(check, "manager")).toBe(true);
    expect(visibleFor(check, "director")).toBe(true);
    expect(visibleFor(check, "foreman")).toBe(false);
    // Снабжение отчёты с площадки не ведёт вовсе
    expect(visibleFor(check, "supply")).toBe(false);
  });

  test("ни один пункт меню роли не ведёт в закрытый ей раздел", () => {
    for (const role of MATRIX_ROLES) {
      for (const item of navItemsFor(role)) {
        if (item.access) expect(can(role, item.access), `${role} → ${item.key}`).toBe(true);
        if (item.anyOf)
          expect(
            item.anyOf.some((section) => can(role, section)),
            `${role} → ${item.key}`,
          ).toBe(true);
      }
    }
  });

  test("дашборда как пункта меню больше нет: его место занято «Обзором»", () => {
    expect(allNavItems.some((item) => item.key === "dashboard")).toBe(false);
  });
});
