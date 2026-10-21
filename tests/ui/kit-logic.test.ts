import { describe, expect, test } from "bun:test";
import {
  TOAST_INFO_MS,
  TOAST_UNDO_MS,
  createSheetHistory,
  createToastQueue,
  fadeEdges,
  highlightParts,
  monthGrid,
  parseTime,
  revealScrollLeft,
  splitChips,
  timeSlots,
  type HistoryPort,
} from "@/lib/ui/kit-logic";

/** Логика компонентов ADR-045 «Финальный интерфейс», раздел 4 */

describe("ChipRow: не больше двух меток и «+N»", () => {
  test("две и меньше показываются целиком", () => {
    expect(splitChips(["a"])).toEqual({ shown: ["a"], rest: 0 });
    expect(splitChips(["a", "b"])).toEqual({ shown: ["a", "b"], rest: 0 });
  });
  test("пять меток: две видны, «+3»", () => {
    expect(splitChips(["a", "b", "c", "d", "e"])).toEqual({ shown: ["a", "b"], rest: 3 });
  });
  test("порядок сохраняется: блокирующие первыми", () => {
    expect(splitChips(["Пересечение", "Нет суммы", "Вчера"]).shown).toEqual([
      "Пересечение",
      "Нет суммы",
    ]);
  });
  test("пустой список", () => {
    expect(splitChips([])).toEqual({ shown: [], rest: 0 });
  });
});

describe("ScrollTabs: активная докручивается в видимую часть", () => {
  const view = { scrollLeft: 0, width: 300, scrollWidth: 800 };
  test("видимая активная не двигает ряд", () => {
    expect(revealScrollLeft(view, { left: 40, width: 100 })).toBeNull();
  });
  test("активная справа за краем: ряд едет так, чтобы она встала до затухания", () => {
    expect(revealScrollLeft(view, { left: 400, width: 120 })).toBe(400 + 120 - 300 + 16);
  });
  test("активная слева за краем", () => {
    expect(revealScrollLeft({ ...view, scrollLeft: 300 }, { left: 200, width: 80 })).toBe(184);
  });
  test("не дальше конца ряда", () => {
    expect(revealScrollLeft(view, { left: 700, width: 100 })).toBe(500);
  });
  test("затухание краёв", () => {
    expect(fadeEdges(view)).toEqual({ start: false, end: true });
    expect(fadeEdges({ ...view, scrollLeft: 500 })).toEqual({ start: true, end: false });
  });
});

describe("Sheet: системный «назад» закрывает шторку", () => {
  function fakeHistory() {
    const stack: unknown[] = [null];
    const port: HistoryPort = {
      push: (state) => void stack.push(state),
      back: () => void stack.pop(),
      state: () => stack[stack.length - 1],
    };
    return { stack, port };
  }

  test("открытие кладёт запись, «назад» закрывает без второго шага истории", () => {
    const { stack, port } = fakeHistory();
    let closed = 0;
    const sheet = createSheetHistory("entry", port, () => (closed += 1));
    sheet.open();
    expect(stack).toHaveLength(2);
    stack.pop();
    sheet.pop(port.state());
    expect(closed).toBe(1);
    expect(sheet.isOpen).toBe(false);
    expect(stack).toHaveLength(1);
  });

  test("закрытие кнопкой убирает свою запись из истории", () => {
    const { stack, port } = fakeHistory();
    let closed = 0;
    const sheet = createSheetHistory("entry", port, () => (closed += 1));
    sheet.open();
    sheet.close();
    expect(closed).toBe(1);
    expect(stack).toHaveLength(1);
    // Повторное закрытие ничего не делает
    sheet.close();
    expect(closed).toBe(1);
  });

  test("popstate со своей записью наверху не закрывает", () => {
    const { port } = fakeHistory();
    let closed = 0;
    const sheet = createSheetHistory("entry", port, () => (closed += 1));
    sheet.open();
    sheet.pop({ sheet: "entry" });
    expect(closed).toBe(0);
  });
});

describe("Toast: один за раз, новый заменяет старый", () => {
  function fakeToasts() {
    const visible = new Map<string, { text: string; duration: number; undo?: () => void }>();
    return {
      visible,
      port: {
        show: (id: string, text: string, o: { duration: number; undo?: () => void }) =>
          void visible.set(id, { text, ...o }),
        dismiss: (id: string) => void visible.delete(id),
      },
    };
  }

  test("второй тост убирает первый", () => {
    const { visible, port } = fakeToasts();
    const toasts = createToastQueue(port);
    toasts.notify("Подтверждено");
    toasts.notify("Отклонено");
    expect([...visible.values()].map((t) => t.text)).toEqual(["Отклонено"]);
  });

  test("с отменой 6 секунд, без отмены 4", () => {
    const { visible, port } = fakeToasts();
    const toasts = createToastQueue(port);
    const a = toasts.notify("Подтверждено", { undo: () => undefined });
    expect(visible.get(a)?.duration).toBe(TOAST_UNDO_MS);
    const b = toasts.notify("Вы смотрите как руководитель");
    expect(visible.get(b)?.duration).toBe(TOAST_INFO_MS);
  });

  test("отмена срабатывает один раз и закрывает тост", () => {
    const { visible, port } = fakeToasts();
    const toasts = createToastQueue(port);
    let undone = 0;
    const id = toasts.notify("Подтверждено 4 записи", { undo: () => (undone += 1) });
    const undo = visible.get(id)!.undo!;
    undo();
    undo();
    expect(undone).toBe(1);
    expect(visible.size).toBe(0);
    expect(toasts.current).toBeNull();
  });
});

describe("Время и календарь", () => {
  test("маска ЧЧ:ММ принимает 8:20, 8.20, 0820", () => {
    expect(parseTime("8:20")).toBe("08:20");
    expect(parseTime("8.20")).toBe("08:20");
    expect(parseTime("0820")).toBe("08:20");
    expect(parseTime("820")).toBe("08:20");
    expect(parseTime("8")).toBe("08:00");
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("8:7")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
  test("кнопки времени с шагом 30", () => {
    expect(timeSlots("07:00", "09:00")).toEqual(["07:00", "07:30", "08:00", "08:30", "09:00"]);
  });
  test("октябрь 2026 начинается в четверг", () => {
    const weeks = monthGrid(2026, 9);
    expect(weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  test("подсветка совпадения без учёта регистра", () => {
    expect(highlightParts("ул. Демо, 200 - котел", "демо")).toEqual([
      { text: "ул. ", hit: false },
      { text: "Демо", hit: true },
      { text: ", 200 - котел", hit: false },
    ]);
  });
});
