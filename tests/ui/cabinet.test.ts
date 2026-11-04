import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CABINET_PRODUCT, cabinetRedirect, cabinetTitle, showTestMode } from "@/lib/cabinet";

/** Режим кабинета заказчика (ADR-062, F6): пути, заголовок вкладки, имя заказчика не в коде */

describe("пути кабинета", () => {
  test("вне /gas — в /gas; /gas, вложенные и служебные — как есть", () => {
    for (const path of ["/", "/demo", "/projects", "/case/gas", "/office", "/gasoline"])
      expect(cabinetRedirect(path, true)).toBe("/gas");
    for (const path of [
      "/gas",
      "/gas/",
      "/gas/entries",
      "/api/gas/export",
      "/favicon.ico",
      "/_build/x",
    ])
      expect(cabinetRedirect(path, true)).toBeNull();
  });

  test("без флага ничего не перехватывается", () => {
    expect(cabinetRedirect("/", false)).toBeNull();
  });
});

describe("заголовок вкладки", () => {
  test("«Учёт времени · <заказчик>» из конфигурации, без названия — только продукт", () => {
    expect(cabinetTitle("ООО «Пример»")).toBe("Учёт времени · ООО «Пример»");
    expect(cabinetTitle("")).toBe(CABINET_PRODUCT);
  });

  test("название заказчика в модуле кабинета не записано", () => {
    const source = readFileSync("src/lib/cabinet.ts", "utf8");
    expect(source).not.toMatch(/СЛАВЯНСК/i);
    expect(source).toContain("VITE_CABINET_CLIENT");
  });
});

describe("плашка «Тестовый режим» (решение владельца 3)", () => {
  test("данные во вкладке и смотрит заказчик: личная ссылка или кабинет", () => {
    expect(showTestMode({ dataSource: "demo", contour: "client", cabinet: false })).toBe(true);
    expect(showTestMode({ dataSource: "demo", contour: "public", cabinet: true })).toBe(true);
  });
  test("публичный показ и сервер без плашки", () => {
    expect(showTestMode({ dataSource: "demo", contour: "public", cabinet: false })).toBe(false);
    expect(showTestMode({ dataSource: "server", contour: "client", cabinet: true })).toBe(false);
  });
});
