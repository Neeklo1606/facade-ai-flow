import { afterEach, describe, expect, test } from "bun:test";
import { createOpenAiCompatibleGateway, type LlmConfig } from "@/adapters/ai";
import { SAMPLE_CONTEXT } from "@/ai/samples/context";
import { result, stated, unknown } from "@/ai/samples/fields";

/**
 * Невалидный ответ модели не применяется (GAIKA_AI_GATEWAY.md, раздел 7; ADR-035, п. 2).
 *
 * Это главная граница шлюза: между моделью и черновиком стоит схема, и всё, что её не прошло,
 * становится отказом с причиной, а не записью в учёте. Живая модель здесь не вызывается —
 * вместо неё подставляется ответ, какой бывает в жизни: не JSON, чужая форма, ошибка сервера.
 */

const config: LlmConfig = {
  provider: "deepseek",
  baseUrl: "https://example.invalid/v1",
  apiKey: "test-key-not-real",
  model: "deepseek-chat",
  cheapModel: undefined,
  timeoutMs: 5000,
  maxAudioSec: 180,
  speech: undefined,
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Подменить ответ модели один раз и запомнить, что именно ушло в запросе */
function respondWith(body: unknown, init: { status?: number; raw?: string } = {}) {
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, request?: RequestInit) => {
    calls.push({
      url: String(input),
      body: request?.body ? JSON.parse(String(request.body)) : null,
    });
    const text = init.raw ?? JSON.stringify(body);
    return new Response(text, {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return calls;
}

const ask = (gateway: ReturnType<typeof createOpenAiCompatibleGateway>) =>
  gateway.extract({
    message: "Секция Б, лоток двадцать четыре метра",
    context: SAMPLE_CONTEXT,
    sourceId: null,
  });

const chat = (content: unknown) => ({
  choices: [
    { message: { content: typeof content === "string" ? content : JSON.stringify(content) } },
  ],
  usage: { prompt_tokens: 1200, completion_tokens: 300 },
});

describe("ответ модели не прошёл схему", () => {
  test("ответ не разобрался как JSON: отказ, а не черновик", async () => {
    respondWith(chat("Конечно! Вот ваш отчёт по смене:"));
    const answer = await ask(createOpenAiCompatibleGateway(config));
    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.reason).toContain("JSON");
    expect(answer.job.status).toBe("invalid");
    expect(answer.job.refusal).not.toBeNull();
  });

  test("чужая форма ответа не применяется", async () => {
    respondWith(chat({ объёмы: [{ лоток: 24 }] }));
    const answer = await ask(createOpenAiCompatibleGateway(config));
    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.reason).toContain("схему");
    expect(answer.job.status).toBe("invalid");
  });

  test("значение без фразы-источника не применяется: правило 2", async () => {
    respondWith(
      chat({
        workRecords: [
          {
            zone: stated("B", "секция Б"),
            workTypeCode: stated("tray", "лоток"),
            // Модель назвала объём, но не сказала, откуда он взялся
            quantity: { value: 24, basis: "stated", attention: null, provenance: null },
            unit: stated("пог. м", "метра"),
            people: unknown(),
            hours: unknown(),
          },
        ],
        tasks: [],
        risks: [],
        plannedTomorrow: [],
        clarifications: [],
      }),
    );
    const answer = await ask(createOpenAiCompatibleGateway(config));
    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.job.status).toBe("invalid");
  });

  test("выдуманная единица измерения не применяется", async () => {
    respondWith(
      chat({
        workRecords: [
          {
            zone: stated("B", "секция Б"),
            workTypeCode: stated("tray", "лоток"),
            quantity: stated(24, "двадцать четыре метра"),
            unit: { value: 7, basis: "stated", attention: null, provenance: { quote: "метра" } },
            people: unknown(),
            hours: unknown(),
          },
        ],
        tasks: [],
        risks: [],
        plannedTomorrow: [],
        clarifications: [],
      }),
    );
    const answer = await ask(createOpenAiCompatibleGateway(config));
    expect(answer.ok).toBe(false);
  });

  test("ошибка сервера провайдера: отказ с причиной, статус failed", async () => {
    respondWith(null, { status: 503, raw: "upstream is down" });
    const answer = await ask(createOpenAiCompatibleGateway(config));
    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.job.status).toBe("failed");
    expect(answer.job.refusal).toContain("503");
  });
});

describe("валидный ответ применяется и записывается", () => {
  test("разбор возвращается, токены и стоимость попадают в журнал", async () => {
    const calls = respondWith(
      chat(
        result({
          workRecords: [
            {
              zone: stated("B", "секция Б"),
              workTypeCode: stated("tray", "лоток"),
              quantity: stated(24, "двадцать четыре метра"),
              unit: stated("пог. м", "метра"),
              people: unknown(),
              hours: unknown(),
            },
          ],
        }),
      ),
    );
    const answer = await ask(createOpenAiCompatibleGateway(config));
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value.workRecords[0]?.quantity.value).toBe(24);
    expect(answer.job.status).toBe("ok");
    expect(answer.job.tokensIn).toBe(1200);
    expect(answer.job.tokensOut).toBe(300);
    // Цена известной модели считается по прайсу, а не выдумывается:
    // 1200 токенов запроса по 2700 коп./млн и 300 ответа по 10900 коп./млн — 6,51 коп.
    expect(answer.job.costKopecks).toBe(7);

    // В запрос ушёл контекст объекта и режим JSON, а ключ остался в заголовке
    const body = calls[0]?.body as { response_format?: { type?: string }; messages?: unknown[] };
    expect(body.response_format?.type).toBe("json_object");
    expect(JSON.stringify(body.messages)).toContain("Секция Б, оси 8-14");
    expect(JSON.stringify(body.messages)).not.toContain("test-key-not-real");
  });
});
