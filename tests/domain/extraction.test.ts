import { describe, expect, test } from "bun:test";
import type { ExtractionJob, ExtractionJobStatus } from "@/contracts";
import { isActiveJob, latestJob, visibleStage } from "@/domain/extraction";

/** Завершённая задача: готова к проверке, стадия 4 */
function job(overrides: Partial<ExtractionJob> = {}): ExtractionJob {
  return {
    id: "ej-1",
    revisionId: "rev-1",
    status: "review",
    stage: 4,
    queuedAt: "2026-09-20T10:00:00",
    startedAt: "2026-09-20T10:01:00",
    finishedAt: "2026-09-20T10:06:00",
    error: null,
    ...overrides,
  };
}

/** Незаконченная задача: без времени окончания */
function running(
  status: ExtractionJobStatus,
  stage: number,
  overrides: Partial<ExtractionJob> = {},
) {
  return job({ status, stage, finishedAt: null, ...overrides });
}

describe("isActiveJob", () => {
  test("в очереди, распознаётся, извлечено — обработчик ещё не закончил", () => {
    expect(isActiveJob({ status: "queued" })).toBe(true);
    expect(isActiveJob({ status: "recognizing" })).toBe(true);
    expect(isActiveJob({ status: "extracted" })).toBe(true);
  });

  test("готово к проверке и ошибка — задача закончена", () => {
    expect(isActiveJob({ status: "review" })).toBe(false);
    expect(isActiveJob({ status: "failed" })).toBe(false);
  });
});

describe("latestJob", () => {
  test("нет задач — null", () => {
    expect(latestJob([], "rev-1")).toBeNull();
  });

  test("нет задач этой ревизии — null", () => {
    expect(latestJob([job({ revisionId: "rev-2" })], "rev-1")).toBeNull();
  });

  test("одна задача — она", () => {
    const only = job();
    expect(latestJob([only], "rev-1")).toBe(only);
  });

  test("последняя по времени постановки, независимо от порядка во входе", () => {
    const jobs = [
      job({ id: "mid", queuedAt: "2026-09-20T11:00:00" }),
      job({ id: "last", queuedAt: "2026-09-20T12:00:00" }),
      job({ id: "first", queuedAt: "2026-09-20T09:00:00" }),
    ];
    expect(latestJob(jobs, "rev-1")?.id).toBe("last");
  });

  test("более новая задача другой ревизии не мешает", () => {
    const jobs = [
      job({ id: "own", queuedAt: "2026-09-20T10:00:00" }),
      job({ id: "foreign", revisionId: "rev-2", queuedAt: "2026-09-21T10:00:00" }),
    ];
    expect(latestJob(jobs, "rev-1")?.id).toBe("own");
  });

  test("повторная задача после ошибки — последняя", () => {
    const jobs = [
      job({ id: "failed", status: "failed", error: "Файл повреждён", stage: 1 }),
      running("queued", 0, { id: "retry", queuedAt: "2026-09-20T10:30:00" }),
    ];
    expect(latestJob(jobs, "rev-1")?.id).toBe("retry");
  });

  test("равное время постановки — одна из равных задач ревизии", () => {
    const jobs = [job({ id: "a" }), job({ id: "b" }), job({ id: "x", revisionId: "rev-2" })];
    expect(["a", "b"]).toContain(latestJob(jobs, "rev-1")?.id ?? "");
  });
});

describe("visibleStage", () => {
  const NOW = "2026-09-20T12:00:00";

  test("нет задачи — индикатора нет", () => {
    expect(visibleStage(null, NOW)).toBeNull();
  });

  test("идущая задача показывает стадию, в том числе нулевую", () => {
    expect(visibleStage(running("queued", 0), NOW)).toBe(0);
    expect(visibleStage(running("recognizing", 1), NOW)).toBe(1);
    expect(visibleStage(running("extracted", 3), NOW)).toBe(3);
  });

  test("идущая задача видна, сколько бы ни шла", () => {
    const old = running("recognizing", 2, { queuedAt: "2026-09-17T12:00:00" });
    expect(visibleStage(old, NOW)).toBe(2);
  });

  test("закончена 30 минут назад — стадия видна", () => {
    expect(visibleStage(job({ finishedAt: "2026-09-20T11:30:00" }), NOW)).toBe(4);
  });

  test("закончена ровно час назад — ещё видна", () => {
    expect(visibleStage(job({ finishedAt: "2026-09-20T11:00:00" }), NOW)).toBe(4);
  });

  test("закончена час и секунду назад — индикатора нет", () => {
    expect(visibleStage(job({ finishedAt: "2026-09-20T10:59:59" }), NOW)).toBeNull();
  });

  test("давно обработанная ревизия — индикатора нет", () => {
    expect(visibleStage(job({ finishedAt: "2026-08-27T10:11:00" }), NOW)).toBeNull();
  });

  test("ошибка в пределах часа — видна стадия, на которой остановилась", () => {
    const failed = job({
      status: "failed",
      stage: 2,
      error: "Таблицы не найдены",
      finishedAt: "2026-09-20T11:50:00",
    });
    expect(visibleStage(failed, NOW)).toBe(2);
  });

  test("законченная задача без времени окончания — индикатора нет", () => {
    expect(visibleStage(job({ finishedAt: null }), NOW)).toBeNull();
  });
});
