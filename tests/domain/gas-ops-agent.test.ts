import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { assistantContext, ASSISTANT_SYSTEM } from "@/domain/gas-ops/assistant-context";
import type { GasData } from "@/domain/gas-ops/view";
import { allowRequest, parseAssistantBody } from "@/server/gas-assistant";

/**
 * Агент «Газ v5» (ADR-066): контекст для модели в объёме роли и защита серверного адреса.
 * Бригадир денег не видит на экранах, значит и модель не получает сумм для его вопроса.
 */
const seed = (): GasData => ({ ...buildSeed(), actorId: "u-manager" });

describe("контекст агента", () => {
  test("менеджер: бригады, объекты со сметами, очередь и суммы с источником", () => {
    const data = seed();
    const text = assistantContext({ role: "manager", data, reasons: [] });
    expect(text).toContain("## Бригады");
    expect(text).toContain(data.brigades[0]!.name);
    expect(text).toContain("## Объекты и сметы");
    expect(text).toContain(data.objects[0]!.code);
    expect(text).toMatch(/начислено [\d\s\u00a0]+ ₽/);
    expect(text).toContain("Суммы видны");
  });

  test("бригадир: ни рублей, ни ставок, только часы", () => {
    const text = assistantContext({ role: "foreman", data: seed(), reasons: [] });
    expect(text).not.toContain("₽");
    expect(text).toContain("Суммы скрыты");
    expect(text).toContain("часы");
  });

  test("длинные списки обрезаются с пометкой, объём держится в пределе сервера", () => {
    const text = assistantContext({ role: "manager", data: seed(), reasons: [] });
    expect(text.length).toBeLessThan(40_000);
    expect(text).toMatch(/… и ещё \d+/);
  });

  test("инструкция требует источник и запрещает менять данные", () => {
    expect(ASSISTANT_SYSTEM).toContain("источником");
    expect(ASSISTANT_SYSTEM).toContain("не меняешь данные");
  });
});

describe("сервер агента", () => {
  test("вопрос обязателен и не длиннее 1 000 знаков, история до 10 реплик", () => {
    expect(parseAssistantBody({ question: " " }).ok).toBe(false);
    expect(parseAssistantBody({ question: "х".repeat(1001), context: "" }).ok).toBe(false);
    const history = Array.from({ length: 15 }, (_, i) => ({ question: `q${i}`, answer: "a" }));
    const parsed = parseAssistantBody({ question: "Сколько часов?", context: "данные", history });
    expect(parsed.ok && parsed.history.length).toBe(10);
    expect(parsed.ok && parsed.history[0]!.question).toBe("q5");
  });

  test("не больше 20 вопросов в минуту с адреса", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allowRequest("1.2.3.4", now + i)).toBe(true);
    expect(allowRequest("1.2.3.4", now + 30)).toBe(false);
    expect(allowRequest("5.6.7.8", now + 30)).toBe(true);
    expect(allowRequest("1.2.3.4", now + 61_000)).toBe(true);
  });
});
