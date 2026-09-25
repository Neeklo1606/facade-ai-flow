import { beforeEach, describe, expect, test } from "bun:test";
import { createDemoRepositories, resetDemo } from "@/adapters/demo";
import type { Repositories } from "@/ports";

/**
 * Позиции спецификации руками и из файла (ADR-025). Проверяется то, из-за чего первая цепочка
 * не начиналась у заказчика: позицию нельзя было создать вовсе. И то, что делает заведённую
 * строку честной: происхождение названо, места на листе нет, сопоставление предложено, а не
 * подставлено молча.
 */

const actor = { actorId: "e-volkova" };
let repos: Repositories;

beforeEach(() => {
  resetDemo();
  repos = createDemoRepositories({ persist: false, simulate: false });
});

/** Ревизия документа из фикстур: спецификация «Северной Короны» */
async function revision() {
  const documents = await repos.documents.list({ projectId: "p-korona" });
  const item = documents.find((row) => row.document.fileType === "xlsx") ?? documents[0]!;
  return item.document.id;
}

describe("позиция руками", () => {
  test("заводится, попадает в список и в историю позиции", async () => {
    const revisionId = await revision();
    const created = await repos.positions.create(
      {
        revisionId,
        projectName: "Кронштейн КР-250 оцинкованный",
        qty: 320,
        unit: "шт",
      },
      actor,
    );
    expect(created.id).toBeTruthy();
    expect(created.projectName).toBe("Кронштейн КР-250 оцинкованный");

    const page = await repos.positions.list({ revisionId, limit: 200 });
    expect(page.items.some((item) => item.id === created.id)).toBe(true);

    const history = await repos.positions.history(created.id);
    expect(history[0]?.action).toBe("Позиция заведена вручную");
    expect(history[0]?.actorId).toBe("e-volkova");
  });

  test("происхождение названо: уверенность единица, места на листе нет, проверка пройдена", async () => {
    const created = await repos.positions.create(
      { revisionId: await revision(), projectName: "Профиль Т-образный 3 м", qty: 90, unit: "м" },
      actor,
    );
    expect(created.confidence).toBe(1);
    expect(created.region).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(created.review).toBe("confirmed");
    expect(created.reviewedBy).toBe("e-volkova");
    expect(created.note).toBe("заведена вручную");
  });

  test("материал предлагается, но не подтверждается молча", async () => {
    // Наименование из справочника фикстур: правило то же, что при разборе (ADR-014, п. 3)
    const created = await repos.positions.create(
      {
        revisionId: await revision(),
        projectName: "Кронштейн КР-150 оцинкованный",
        qty: 10,
        unit: "шт",
      },
      actor,
    );
    expect(created.materialId).not.toBeNull();
    expect(created.matchStatus).toBe("suggested");
    expect(created.matchedBy).toBeNull();
  });

  test("номер позиции не повторяется в ревизии", async () => {
    const revisionId = await revision();
    const first = await repos.positions.create(
      { revisionId, position: "9.99", projectName: "Анкер клиновой 10×100", qty: 500, unit: "шт" },
      actor,
    );
    expect(first.position).toBe("9.99");
    await expect(
      repos.positions.create(
        {
          revisionId,
          position: "9.99",
          projectName: "Анкер клиновой 12×120",
          qty: 200,
          unit: "шт",
        },
        actor,
      ),
    ).rejects.toThrow(/уже есть/);
  });
});

describe("спецификация из файла", () => {
  test("строки принимаются, а непринятые названы номером и причиной", async () => {
    const revisionId = await revision();
    const report = await repos.positions.importSpec(
      {
        revisionId,
        rows: [
          { position: "100.1", name: "Кассета алюминиевая 600×600", qty: "240", unit: "шт" },
          { position: "100.2", name: "", qty: "10", unit: "шт" },
          { position: "100.3", name: "Уплотнитель EPDM", qty: "много", unit: "м" },
          { position: "100.4", name: "Винт самонарезающий", qty: "1 200", unit: "" },
          { position: "100.5", name: "Заклёпка 4×10", qty: "3 000", unit: "шт" },
        ],
      },
      actor,
    );
    expect(report.added).toBe(2);
    expect(report.refused).toEqual([
      { row: 3, reason: "пустое наименование" },
      { row: 4, reason: "количество «много» не число" },
      { row: 5, reason: "пустая единица измерения" },
    ]);

    const page = await repos.positions.list({ revisionId, limit: 200 });
    const loaded = page.items.find((item) => item.position === "100.5");
    expect(loaded?.qty).toBe(3000);
    expect(loaded?.note).toBe("загружена из файла");
  });

  test("номера позиций проставляются сами, когда их нет в файле", async () => {
    const revisionId = await revision();
    const before = (await repos.positions.list({ revisionId, limit: 200 })).total;
    const report = await repos.positions.importSpec(
      {
        revisionId,
        rows: [
          { name: "Лента герметизирующая 100 мм", qty: "60", unit: "м" },
          { name: "Лента герметизирующая 150 мм", qty: "40", unit: "м" },
        ],
      },
      actor,
    );
    expect(report.added).toBe(2);
    const after = await repos.positions.list({ revisionId, limit: 200 });
    expect(after.total).toBe(before + 2);
    const numbers = after.items
      .filter((item) => item.note === "загружена из файла")
      .map((item) => item.position);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("письмо запроса", () => {
  test("шаблон есть и на пустой базе: мастер не зависит от фикстур", async () => {
    const templates = await repos.procurement.templates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]?.subject).toContain("{объект}");
    expect(templates[0]?.body).toContain("{контакт}");
  });
});
