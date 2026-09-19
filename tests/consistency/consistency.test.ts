import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createDemoRepositories, resetDemo } from "@/adapters/demo";
import { update } from "@/adapters/demo/state";
import { stopSimulator } from "@/adapters/demo/simulator";
import { checklistFor } from "@/domain/deliveries";
import type { Repositories } from "@/ports";
import { allPositions, consistencyIssues } from "./screens";

/**
 * Согласованность агрегатов между экранами (ADR-013, п. 2): на стартовых данных, после цепочки
 * действий и — чтобы зелёный результат что-то значил — на данных с внесённым расхождением.
 */

const actor = { actorId: "e-sokolov" };
let repos: Repositories;

beforeEach(() => {
  resetDemo();
  repos = createDemoRepositories({ persist: false });
});
afterAll(() => stopSimulator());

describe("согласованность цифр между экранами", () => {
  test("стартовые данные демонстрации сходятся", async () => {
    expect(await consistencyIssues(repos)).toEqual([]);
  });

  test("после проверки, запроса, решения и приёмки цифры по-прежнему сходятся", async () => {
    const projectId = "p-korona";
    const positions = await allPositions(repos, projectId);

    // Проверка: подтверждаем пять непроверенных позиций
    const pending = positions.filter((p) => p.review === "pending").slice(0, 5);
    await repos.positions.confirm({ ids: pending.map((p) => p.id) }, actor);

    // Запрос поставщикам по готовым позициям
    const ready = positions
      .filter((p) => p.purchase === "none" && p.handedOverAt && p.review !== "pending")
      .slice(0, 6);
    expect(ready.length).toBeGreaterThan(0);
    const suppliers = (await repos.procurement.suppliers()).slice(0, 2);
    await repos.procurement.createRequest(
      {
        projectId,
        positionIds: ready.map((p) => p.id),
        supplierIds: suppliers.map((s) => s.supplier.id),
        templateId: null,
        replyDueAt: "2026-09-12T18:00:00",
      },
      actor,
    );
    expect(await consistencyIssues(repos)).toEqual([]);

    // Решение по запросу с предложениями создаёт поставку
    const card = await repos.procurement.request("sr-323");
    const offer = card!.comparison.columns.find((c) => c.offerId);
    await repos.procurement.chooseSupplier(
      {
        requestId: "sr-323",
        supplierId: offer!.supplierId,
        reason: "Лучшая цена и полный объём по спецификации",
        approvedBy: "e-sokolov",
      },
      actor,
    );
    expect(await consistencyIssues(repos)).toEqual([]);

    // Приёмка с недостачей: поставка прибыла, факт по строке меньше заявленного, фото есть
    const delivery = (await repos.procurement.deliveries(projectId)).find(
      (d) => d.requestId === "sr-323" && d.status === "expected",
    )!;
    await repos.procurement.moveDelivery(
      { deliveryId: delivery.id, status: "arrived", note: null },
      actor,
    );
    const checklist = checklistFor(["tile"]).map((item, index) => ({
      id: item.id,
      label: item.label,
      ok: index !== 1,
      note: index === 1 ? "Сколы на трёх плитах" : null,
    }));
    await repos.procurement.acceptDelivery(
      {
        deliveryId: delivery.id,
        result: "accepted_with_remarks",
        lines: delivery.items.map((line) => ({
          lineId: line.id,
          acceptedQty: Math.round(line.qty * 0.9),
          remark: "Недостача 10%",
        })),
        checklist,
        photos: [{ dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", caption: null }],
        reason: null,
        confirmed: true,
      },
      actor,
    );
    expect(await consistencyIssues(repos)).toEqual([]);
  });
});

describe("проверка ловит расхождение", () => {
  test("экран документации считает иначе, чем карточка объекта", async () => {
    // Порт документов завышает число извлечённых позиций у одного документа — так выглядит
    // экран, который считает агрегат своим путём
    const skewed: Repositories = {
      ...repos,
      documents: {
        ...repos.documents,
        list: async (input) =>
          (await repos.documents.list(input)).map((row, index) =>
            index === 0 ? { ...row, extracted: row.extracted + 1 } : row,
          ),
      },
    };
    const issues = await consistencyIssues(skewed);
    expect(issues.some((issue) => issue.includes("извлечено по документам"))).toBe(true);
  });

  test("строка запроса расходится с позициями, из которых собрана", async () => {
    update((state) => ({
      ...state,
      requests: state.requests.map((request) =>
        request.id === "sr-324"
          ? {
              ...request,
              items: request.items.map((line, index) =>
                index === 0 ? { ...line, qty: line.qty + 100 } : line,
              ),
            }
          : request,
      ),
    }));
    const issues = await consistencyIssues(repos);
    expect(issues.some((issue) => issue.includes("З-2026/324"))).toBe(true);
  });
});
