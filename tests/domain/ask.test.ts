import { describe, expect, test } from "bun:test";
import { buildPublicSeed } from "@/data/mock/public/seed";
import { ASK_SUGGESTIONS, askGaika, type AskIntent } from "@/domain/gas-ops/ask";
import { totalsOf } from "@/domain/gas-ops/calc";
import { dashboardMetrics, queue, type GasData } from "@/domain/gas-ops/view";

/**
 * «Спросить ГАЙКУ» (ADR-052): намерение по словам, числа из того же domain, что отчёт,
 * у каждой строки источник. Набор: публичный «Демо-подрядчик».
 */
const data: GasData = { ...buildPublicSeed(), actorId: "u-manager" };

describe("намерение вопроса", () => {
  const cases: [string, AskIntent][] = [
    ["Сколько заработали за неделю?", "week"],
    ["итог недели", "week"],
    ["Что ждёт проверки?", "review"],
    ["сколько записей ждут подтверждения", "review"],
    ["Где дубли и пересечения?", "issues"],
    ["есть записи без суммы?", "issues"],
    ["Какая бригада самая доходная?", "best"],
    ["у кого хуже всех доходность", "worst"],
    ["Покажи бригаду 1", "brigade"],
    ["Как прошла суббота?", "day"],
    ["что было 02.10", "day"],
    ["ОБ-200", "object"],
    ["как там Демо-Северная 200", "object"],
    ["расскажи анекдот", "unknown"],
    ["", "unknown"],
  ];
  for (const [question, intent] of cases) {
    test(`«${question}» → ${intent}`, () => {
      expect(askGaika(question, data).intent).toBe(intent);
    });
  }
});

describe("числа совпадают с отчётом", () => {
  test("итог недели равен итогу подтверждённых записей", () => {
    const answer = askGaika("Сколько заработали за неделю?", data);
    const totals = dashboardMetrics(data).totals;
    expect(answer.metrics[0]).toEqual({
      label: "Сумма",
      kind: "rub",
      value: totals.amountRub,
    });
    expect(answer.metrics[1]!.value).toBe(totals.hours);
    expect(answer.metrics[2]!.value).toBe(totals.revenuePerHour);
    expect(answer.sources[0]!.kind).toBe("report");
  });

  test("бригада 1: сумма её подтверждённых записей", () => {
    const answer = askGaika("Покажи бригаду 1", data);
    const brigade = data.brigades.find((b) => b.name === "Бригада 1")!;
    const own = data.entries.filter((e) => e.brigadeId === brigade.id && e.status === "confirmed");
    expect(answer.title).toBe("Бригада 1");
    expect(answer.metrics[0]!.value).toBe(totalsOf(own).amountRub);
    expect(answer.sources[0]).toEqual({ kind: "brigade", id: brigade.id, label: "Бригада 1" });
  });

  test("«бригада 3.10» не путается с «бригадой 3»", () => {
    expect(askGaika("бригада 3.10", data).title).toBe("Бригада 3.10");
    expect(askGaika("бригада 3", data).title).toBe("Бригада 3");
  });

  test("проверка: число и строки из очереди, замечания первыми", () => {
    const answer = askGaika("Что ждёт проверки?", data);
    const pending = queue(data, "pending");
    expect(answer.metrics[0]!.value).toBe(pending.length);
    expect(answer.rows.length).toBeGreaterThan(0);
    expect(answer.rows.length).toBeLessThanOrEqual(6);
    const firstFlagged = pending.find((v) => v.flags.length > 0);
    if (firstFlagged) expect(answer.rows[0]!.sub).toContain(firstFlagged.entry.number);
  });

  test("объект по коду: записи объекта со ссылками на них", () => {
    const answer = askGaika("ОБ-200", data);
    const object = data.objects.find((o) => o.code === "ОБ-200")!;
    expect(answer.title).toBe(object.label);
    const entryIds = data.entries.filter((e) => e.objectId === object.id).map((e) => e.id);
    for (const row of answer.rows) {
      const source = answer.sources[row.source! - 1]!;
      expect(source.kind).toBe("entry");
      expect(entryIds).toContain(source.id!);
    }
  });

  test("лучшая доходность действительно не меньше остальных", () => {
    const answer = askGaika("Какая бригада самая доходная?", data);
    const values = answer.rows.map((r) => r.metric!.value!);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    const worst = askGaika("у кого хуже всех доходность", data).rows.map((r) => r.metric!.value!);
    expect(worst).toEqual([...worst].sort((a, b) => a - b));
  });
});

describe("язык и совпадение с экранами", () => {
  test("проверка делит очередь так же, как экран проверки: 5 с замечаниями, 1 без", () => {
    const answer = askGaika("Что ждёт проверки?", data);
    expect(answer.metrics[0]!.value).toBe(6);
    expect(answer.metrics[1]!.value).toBe(5);
    expect(answer.lead).toContain("Без замечаний 1");
    // Информационный признак не выдаётся за замечание
    expect(answer.rows.map((r) => r.sub).join(" ")).not.toContain("Объект на несколько дней");
    expect(answer.rows.at(-1)!.sub).toContain("без замечаний");
  });

  test("числительные согласованы", () => {
    expect(askGaika("Сколько заработали за неделю?", data).lead).toMatch(
      /^Подтверждено 93 записи /,
    );
    expect(askGaika("Покажи бригаду 1", data).lead).toContain("Ещё 1 ждёт проверки.");
  });
});

describe("источники и честность", () => {
  test("у каждой строки есть сноска, и она указывает на существующий источник", () => {
    for (const question of ASK_SUGGESTIONS) {
      const answer = askGaika(question, data);
      expect(answer.understood).toBe(true);
      for (const row of answer.rows) {
        expect(row.source).not.toBeNull();
        expect(answer.sources[row.source! - 1]).toBeDefined();
      }
      expect(answer.followUps.length).toBeGreaterThan(0);
    }
  });

  test("непонятый вопрос честно говорит об этом и предлагает вопросы", () => {
    const answer = askGaika("расскажи анекдот", data);
    expect(answer.understood).toBe(false);
    expect(answer.metrics).toEqual([]);
    expect(answer.followUps.length).toBe(4);
  });

  test("в текстах нет длинных тире", () => {
    for (const question of [...ASK_SUGGESTIONS, "ОБ-200", "бригада 2"]) {
      const answer = askGaika(question, data);
      expect(JSON.stringify(answer)).not.toContain("—");
    }
  });
});
