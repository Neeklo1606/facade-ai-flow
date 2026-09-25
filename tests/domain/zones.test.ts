import { beforeEach, describe, expect, test } from "bun:test";
import { createDemoRepositories, resetDemo } from "@/adapters/demo";
import type { Repositories } from "@/ports";

/**
 * Захватки объекта с экрана (ADR-024). Проверяется то, из-за чего вторая цепочка продукта
 * не начиналась у заказчика: на новом объекте захваток нет, а отчёт без захватки не завести.
 */

const actor = { actorId: "e-sokolov" };
let repos: Repositories;

beforeEach(() => {
  resetDemo();
  repos = createDemoRepositories({ persist: false, simulate: false });
});

const project = "p-korona";

describe("захватка", () => {
  test("заводится и попадает в историю объекта", async () => {
    const zone = await repos.projects.saveZone(
      {
        id: null,
        projectId: project,
        parentId: null,
        level: "zone",
        name: "Фасад Г, оси 9–14",
        axes: "9–14",
        floors: "1–8",
        planQty: 820,
        baselineFactQty: 0,
        unit: "м²",
      },
      actor,
    );
    expect(zone.id).toBeTruthy();
    const card = await repos.projects.card(project);
    expect(card?.zones.some((item) => item.id === zone.id)).toBe(true);

    const events = await repos.timeline.list(project);
    const added = events.find((item) => item.type === "zone_changed");
    expect(added?.title).toContain("Фасад Г, оси 9–14");
    expect(added?.actorId).toBe("e-sokolov");
  });

  test("отчёт с площадки заводится на свежую захватку", async () => {
    const zone = await repos.projects.saveZone(
      {
        id: null,
        projectId: project,
        parentId: null,
        level: "zone",
        name: "Фасад Д",
        axes: null,
        floors: null,
        planQty: 400,
        baselineFactQty: 0,
        unit: "м²",
      },
      actor,
    );
    const report = await repos.reports.create(
      {
        projectId: project,
        zoneId: zone.id,
        workType: "Монтаж кронштейнов",
        declaredQty: 60,
        unit: "м²",
        reportDate: "2026-09-04",
        headcount: 4,
        summary: "Отработали ось 3, крепёж по проекту",
      },
      actor,
    );
    expect(report.zoneId).toBe(zone.id);
  });

  test("двух одинаковых названий на одном уровне не бывает", async () => {
    const input = {
      id: null,
      projectId: project,
      parentId: null,
      level: "zone" as const,
      name: "Фасад Е",
      axes: null,
      floors: null,
      planQty: 100,
      baselineFactQty: 0,
      unit: "м²",
    };
    await repos.projects.saveZone(input, actor);
    await expect(repos.projects.saveZone(input, actor)).rejects.toThrow(/уже есть/);
  });

  test("участок нельзя перенести внутрь самого себя", async () => {
    const parent = await repos.projects.saveZone(
      {
        id: null,
        projectId: project,
        parentId: null,
        level: "building",
        name: "Корпус 3",
        axes: null,
        floors: null,
        planQty: 0,
        baselineFactQty: 0,
        unit: "м²",
      },
      actor,
    );
    const child = await repos.projects.saveZone(
      {
        id: null,
        projectId: project,
        parentId: parent.id,
        level: "section",
        name: "Секция 3.1",
        axes: null,
        floors: null,
        planQty: 500,
        baselineFactQty: 0,
        unit: "м²",
      },
      actor,
    );
    await expect(
      repos.projects.saveZone(
        {
          id: parent.id,
          projectId: project,
          parentId: child.id,
          level: "building",
          name: "Корпус 3",
          axes: null,
          floors: null,
          planQty: 0,
          baselineFactQty: 0,
          unit: "м²",
        },
        actor,
      ),
    ).rejects.toThrow(/внутрь самого себя/);
  });

  test("выполненное до начала учёта не правится после принятой приёмки", async () => {
    const zone = await repos.projects.saveZone(
      {
        id: null,
        projectId: project,
        parentId: null,
        level: "zone",
        name: "Фасад Ж",
        axes: null,
        floors: null,
        planQty: 300,
        baselineFactQty: 20,
        unit: "м²",
      },
      actor,
    );
    const report = await repos.reports.create(
      {
        projectId: project,
        zoneId: zone.id,
        workType: "Монтаж направляющих",
        declaredQty: 45,
        unit: "м²",
        reportDate: "2026-09-04",
        headcount: 3,
        summary: "Ось 5, направляющие смонтированы",
      },
      actor,
    );
    await repos.reports.review({ id: report.id, status: "accepted", acceptedQty: 45 }, actor);

    // Факт стал «база плюс принятое»: править базу здесь значило бы переписать площадку
    await expect(
      repos.projects.saveZone(
        {
          id: zone.id,
          projectId: project,
          parentId: null,
          level: "zone",
          name: "Фасад Ж",
          axes: null,
          floors: null,
          planQty: 300,
          baselineFactQty: 0,
          unit: "м²",
        },
        actor,
      ),
    ).rejects.toThrow(/больше не правится/);

    // А название и план правятся: форма присылает текущий факт как есть
    const after = (await repos.projects.card(project))!.zones.find((item) => item.id === zone.id)!;
    expect(after.factQty).toBe(65);
    const renamed = await repos.projects.saveZone(
      {
        id: zone.id,
        projectId: project,
        parentId: null,
        level: "zone",
        name: "Фасад Ж, оси 5–9",
        axes: "5–9",
        floors: null,
        planQty: 340,
        baselineFactQty: after.factQty,
        unit: "м²",
      },
      actor,
    );
    expect(renamed.name).toBe("Фасад Ж, оси 5–9");
    expect(renamed.factQty).toBe(after.factQty);
  });
});
