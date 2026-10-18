import { describe, expect, test } from "bun:test";
import { createDemoRepositories } from "@/adapters/demo";
import { prepareDraft } from "@/api/capture";
import { DEMO_EXAMPLES } from "@/ai/samples/demo-examples";

/**
 * Заявка на материал и черновик разбора (ADR-037, сценарии 1 и 3). Проверяется то, из-за чего
 * показ выглядел бы обманом: заготовка заявки не выдумывает количество, переходы статуса
 * идут по таблице, а отказ требует причины.
 */

const repos = createDemoRepositories({ persist: false, simulate: false });
const foreman = { actorId: "e-gareev" };
const supply = { actorId: "e-dorohov" };

describe("черновик разбора", () => {
  test("из примера смены получаются карточки и готовая запись отчёта", async () => {
    const example = DEMO_EXAMPLES.find((item) => item.id === "demo-shift")!;
    const card = await repos.projects.card(example.projectId);
    const reports = await repos.reports.list(example.projectId);
    const prepared = prepareDraft(example.expected, {
      projectId: example.projectId,
      date: "2026-09-05",
      summary: example.message,
      zones: card!.zones,
      reports: reports.map((item) => item.report),
    });
    expect(prepared.cards.map((cardItem) => cardItem.key)).toContain("works");
    expect(prepared.cards.map((cardItem) => cardItem.key)).toContain("people");
    expect(prepared.reports).toHaveLength(1);
    const row = prepared.reports[0]!;
    expect(row.zoneId).toBe("z-korona-4");
    expect(row.declaredQty).toBe(96);
    expect(row.unit).toBe("м²");
    expect(row.headcount).toBe(3);
    // Название вида работ взято из справочника объекта, а не из кода модели
    expect(row.workType.toLowerCase()).toContain("облицовк");
  });

  test("заготовка заявки берёт количество из фразы, а не выдумывает", async () => {
    const example = DEMO_EXAMPLES.find((item) => item.id === "demo-supply")!;
    const card = await repos.projects.card(example.projectId);
    const prepared = prepareDraft(example.expected, {
      projectId: example.projectId,
      date: "2026-09-05",
      summary: example.message,
      zones: card!.zones,
      reports: [],
    });
    expect(prepared.prefill).not.toBeNull();
    expect(prepared.prefill!.qty).toBe(40);
    expect(prepared.prefill!.unit).toBe("шт");
    // Название — из предложенного решения, в именительном падеже, а не «кронштейнов несущих»
    expect(prepared.prefill!.name).toBe("Кронштейн несущий");
    // Записей отчёта в этом примере нет: работа не называлась
    expect(prepared.reports).toHaveLength(0);
  });

  test("замечание без объёма отчётом не становится", async () => {
    const example = DEMO_EXAMPLES.find((item) => item.id === "demo-task")!;
    const card = await repos.projects.card(example.projectId);
    const prepared = prepareDraft(example.expected, {
      projectId: example.projectId,
      date: "2026-09-05",
      summary: example.message,
      zones: card!.zones,
      reports: [],
    });
    expect(prepared.reports).toHaveLength(0);
    expect(prepared.cards.map((item) => item.key)).toContain("problems");
  });
});

describe("заявка на материал", () => {
  test("заводится площадкой и видна в очереди", async () => {
    const created = await repos.supply.createRequest(
      {
        projectId: "p-korona",
        sourceId: null,
        name: "Нащельник угловой",
        qty: 12,
        unit: "шт",
        neededBy: "2026-12-01",
        note: "Без него встанут примыкания",
      },
      foreman,
    );
    expect(created.status).toBe("new");
    expect(created.authorId).toBe("e-gareev");
    const queue = await repos.supply.requests("p-korona");
    expect(queue.some((row) => row.id === created.id)).toBe(true);
  });

  test("статус идёт по таблице переходов, а не куда угодно", async () => {
    const created = await repos.supply.createRequest(
      {
        projectId: "p-korona",
        sourceId: null,
        name: "Анкер клиновой",
        qty: 100,
        unit: "шт",
        neededBy: "2026-12-01",
        note: "Добор на стилобат",
      },
      foreman,
    );
    // Из «новой» нельзя сразу закрыть: сначала принять и заказать
    await expect(
      repos.supply.decideRequest({ id: created.id, status: "closed", decision: "" }, supply),
    ).rejects.toThrow();
    const accepted = await repos.supply.decideRequest(
      { id: created.id, status: "accepted", decision: "Берём у «Фасад-Комплект»" },
      supply,
    );
    expect(accepted.status).toBe("accepted");
    expect(accepted.decidedBy).toBe("e-dorohov");
    expect(accepted.decidedAt).not.toBeNull();
  });

  test("отказ без причины не фиксируется", async () => {
    const created = await repos.supply.createRequest(
      {
        projectId: "p-korona",
        sourceId: null,
        name: "Профиль направляющий",
        qty: 30,
        unit: "шт",
        neededBy: "2026-12-01",
        note: "Замена повреждённых",
      },
      foreman,
    );
    await expect(
      repos.supply.decideRequest({ id: created.id, status: "declined", decision: "" }, supply),
    ).rejects.toThrow();
  });

  test("срок в прошлом не принимается: это не заявка, а просрочка", async () => {
    await expect(
      repos.supply.createRequest(
        {
          projectId: "p-korona",
          sourceId: null,
          name: "Уголок",
          qty: 10,
          unit: "шт",
          neededBy: "2020-01-01",
          note: "Срок в прошлом",
        },
        foreman,
      ),
    ).rejects.toThrow();
  });
});
