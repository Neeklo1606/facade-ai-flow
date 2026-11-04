import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Состояние тура (F1): переход на экран шага только по нажатию человека. Номер нажатия
 * `request` растёт от кнопок и не хранится во вкладке: после перезагрузки тур не уводит
 */

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

const session = memoryStorage();
type TourModule = typeof import("@/lib/gas-ops/tour");
let tour: TourModule;

beforeAll(async () => {
  (globalThis as { window?: unknown }).window = {
    sessionStorage: session,
    localStorage: memoryStorage(),
  };
  tour = await import("@/lib/gas-ops/tour");
});

// Прогон общий для всех файлов: остальные тесты идут без окна
afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("тур и нажатия человека", () => {
  test("автостарт первого входа не просит перехода, кнопка просит", () => {
    tour.startTour("manager", { go: false });
    const auto = tour.getTourState();
    expect(auto.tourId).toBe("manager");
    tour.closeTour();
    const before = tour.getTourState().request;
    tour.startTour("manager");
    expect(tour.getTourState().request).toBe(before + 1);
  });

  test("«Далее» и «Продолжить тур» — новые нажатия, шаг сохраняется", () => {
    tour.startTour("manager");
    const start = tour.getTourState().request;
    tour.goToStep(1);
    expect(tour.getTourState()).toMatchObject({ index: 1, request: start + 1 });
    tour.resumeTour();
    expect(tour.getTourState()).toMatchObject({ index: 1, request: start + 2 });
  });

  test("номер нажатия не пишется во вкладку", () => {
    tour.startTour("director");
    tour.goToStep(2);
    const stored = JSON.parse(session.getItem("gaika-tour") ?? "{}") as Record<string, unknown>;
    expect(stored).toEqual({ tourId: "director", index: 2 });
  });

  test("закрытый тур отмечен пройденным, продолжать нечего", () => {
    tour.closeTour();
    expect(tour.tourSeen("director")).toBe(true);
    const before = tour.getTourState();
    tour.resumeTour();
    expect(tour.getTourState()).toBe(before);
  });
});
