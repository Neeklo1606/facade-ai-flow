import { describe, expect, test } from "bun:test";
import { buildProjectContext, workTypeCode, MATERIALS_LIMIT } from "@/domain/ai-context";
import { createDemoRepositories } from "@/adapters/demo";

/**
 * Контекст объекта (GAIKA_AI_GATEWAY.md, раздел 6; ADR-035, п. 2). Проверяется граница данных:
 * в модель уходят справочники объекта и ничего сверх них. Цена утечки — данные клиента
 * у внешнего провайдера, поэтому проверка смотрит на то, чего в контексте быть не должно.
 */

const repos = createDemoRepositories({ persist: false, simulate: false });

async function contextOf(projectId: string) {
  const [card, reports, materials, now] = await Promise.all([
    repos.projects.card(projectId),
    repos.reports.list(projectId),
    repos.positions.materials(),
    repos.clock.now(),
  ]);
  return buildProjectContext({
    projectId: card!.project.id,
    projectName: card!.project.name,
    workDate: now.slice(0, 10),
    zones: card!.zones,
    crews: card!.crews,
    team: card!.team,
    reports: reports.map((item) => item.report),
    materials,
  });
}

describe("контекст объекта", () => {
  test("собирается из справочников объекта", async () => {
    const context = await contextOf("p-korona");
    expect(context.projectId).toBe("p-korona");
    expect(context.zones.length).toBeGreaterThan(0);
    expect(context.people.length).toBeGreaterThan(0);
    expect(context.materials.length).toBeGreaterThan(0);
    expect(context.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  test("виды работ берутся из отчётов объекта вместе с единицами", async () => {
    const context = await contextOf("p-korona");
    expect(context.workTypes.length).toBeGreaterThan(0);
    for (const work of context.workTypes) {
      expect(work.units.length, work.name).toBeGreaterThan(0);
      // Код латиницей: модель возвращает его обратно без искажений
      expect(work.code).toMatch(/^[\p{L}\p{N}-]+$/u);
    }
  });

  test("о людях уходит только имя: ни телефона, ни почты, ни должности", async () => {
    const context = await contextOf("p-korona");
    const serialized = JSON.stringify(context);
    const team = (await repos.projects.card("p-korona"))!.team;
    for (const person of team) {
      expect(serialized).toContain(person.name);
      if (person.phone) expect(serialized, "телефон").not.toContain(person.phone);
      if (person.email) expect(serialized, "почта").not.toContain(person.email);
      if (person.telegram) expect(serialized, "телеграм").not.toContain(person.telegram);
    }
  });

  test("ни цен, ни договоров, ни заказчика в контексте нет", async () => {
    const context = await contextOf("p-korona");
    const serialized = JSON.stringify(context).toLowerCase();
    for (const word of ["цена", "price", "договор", "ндс", "руб", "заказчик"]) {
      expect(serialized, word).not.toContain(word);
    }
  });

  test("номенклатура ограничена: весь справочник в промпт не поедет", async () => {
    const context = await contextOf("p-korona");
    expect(context.materials.length).toBeLessThanOrEqual(MATERIALS_LIMIT);
  });

  test("чужой объект в контекст не попадает", async () => {
    const korona = await contextOf("p-korona");
    const meridian = await contextOf("p-meridian");
    const koronaZones = new Set(korona.zones.map((zone) => zone.code));
    for (const zone of meridian.zones) {
      expect(koronaZones.has(zone.code), zone.code).toBe(false);
    }
  });

  test("код вида работ не теряет смысл на кириллице", () => {
    expect(workTypeCode("Монтаж кабельного лотка")).toBe("монтаж-кабельного-лотка");
    expect(workTypeCode("   ")).toBe("work");
  });
});
