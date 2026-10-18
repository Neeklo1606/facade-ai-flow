import { describe, expect, test } from "bun:test";
import {
  atLimit,
  CAPTURE_LIMIT_SEC,
  clock,
  emptyDraft,
  markFailed,
  markSaved,
  markSending,
  nearLimit,
  newCaptureKey,
  readyToSend,
  remainingSec,
  submitLabel,
} from "@/lib/capture";
import { createDemoRepositories } from "@/adapters/demo";

/**
 * Запись факта (ADR-036). Проверяется то, из-за чего записи теряются и дублируются:
 * предел длины, статусы отправки и ключ идемпотентности.
 */

describe("правила записи", () => {
  test("таймер показывает мм:сс", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(9_000)).toBe("00:09");
    expect(clock(125_000)).toBe("02:05");
  });

  test("предел длины совпадает с AI_MAX_AUDIO_SEC по умолчанию", () => {
    expect(CAPTURE_LIMIT_SEC).toBe(180);
    expect(remainingSec(0)).toBe(180);
    expect(nearLimit(0)).toBe(false);
    expect(nearLimit(170_000)).toBe(true);
    expect(atLimit(180_000)).toBe(true);
  });

  test("отправлять нечего, пока нет текста", () => {
    const draft = emptyDraft("p-korona");
    expect(readyToSend(draft)).toBe(false);
    expect(readyToSend({ ...draft, text: "  " })).toBe(false);
    expect(readyToSend({ ...draft, text: "Секция Б, лоток 24 метра" })).toBe(true);
  });

  test("во время отправки повторная отправка не начинается", () => {
    const draft = {
      ...emptyDraft("p-korona"),
      text: "Что-то произошло",
      status: "sending" as const,
    };
    expect(readyToSend(draft)).toBe(false);
  });

  test("статус «сохранено» существует отдельно от «отправляется»", () => {
    expect(submitLabel.draft).toBe("Не отправлено");
    expect(submitLabel.sending).toBe("Отправляется");
    expect(submitLabel.saved).toBe("Сохранено");
  });

  test("ключ отправки уникален у каждого черновика", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newCaptureKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key.length).toBeGreaterThanOrEqual(8);
  });
});

describe("запись факта через порт", () => {
  const repos = createDemoRepositories({ persist: false, simulate: false });
  const actor = { actorId: "e-gareev" };

  test("источник сохраняется вместе с метками записи и фото", async () => {
    const result = await repos.reports.capture(
      {
        projectId: "p-korona",
        captureKey: "capture-test-key-1",
        text: "Секция Б, лоток двадцать четыре метра",
        kind: "voice",
        durationMs: 47_000,
        photos: [{ caption: "Лоток на отметке", takenAt: "2026-09-05T08:42:10" }],
      },
      actor,
    );
    expect(result.repeated).toBe(false);
    expect(result.source.excerpt).toContain("лоток");
    expect(result.source.captureKey).toBe("capture-test-key-1");
    // Запись и фото висят на источнике: отчёта ещё нет, он появится после подтверждения
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.every((item) => item.sourceId === result.source.id)).toBe(true);
    expect(result.evidence.every((item) => item.reportId === null)).toBe(true);
    expect(result.evidence.find((item) => item.kind === "audio")?.caption).toContain("47");
  });

  test("повтор отправки с тем же ключом не создаёт второй источник", async () => {
    const input = {
      projectId: "p-korona",
      captureKey: "capture-test-key-2",
      text: "Песка привезли три куба",
      kind: "text" as const,
      durationMs: null,
      photos: [],
    };
    const first = await repos.reports.capture(input, actor);
    const second = await repos.reports.capture(input, actor);
    expect(second.repeated).toBe(true);
    expect(second.source.id).toBe(first.source.id);
    const sources = await repos.reports.list("p-korona");
    const keys = sources.map((card) => card.source?.captureKey).filter(Boolean);
    expect(keys.filter((key) => key === "capture-test-key-2")).toHaveLength(0);
  });

  test("запись в чужой объект не проходит", async () => {
    await expect(
      repos.reports.capture(
        {
          projectId: "p-nope",
          captureKey: "capture-test-key-3",
          text: "Что-то произошло",
          kind: "text",
          durationMs: null,
          photos: [],
        },
        actor,
      ),
    ).rejects.toThrow();
  });
});

describe("переходы статуса отправки", () => {
  const base = { ...emptyDraft("p-korona"), text: "Секция Б, лоток 24 метра" };

  test("отправка не теряет ключ: повтор придёт с тем же", () => {
    const sending = markSending(base, 47_000);
    expect(sending.status).toBe("sending");
    expect(sending.captureKey).toBe(base.captureKey);
    expect(sending.durationMs).toBe(47_000);
  });

  test("ошибка сохраняет текст, фото и ключ — человек нажимает «Повторить»", () => {
    const failed = markFailed(markSending(base, null), "Сеть недоступна");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("Сеть недоступна");
    expect(failed.text).toBe(base.text);
    expect(failed.captureKey).toBe(base.captureKey);
    // После ошибки отправлять можно снова — тем же ключом
    expect(readyToSend(failed)).toBe(true);
  });

  test("«сохранено» ставится только переходом по ответу сервера", () => {
    const saved = markSaved(markSending(base, null));
    expect(saved.status).toBe("saved");
    expect(saved.error).toBeNull();
    expect(saved.captureKey).toBe(base.captureKey);
  });
});
