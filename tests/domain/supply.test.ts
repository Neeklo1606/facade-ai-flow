import { describe, expect, test } from "bun:test";
import { can, MATRIX_ROLES } from "@/domain/access";
import { LEGACY_KEY } from "@/lib/legacy-modules";
import {
  activeNavKey,
  allNavItems,
  bottomNavFor,
  navItemsFor,
  sectionHref,
  visibleFor,
} from "@/lib/navigation";
import { badgeCriticalTotal, badgeTotal } from "@/lib/badges";
import {
  isSupplyPath,
  supplyBadgesFor,
  supplyDoorFor,
  supplyTabsFor,
  SUPPLY_TABS,
} from "@/lib/supply";

/**
 * Раздел «Снабжение» (ADR-031). Проверяется то, из-за чего раздел собирался: контур был
 * разложен на четыре пункта меню, а в панели снабжения стояла одна позиция «Закупки»,
 * которая вела только в запросы. И то, что слиянием легко сломать: один пункт меню не
 * подменяет четыре разных права матрицы ADR-012.
 */

const PROJECT = "p-korona";

/** Параметр вкладки из адреса, собранного `sectionHref`: у поставщиков это `?view=suppliers` */
const viewOf = (search: unknown) => String((search as Record<string, unknown>)["view"] ?? "");

/**
 * Флаг `legacy_modules` (ADR-034, п. 4) читается из `sessionStorage`, которого в прогоне
 * домена нет: по умолчанию он выключен — так продукт видит зритель показа. Эти проверки
 * включают его: так продукт видит заказчик, который снабжением уже пользуется, и так идут
 * все сквозные прогоны.
 */
function withLegacy<T>(body: () => T): T {
  const holder = globalThis as { window?: unknown };
  const had = "window" in holder;
  const before = holder.window;
  holder.window = {
    sessionStorage: { getItem: (key: string) => (key === LEGACY_KEY ? "1" : null) },
  };
  try {
    return body();
  } finally {
    if (had) holder.window = before;
    else delete holder.window;
  }
}

