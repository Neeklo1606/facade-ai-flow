import { describe, expect, test } from "bun:test";
import { createDemoRepositories } from "@/adapters/demo";

/**
 * «Верно» и «Отменить» на данных (ADR-040, п. 3 и 4): отчёт ссылается на запись, повтор
 * не плодит дубль, отменить можно только своё и только пока это не решено.
 */

const foreman = { actorId: "e-gareev" };
const pto = { actorId: "e-volkova" };
const supply = { actorId: "e-dorohov" };

async function freshCapture() {
  const repos = createDemoRepositories({ persist: false, simulate: false });
  const now = (await repos.clock.now()).slice(0, 10);
  const saved = await repos.reports.capture(
    {
      projectId: "p-korona",
      captureKey: `key-${Math.random().toString(36).slice(2, 12)}`,
      text: "Стилобат, оси А–Р. Смонтировали девяносто шесть квадратов облицовки",
      kind: "voice",
      durationMs: 9000,
      photos: [],
    },
    foreman,
  );
  const report = {
    projectId: "p-korona",
    zoneId: "z-korona-4",
    workType: "Монтаж облицовки из керамогранита",
    declaredQty: 96,
    unit: "м²",
    reportDate: now,
    headcount: 3,
    summary: "Стилобат, оси А–Р. Смонтировали девяносто шесть квадратов облицовки",
    sourceId: saved.source.id,
  };
  return { repos, saved, report, now };
}

describe("отчёт из записи", () => {
  test("ссылается на источник записи, а не создаёт ручной", async () => {
    const { repos, saved, report } = await freshCapture();
    const created = await repos.reports.create(report, foreman);
    expect(created.sourceId).toBe(saved.source.id);
    expect(created.kind).toBe("voice");
  });

  test("повтор «Верно» по той же записи возвращает тот же отчёт", async () => {
    const { repos, report } = await freshCapture();
    const first = await repos.reports.create(report, foreman);
    const second = await repos.reports.create(report, foreman);
    expect(second.id).toBe(first.id);
    const list = await repos.reports.list("p-korona");
    expect(list.filter((item) => item.report.sourceId === report.sourceId)).toHaveLength(1);
  });

  test("чужой или несуществующий источник отклоняется", async () => {
    const { repos, report } = await freshCapture();
    await expect(
      repos.reports.create({ ...report, sourceId: "src-нет" }, foreman),
    ).rejects.toThrow();
  });
});

describe("отмена отчёта", () => {
  test("автор снимает отчёт на проверке; запись с площадки остаётся", async () => {
    const { repos, saved, report } = await freshCapture();
    const created = await repos.reports.create(report, foreman);
    await repos.reports.retract({ id: created.id }, foreman);
    const list = await repos.reports.list("p-korona");
    expect(list.some((item) => item.report.id === created.id)).toBe(false);
    expect(await repos.reports.source(saved.source.id)).not.toBeNull();
  });

  test("чужой отчёт отменить нельзя", async () => {
    const { repos, report } = await freshCapture();
    const created = await repos.reports.create(report, foreman);
    await expect(repos.reports.retract({ id: created.id }, pto)).rejects.toThrow(
      "Недостаточно прав",
    );
  });

  test("принятый отчёт отменить нельзя", async () => {
    const { repos, report } = await freshCapture();
    const created = await repos.reports.create(report, foreman);
    await repos.reports.review({ id: created.id, status: "accepted", acceptedQty: 96 }, pto);
    await expect(repos.reports.retract({ id: created.id }, foreman)).rejects.toThrow("проверен");
  });
});

describe("отмена заявки", () => {
  test("автор снимает новую заявку, решённую — нет", async () => {
    const { repos, now } = await freshCapture();
    const neededBy = new Date(Date.parse(`${now}T12:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const input = {
      projectId: "p-korona",
      sourceId: null,
      name: "Нащельник угловой",
      qty: 12,
      unit: "шт",
      neededBy,
      note: "Без него встанут примыкания",
    };
    const first = await repos.supply.createRequest(input, foreman);
    await repos.supply.retractRequest({ id: first.id }, foreman);
    expect((await repos.supply.requests("p-korona")).some((row) => row.id === first.id)).toBe(
      false,
    );

    const second = await repos.supply.createRequest(input, foreman);
    await expect(repos.supply.retractRequest({ id: second.id }, supply)).rejects.toThrow(
      "Недостаточно прав",
    );
    await repos.supply.decideRequest({ id: second.id, status: "accepted", decision: "" }, supply);
    await expect(repos.supply.retractRequest({ id: second.id }, foreman)).rejects.toThrow("решило");
  });
});
