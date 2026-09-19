import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { guardRepositories, sessionFor } from "@/adapters/access";
import { createDemoRepositories, resetDemo } from "@/adapters/demo";
import { stopSimulator } from "@/adapters/demo/simulator";
import { checklistFor } from "@/domain/deliveries";
import { ConflictError, FORBIDDEN_MESSAGE, ForbiddenError, type Repositories } from "@/ports";
import { allPositions } from "../consistency/screens";

/**
 * Негативные сценарии Q6 на уровне адаптера (ADR-013, п. 4): правило держит порт, а не экран.
 * Экран может ошибиться или быть обойдён прямым вызовом — отказ должен прийти всё равно.
 */

const actor = { actorId: "e-sokolov" };
let repos: Repositories;

beforeEach(() => {
  resetDemo();
  repos = createDemoRepositories({ persist: false });
});
afterAll(() => stopSimulator());

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as Error;
  }
}

describe("отправка в закупку с непроверенными позициями", () => {
  test("передача ревизии, где остались «Не удалось определить», отклоняется", async () => {
    const positions = await allPositions(repos, "p-korona");
    const blocking = positions.filter((p) => p.review === "pending" && p.confidence < 0.7);
    expect(blocking.length).toBeGreaterThan(0);
    const error = await rejection(
      repos.positions.handOver({ revisionId: blocking[0]!.documentId }, actor),
    );
    expect(error).toBeInstanceOf(ConflictError);
  });

  test("запрос поставщикам по непроверенной позиции не создаётся", async () => {
    const positions = await allPositions(repos, "p-korona");
    const pending = positions.find((p) => p.review === "pending")!;
    const suppliers = await repos.procurement.suppliers();
    const error = await rejection(
      repos.procurement.createRequest(
        {
          projectId: "p-korona",
          positionIds: [pending.id],
          supplierIds: [suppliers[0]!.supplier.id],
          templateId: null,
          replyDueAt: "2026-09-12T18:00:00",
        },
        actor,
      ),
    );
    expect(error).not.toBeNull();
  });
});

describe("решение по запросу", () => {
  async function offered() {
    const card = await repos.procurement.request("sr-323");
    return card!.comparison.columns.find((c) => c.offerId)!.supplierId;
  }

  test("без причины решение не фиксируется", async () => {
    const error = await rejection(
      repos.procurement.chooseSupplier(
        { requestId: "sr-323", supplierId: await offered(), reason: "  ", approvedBy: "e-sokolov" },
        actor,
      ),
    );
    expect(error).not.toBeNull();
  });

  test("повторная фиксация решения по тому же запросу отклоняется", async () => {
    const input = {
      requestId: "sr-323",
      supplierId: await offered(),
      reason: "Лучшая цена и полный объём по спецификации",
      approvedBy: "e-sokolov",
    };
    await repos.procurement.chooseSupplier(input, actor);
    const error = await rejection(repos.procurement.chooseSupplier(input, actor));
    expect(error).toBeInstanceOf(ConflictError);
  });
});

describe("приёмка с расхождением", () => {
  async function arrivedDelivery() {
    const card = await repos.procurement.request("sr-323");
    await repos.procurement.chooseSupplier(
      {
        requestId: "sr-323",
        supplierId: card!.comparison.columns.find((c) => c.offerId)!.supplierId,
        reason: "Лучшая цена и полный объём по спецификации",
        approvedBy: "e-sokolov",
      },
      actor,
    );
    const delivery = (await repos.procurement.deliveries("p-korona")).find(
      (d) => d.requestId === "sr-323",
    )!;
    await repos.procurement.moveDelivery(
      { deliveryId: delivery.id, status: "arrived", note: null },
      actor,
    );
    return delivery;
  }
  const checklist = checklistFor(["tile"]).map((item) => ({
    id: item.id,
    label: item.label,
    ok: true,
    note: null,
  }));

  test("недостача без фото не принимается", async () => {
    const delivery = await arrivedDelivery();
    const error = await rejection(
      repos.procurement.acceptDelivery(
        {
          deliveryId: delivery.id,
          result: "accepted_with_remarks",
          lines: delivery.items.map((line) => ({
            lineId: line.id,
            acceptedQty: line.qty - 1,
            remark: "Недостача",
          })),
          checklist,
          photos: [],
          reason: null,
          confirmed: true,
        },
        actor,
      ),
    );
    expect(error?.message).toBe("При расхождении нужно хотя бы одно фото");
  });

  test("при расхождении «принять полностью» нельзя", async () => {
    const delivery = await arrivedDelivery();
    const error = await rejection(
      repos.procurement.acceptDelivery(
        {
          deliveryId: delivery.id,
          result: "accepted",
          lines: delivery.items.map((line) => ({
            lineId: line.id,
            acceptedQty: line.qty - 1,
            remark: null,
          })),
          checklist,
          photos: [{ dataUrl: "data:image/jpeg;base64,/9j/4AAQ", caption: null }],
          reason: null,
          confirmed: true,
        },
        actor,
      ),
    );
    expect(error?.message).toBe(
      "Есть расхождение: принять можно только с замечаниями или отклонить",
    );
  });
});

describe("отчёт с площадки", () => {
  test("вернуть уже возвращённый отчёт нельзя — переход не по таблице статусов", async () => {
    const report = (await repos.reports.list("p-korona")).find(
      (r) => r.report.status === "review",
    )!.report;
    const input = { id: report.id, status: "returned" as const, acceptedQty: null };
    await repos.reports.review(input, actor);
    expect(await rejection(repos.reports.review(input, actor))).toBeInstanceOf(ConflictError);
  });
});