describe("вкладки раздела", () => {
  test("вкладка показывается только роли, которой открыт её раздел прав", () => {
    for (const role of MATRIX_ROLES) {
      for (const tab of supplyTabsFor(role)) {
        expect(can(role, tab.access), `${role} → ${tab.id}`).toBe(true);
      }
      // И наоборот: доступная вкладка не теряется
      for (const tab of SUPPLY_TABS) {
        expect(
          supplyTabsFor(role).some((item) => item.id === tab.id),
          `${role} → ${tab.id}`,
        ).toBe(can(role, tab.access));
      }
    }
  });

  test("состав вкладок по матрице: у ПТО одна, у прораба две", () => {
    const ids = (role: Parameters<typeof supplyTabsFor>[0]) =>
      supplyTabsFor(role).map((tab) => tab.id);
    expect(ids("supply")).toEqual(["spec", "requests", "suppliers", "deliveries"]);
    expect(ids("manager")).toEqual(["spec", "requests", "suppliers", "deliveries"]);
    expect(ids("director")).toEqual(["spec", "requests", "suppliers", "deliveries"]);
    // Полосы у ПТО не будет: выбор из одной вкладки обещает выбор, которого нет
    expect(ids("pto")).toEqual(["requests"]);
    expect(ids("foreman")).toEqual(["spec", "deliveries"]);
  });

  test("порядок вкладок — порядок контура, он не зависит от роли", () => {
    const order = SUPPLY_TABS.map((tab) => tab.id);
    expect(order).toEqual(["spec", "requests", "suppliers", "deliveries"]);
    for (const role of MATRIX_ROLES) {
      const ids = supplyTabsFor(role).map((tab) => tab.id);
      expect(
        [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
        role,
      ).toEqual(ids);
    }
  });

  test("дверь раздела доступна роли и не переносит начало дня (ADR-031, п. 3)", () => {
    for (const role of MATRIX_ROLES) {
      const door = supplyDoorFor(role)!;
      expect(door, role).toBeTruthy();
      expect(can(role, door.access), role).toBe(true);
    }
    expect(supplyDoorFor("supply")!.id).toBe("requests");
    expect(supplyDoorFor("manager")!.id).toBe("requests");
    expect(supplyDoorFor("director")!.id).toBe("requests");
    expect(supplyDoorFor("pto")!.id).toBe("requests");
    // Прораб действует только в поставках: спецификацию он читает
    expect(supplyDoorFor("foreman")!.id).toBe("deliveries");
    // Роль без прав на раздел двери не получает
    expect(supplyDoorFor("worker")).toBeNull();
  });

  test("счётчик пункта складывается только из вкладок, доступных роли", () => {
    for (const role of MATRIX_ROLES) {
      const allowed = new Set(supplyTabsFor(role).flatMap((tab) => (tab.badge ? [tab.badge] : [])));
      for (const badge of supplyBadgesFor(role)) {
        expect(allowed.has(badge), `${role} → ${badge}`).toBe(true);
      }
    }
    // У ПТО открыты только запросы: непроверенная спецификация в его число не попадает
    expect(supplyBadgesFor("pto")).toEqual(["overdueRequests"]);
    expect(supplyBadgesFor("foreman")).toEqual(["unverifiedSpec", "deliveriesToAccept"]);
    expect(supplyBadgesFor("worker")).toEqual([]);
  });
});

describe("счётчик раздела", () => {
  const counts = {
    unverifiedSpec: 3,
    overdueRequests: 2,
    openChanges: 9,
    deliveriesToAccept: 4,
  } as const;

  test("на пункте — сумма счётчиков доступных вкладок", () => {
    expect(badgeTotal(supplyBadgesFor("supply"), counts)).toBe(9);
    // У ПТО открыты только запросы
    expect(badgeTotal(supplyBadgesFor("pto"), counts)).toBe(2);
    // У прораба спецификация и поставки, запросов нет
    expect(badgeTotal(supplyBadgesFor("foreman"), counts)).toBe(7);
  });

  test("красное число свёрнутой группы считает только просроченное", () => {
    expect(badgeCriticalTotal(supplyBadgesFor("supply"), counts)).toBe(2);
    // Непроверенная спецификация и приёмки критическими не считаются
    expect(badgeCriticalTotal(supplyBadgesFor("foreman"), counts)).toBe(0);
  });
});

describe("раздел в меню", () => {
  test("четырёх отдельных пунктов больше нет — вместо них один", () => {
    for (const key of ["materials", "procurement", "deliveries", "suppliers"]) {
      expect(
        allNavItems.some((item) => item.key === key),
        key,
      ).toBe(false);
    }
    const supply = allNavItems.find((item) => item.key === "supply")!;
    expect(supply).toBeTruthy();
    expect(supply.label).toBe("Снабжение");
  });

  test("без флага раздел уходит из меню вместе со своими модулями (ADR-034, п. 4)", () => {
    const supply = allNavItems.find((item) => item.key === "supply")!;
    for (const role of MATRIX_ROLES) {
      // Иначе один пункт остался бы вместо четырёх убранных и вёл бы на перенаправление
      expect(visibleFor(supply, role), role).toBe(false);
    }
  });

  test("с флагом пункт виден и ведёт на дверь роли", () => {
    withLegacy(() => {
      for (const role of MATRIX_ROLES) {
        const item = navItemsFor(role).find((nav) => nav.key === "supply")!;
        expect(item, role).toBeTruthy();
        expect(item.section, role).toBe(supplyDoorFor(role)!.section);
      }
    });
  });

  test("в панели раздела нет: он берётся из шторки «Ещё» (ADR-034, п. 1)", () => {
    withLegacy(() => {
      for (const role of MATRIX_ROLES) {
        const inPanel = new Set(bottomNavFor(role, PROJECT).map((item) => item.key));
        expect(inPanel.has("supply"), role).toBe(false);
        // А значит он не потерян: шторка показывает разделы, которых в панели нет
        const rest = navItemsFor(role).filter((item) => !inPanel.has(item.key));
        expect(
          rest.some((item) => item.key === "supply"),
          role,
        ).toBe(true);
      }
    });
  });
});

describe("подсветка по адресу", () => {
  test("все четыре адреса раздела подсвечивают один пункт", () => {
    for (const tab of SUPPLY_TABS) {
      const href = sectionHref(PROJECT, tab.section);
      expect(activeNavKey(href.to, viewOf(href.search), null), tab.id).toBe("supply");
    }
  });

  test("сравнение предложений — экран запроса, а не вкладка", () => {
    const rfq = `/projects/${PROJECT}/procurement/r-1`;
    // Пункт меню на нём подсвечен: человек внутри раздела
    expect(activeNavKey(rfq, "", null)).toBe("supply");
    expect(isSupplyPath(rfq)).toBe(true);
    // Но полосы вкладок там нет: вкладка не выбрана
    expect(SUPPLY_TABS.some((tab) => sectionHref(PROJECT, tab.section).to === rfq)).toBe(false);
  });

  test("просьба выбрать объект для раздела снабжения подсвечивает тот же пункт", () => {
    for (const tab of SUPPLY_TABS) {
      expect(activeNavKey("/projects", "", tab.section), tab.id).toBe("supply");
    }
    expect(activeNavKey("/projects", "", "documents")).toBe("documents");
  });
});
