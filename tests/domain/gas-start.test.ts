import { describe, expect, test } from "bun:test";
import { fmtHours, fmtRate } from "@/domain/gas-ops/calc";
import { calcExample, showExample } from "@/lib/gas-ops/start-examples";
import { GAS_QUESTIONS, questionHref, questionsText } from "@/lib/gas-ops/questions";
import { grantResponse } from "@/lib/access";

describe("примеры стартового экрана и инструкции (ADR-044, F2)", () => {
  test("395 мин = 6,58 ч; 44 847 ₽ / (395 / 60) = 6 812 ₽/ч; от 6,58 ч выходит 6 816", () => {
    const c = calcExample();
    expect(fmtHours(c.hours)).toBe("6,58 ч");
    expect(c.rate).toBe(6812);
    expect(fmtRate(c.rate).replace(/\s/g, " ")).toBe("6 812 ₽/ч");
    expect(c.naiveRate).toBe(6816);
    expect(c.minutesBehindShown).toBe(394.8);
    expect(c.shiftMinutes).toBe(190);
  });

  test("запись показа: 12:00–14:30 = 150 мин, 2,50 ч, 14 700 ₽, 5 880 ₽/ч", () => {
    const s = showExample();
    expect(s.minutes).toBe(150);
    expect(fmtHours(s.hours)).toBe("2,50 ч");
    expect(s.rate).toBe(5880);
  });
});

describe("вопросы к согласованию (F7)", () => {
  test("десять вопросов, номера 1–10 по порядку, все вопросы отчёта на месте", () => {
    expect(GAS_QUESTIONS.map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...GAS_QUESTIONS.map((q) => q.reportNo)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  test("ссылка на вопрос ведёт на якорь", () => {
    expect(questionHref(3)).toBe("/gas/questions#q-3");
  });

  test("текст для мессенджера несёт ответ и статус", () => {
    const text = questionsText({ 1: { answer: "По дням поровну", status: "answered" } });
    expect(text).toContain("1. Как делить стоимость");
    expect(text).toContain("Ответ: По дням поровну");
    expect(text).toContain("Статус: Ответ получен");
    expect(text).toContain("Статус: Открыт");
  });
});

describe("ссылка заказчика /gas?k=КЛЮЧ (F2, п. 2)", () => {
  test("шлюз ставит куку и оставляет путь /gas без ключа", () => {
    const response = grantResponse(new URL("https://demo.example/gas?k=secret"), "secret");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/gas");
    expect(response.headers.get("set-cookie")).toContain("fieldops_demo=secret");
  });

  test("вложенный экран и остальные параметры сохраняются, ?key= тоже убирается", () => {
    const response = grantResponse(
      new URL("https://demo.example/gas/guide?key=secret&tab=calc"),
      "secret",
    );
    expect(response.headers.get("location")).toBe("/gas/guide?tab=calc");
  });
});