describe("доступ без прав", () => {
  const as = (actorId: string) => guardRepositories(repos, () => sessionFor(repos, actorId));

  test("снабжение не принимает отчёт с площадки: отказ без деталей", async () => {
    const report = (await repos.reports.list("p-korona")).find(
      (r) => r.report.status === "review",
    )!;
    const error = await rejection(
      as("e-dorohov").reports.review(
        { id: report.report.id, status: "accepted", acceptedQty: 1 },
        actor,
      ),
    );
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error?.message).toBe(FORBIDDEN_MESSAGE);
  });

  test("директор не фиксирует решение, ПТО не создаёт запрос", async () => {
    const decide = await rejection(
      as("e-belyaev").procurement.chooseSupplier(
        {
          requestId: "sr-323",
          supplierId: "c-fk",
          reason: "Лучшая цена и полный объём по спецификации",
          approvedBy: "e-belyaev",
        },
        actor,
      ),
    );
    expect(decide).toBeInstanceOf(ForbiddenError);
    const request = await rejection(
      as("e-volkova").procurement.createRequest(
        {
          projectId: "p-korona",
          positionIds: ["x"],
          supplierIds: ["y"],
          templateId: null,
          replyDueAt: "2026-09-12T18:00:00",
        },
        actor,
      ),
    );
    expect(request).toBeInstanceOf(ForbiddenError);
  });

  test("прораб не видит чужой объект", async () => {
    expect(await rejection(as("e-gareev").projects.card("p-meridian"))).toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("сопоставление с номенклатурой (ADR-014)", () => {
  const as = (actorId: string) => guardRepositories(repos, () => sessionFor(repos, actorId));
  async function waiting() {
    const positions = await allPositions(repos, "p-korona");
    return positions.filter(
      (p) => p.handedOverAt && p.purchase === "none" && p.matchStatus !== "confirmed",
    );
  }
  async function supplierIds() {
    return (await repos.procurement.suppliers()).slice(0, 1).map((s) => s.supplier.id);
  }

  test("неподтверждённое сопоставление не уходит в запрос — отказ с причиной", async () => {
    const [position] = await waiting();
    expect(position).toBeDefined();
    const error = await rejection(
      repos.procurement.createRequest(
        {
          projectId: "p-korona",
          positionIds: [position!.id],
          supplierIds: await supplierIds(),
          templateId: null,
          replyDueAt: "2026-09-12T18:00:00",
        },
        actor,
      ),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toContain("Сопоставление с материалом не подтверждено");
  });

  test("после подтверждения та же позиция уходит в запрос строкой по справочнику", async () => {
    const [position] = await waiting();
    const confirmed = await repos.positions.confirmMatch(
      { positionId: position!.id, materialId: position!.materialId! },
      actor,
    );
    expect(confirmed.matchStatus).toBe("confirmed");
    expect(confirmed.matchedBy).toBe("e-sokolov");
    const result = await repos.procurement.createRequest(
      {
        projectId: "p-korona",
        positionIds: [position!.id],
        supplierIds: await supplierIds(),
        templateId: null,
        replyDueAt: "2026-09-12T18:00:00",
      },
      actor,
    );
    expect(result.request.items.map((line) => line.name)).toEqual([confirmed.normalizedName!]);
    const history = await repos.positions.history(position!.id);
    expect(history.some((change) => change.action === "Сопоставление подтверждено")).toBe(true);
  });

  test("позицию, уже ушедшую в запрос, не пересопоставить", async () => {
    const positions = await allPositions(repos, "p-korona");
    const requested = positions.find((p) => p.purchase === "requested")!;
    const other = (await repos.positions.materials()).find((m) => m.id !== requested.materialId)!;
    const error = await rejection(
      repos.positions.confirmMatch({ positionId: requested.id, materialId: other.id }, actor),
    );
    expect(error).toBeInstanceOf(ConflictError);
  });

  test("справочник: дубль название+единица отклоняется, правка пишется в историю", async () => {
    const [material] = await repos.positions.materials();
    const duplicate = await rejection(
      repos.catalog.saveMaterial(
        { ...material!, id: null, characteristics: [], synonyms: [], spellings: [] },
        actor,
      ),
    );
    expect(duplicate).toBeInstanceOf(ConflictError);

    await repos.catalog.saveMaterial(
      { ...material!, synonyms: [...material!.synonyms, "Новый синоним"] },
      { actorId: "e-dorohov" },
    );
    const card = await repos.catalog.material(material!.id);
    expect(card?.changes[0]).toMatchObject({
      field: "синонимы",
      actorId: "e-dorohov",
      before: material!.synonyms.join("; ") || null,
      after: [...material!.synonyms, "Новый синоним"].join("; "),
    });
  });

  test("права: прораб не сопоставляет, директор не правит справочник, снабжение правит", async () => {
    const [position] = await waiting();
    expect(
      await rejection(
        as("e-gareev").positions.confirmMatch(
          { positionId: position!.id, materialId: position!.materialId! },
          actor,
        ),
      ),
    ).toBeInstanceOf(ForbiddenError);
    const [material] = await repos.positions.materials();
    expect(
      await rejection(as("e-belyaev").catalog.saveMaterial({ ...material! }, actor)),
    ).toBeInstanceOf(ForbiddenError);
    const saved = await as("e-dorohov").catalog.saveMaterial(
      { ...material!, spellings: [...material!.spellings, "КР150"] },
      actor,
    );
    expect(saved.spellings).toContain("КР150");
  });
});
