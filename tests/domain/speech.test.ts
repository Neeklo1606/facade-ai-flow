import { describe, expect, test } from "bun:test";
import { createDemoSpeech, createYandexSpeech, pickSpeech } from "@/adapters/speech";
import { locateQuote, revealSchedule, visibleWords, wordTimings } from "@/domain/transcript";
import { DEMO_EXAMPLES } from "@/ai/samples/demo-examples";

/**
 * Порт речи (ADR-040, п. 2): выбор распознавателя по окружению, демо-расшифровка с таймингами
 * слов и заготовка Yandex, которая честно говорит, что не подключена.
 */

const env = (values: Record<string, string>) => (name: string) => values[name];

describe("выбор распознавателя", () => {
  test("без окружения — демо", () => {
    expect(pickSpeech(env({})).kind).toBe("demo");
  });

  test("демо-контур без ключа — демо, даже если провайдер назван", () => {
    expect(pickSpeech(env({ AI_MODE: "demo", STT_PROVIDER: "openai" })).kind).toBe("demo");
    const choice = pickSpeech(env({ AI_MODE: "live", STT_PROVIDER: "openai" }));
    expect(choice.kind).toBe("demo");
    expect(choice.kind === "demo" && choice.reason).toContain("STT_API_KEY");
  });

  test("живой режим с ключом и моделью — OpenAI-совместимый", () => {
    const choice = pickSpeech(
      env({ AI_MODE: "live", STT_PROVIDER: "openai", STT_API_KEY: "k", STT_MODEL: "whisper-1" }),
    );
    expect(choice.kind).toBe("openai");
  });

  test("Yandex выбирается, но не подключён", async () => {
    expect(pickSpeech(env({ AI_MODE: "live", STT_PROVIDER: "yandex" })).kind).toBe("yandex");
    await expect(
      createYandexSpeech().transcribe({ bytes: null, mimeType: "audio/ogg", durationMs: 1000 }),
    ).rejects.toThrow("не подключено");
  });
});

describe("демо-расшифровка", () => {
  test("без сценария берётся «Смена», слова с интервалами по порядку", async () => {
    const answer = await createDemoSpeech().transcribe({
      bytes: null,
      mimeType: "audio/webm",
      durationMs: 7000,
    });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    const shift = DEMO_EXAMPLES.find((item) => item.id === "demo-shift")!;
    expect(answer.value.text).toBe(shift.message);
    expect(answer.value.segments.length).toBe(shift.message.split(/\s+/u).length);
    const starts = answer.value.segments.map((segment) => segment.startMs);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(answer.job.provider).toBe("demo");
  });

  test("сценарий нехватки отдаёт свою расшифровку", async () => {
    const answer = await createDemoSpeech().transcribe({
      bytes: null,
      mimeType: "audio/webm",
      durationMs: 3000,
      scenario: "demo-supply",
    });
    expect(answer.ok && answer.value.text).toContain("Кронштейнов");
  });

  test("неизвестный сценарий — отказ с причиной, а не чужая расшифровка", async () => {
    const answer = await createDemoSpeech().transcribe({
      bytes: null,
      mimeType: "audio/webm",
      durationMs: 3000,
      scenario: "нет-такого",
    });
    expect(answer.ok).toBe(false);
  });
});

describe("показ слов", () => {
  const segments = wordTimings("Стилобат, оси А–Р. Смонтировали девяносто шесть квадратов", 6000);

  test("интервалы не выходят за длительность и не пересекаются", () => {
    for (let index = 1; index < segments.length; index++) {
      expect(segments[index]!.startMs).toBeGreaterThanOrEqual(segments[index - 1]!.endMs);
    }
    expect(segments.at(-1)!.endMs).toBeLessThanOrEqual(6000);
  });

  test("ускоренный показ укладывается в 2 секунды", () => {
    const schedule = revealSchedule(segments, 2000);
    expect(Math.max(...schedule)).toBeLessThanOrEqual(2000);
    expect(visibleWords(schedule, 0)).toBe(1);
    expect(visibleWords(schedule, 2000)).toBe(segments.length);
  });

  test("фрагмент источника находится без учёта регистра и «ё»", () => {
    const text = "Смонтировали девяносто шесть квадратов облицовки";
    expect(locateQuote(text, "ДЕВЯНОСТО шесть")).toEqual({ start: 13, end: 28 });
    expect(locateQuote(text, "чего нет")).toBeNull();
    expect(locateQuote(text, null)).toBeNull();
  });
});
