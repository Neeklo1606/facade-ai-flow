import { describe, expect, test } from "bun:test";
import { keepEarlyScroll } from "@/lib/scroll-restore";

describe("keepEarlyScroll", () => {
  test("первая отрисовка с прокрученным окном не сбрасывает прокрутку", () => {
    const allow = keepEarlyScroll(() => true);
    expect(allow()).toBe(false);
  });

  test("первая отрисовка с окном в начале восстанавливает как обычно", () => {
    const allow = keepEarlyScroll(() => false);
    expect(allow()).toBe(true);
  });

  test("следующие переходы всегда восстанавливают прокрутку", () => {
    let scrolled = true;
    const allow = keepEarlyScroll(() => scrolled);
    allow();
    expect(allow()).toBe(true);
    scrolled = false;
    expect(allow()).toBe(true);
  });

  test("без окна (сервер) восстановление разрешено", () => {
    expect(keepEarlyScroll()()).toBe(true);
  });
});
