import { describe, expect, test } from "bun:test";
import {
  LEAD_TIMEOUT_MS,
  leadSinkFromEnv,
  leadTelegramText,
  telegramLeadSink,
  webhookLeadSink,
} from "@/adapters/leads";
import { createRateLimiter, leadResponse, type LeadDeps } from "@/api/leads";
import type { Lead, LeadSink } from "@/ports/leads";

/** Заявки с сайта (ADR-051): адаптеры на подменённом fetch и маршрут без сети */
const LEAD: Lead = {
  name: "Иван",
  company: "ООО Пример",
  phone: "+7 (900) 000-00-00",
  crews: "4-10",
  source: "landing",
  src: "vasya",
  page: "/",
  at: "2026-10-23T10:00:00.000Z",
};

const BODY = {
  name: "Иван",
  company: "ООО Пример",
  phone: "+7 (900) 000-00-00",
  crews: "4-10",
  source: "landing",
  src: "vasya",
  page: "/",
  consent: true,
  website: "",
};

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("адаптеры заявок", () => {
  test("telegram: sendMessage в чат владельца, текст без разметки со всеми полями", async () => {
    const { fetcher, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
    const result = await telegramLeadSink("TOKEN", "42", fetcher).send(LEAD);
    expect(result).toEqual({ ok: true });
    expect(calls[0]!.url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body["chat_id"]).toBe("42");
    expect(body["parse_mode"]).toBeUndefined();
    expect(body["text"]).toBe(leadTelegramText(LEAD));
    expect(String(body["text"])).toContain("Телефон: +7 (900) 000-00-00");
    expect(String(body["text"])).toContain("Источник: лендинг");
    expect(String(body["text"])).toContain("Партнёр: vasya");
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  test("telegram: ответ не 2xx и сбой сети дают failed", async () => {
    const bad = fakeFetch(() => new Response("no", { status: 400 }));
    expect(await telegramLeadSink("T", "1", bad.fetcher).send(LEAD)).toEqual({
      ok: false,
      reason: "failed",
    });
    const down = fakeFetch(() => Promise.reject(new TypeError("network")));
    expect(await telegramLeadSink("T", "1", down.fetcher).send(LEAD)).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  test("тайм-аут: запрос обрывается сигналом, результат failed", async () => {
    const { fetcher } = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("t", "TimeoutError")),
          );
        }),
    );
    const original = AbortSignal.timeout;
    AbortSignal.timeout = () => original.call(AbortSignal, 5);
    try {
      expect(await webhookLeadSink("https://hook.test/x", fetcher).send(LEAD)).toEqual({
        ok: false,
        reason: "failed",
      });
    } finally {
      AbortSignal.timeout = original;
    }
    expect(LEAD_TIMEOUT_MS).toBe(8000);
  });

  test("webhook: POST JSON заявки целиком", async () => {
    const { fetcher, calls } = fakeFetch(() => new Response(null, { status: 200 }));
    expect(await webhookLeadSink("https://hook.test/x", fetcher).send(LEAD)).toEqual({ ok: true });
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(LEAD);
  });

  test("выбор по окружению: telegram, затем webhook, иначе none", () => {
    const env = (vars: Record<string, string>) => (name: string) => vars[name];
    expect(
      leadSinkFromEnv(env({ LEADS_TELEGRAM_BOT_TOKEN: "t", LEADS_TELEGRAM_CHAT_ID: "1" })).kind,
    ).toBe("telegram");
    expect(leadSinkFromEnv(env({ LEADS_TELEGRAM_BOT_TOKEN: "t" })).kind).toBe("none");
    expect(leadSinkFromEnv(env({ LEADS_WEBHOOK_URL: "https://h.test" })).kind).toBe("webhook");
    expect(leadSinkFromEnv(env({ LEADS_WEBHOOK_URL: "javascript:x" })).kind).toBe("none");
    expect(leadSinkFromEnv(env({})).kind).toBe("none");
  });
});

function deps(sink: LeadSink, overrides: Partial<LeadDeps> = {}) {
  const lines: string[] = [];
  const sent: Lead[] = [];
  const wrapped: LeadSink = {
    kind: sink.kind,
    send: (lead) => {
      sent.push(lead);
      return sink.send(lead);
    },
  };
  const value: LeadDeps = {
    sink: () => wrapped,
    allow: createRateLimiter(),
    now: () => new Date("2026-10-23T10:00:00.000Z"),
    log: (line) => lines.push(line),
    ...overrides,
  };
  return { value, lines, sent };
}

const ok: LeadSink = { kind: "webhook", send: async () => ({ ok: true }) };
const none: LeadSink = {
  kind: "none",
  send: async () => ({ ok: false, reason: "not-configured" }),
};
const broken: LeadSink = { kind: "telegram", send: async () => ({ ok: false, reason: "failed" }) };

const request = (body: unknown, ip = "1.1.1.1") =>
  new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/leads", () => {
  test("принято: 204, в журнале источник и код партнёра без имени и телефона", async () => {
    const d = deps(ok);
    const response = await leadResponse(request(BODY), d.value);
    expect(response.status).toBe(204);
    expect(d.sent[0]).toMatchObject({ name: "Иван", src: "vasya", at: "2026-10-23T10:00:00.000Z" });
    expect(d.lines).toHaveLength(1);
    const line = d.lines[0]!;
    expect(JSON.parse(line)).toEqual({
      channel: "lead",
      at: "2026-10-23T10:00:00.000Z",
      source: "landing",
      src: "vasya",
      sink: "webhook",
      ok: true,
    });
    for (const secret of ["Иван", "Пример", "900", "000-00"]) expect(line).not.toContain(secret);
  });

  test("адаптер none: 501 с признаком, журнал без персональных данных", async () => {
    const d = deps(none);
    const response = await leadResponse(request(BODY), d.value);
    expect(response.status).toBe(501);
    expect(await response.json()).toEqual({ sink: "none" });
    expect(d.lines[0]).not.toContain("Иван");
  });

  test("адаптер не доставил: 502", async () => {
    const d = deps(broken);
    expect((await leadResponse(request(BODY), d.value)).status).toBe(502);
    expect(d.lines[0]).not.toContain("900");
  });

  test("ловушка заполнена: 204 без отправки и без журнала", async () => {
    const d = deps(ok);
    const response = await leadResponse(request({ ...BODY, website: "spam.example" }), d.value);
    expect(response.status).toBe(204);
    expect(d.sent).toHaveLength(0);
    expect(d.lines).toHaveLength(0);
  });

  test("неверные данные: 400 без деталей", async () => {
    const d = deps(ok);
    for (const body of [
      "{not json",
      { ...BODY, phone: "123" },
      { ...BODY, name: "" },
      { ...BODY, name: "x".repeat(81) },
      { ...BODY, consent: false },
      { ...BODY, crews: "100" },
      { ...BODY, source: "other" },
      { ...BODY, src: "<script>" },
      { ...BODY, extra: 1 },
    ]) {
      const response = await leadResponse(request(body), d.value);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe("");
    }
    expect(d.sent).toHaveLength(0);
  });

  test("лимит: шестая заявка с IP за час получает 429, другой IP проходит", async () => {
    const d = deps(ok);
    for (let i = 0; i < 5; i += 1) {
      expect((await leadResponse(request(BODY), d.value)).status).toBe(204);
    }
    expect((await leadResponse(request(BODY), d.value)).status).toBe(429);
    expect((await leadResponse(request(BODY, "2.2.2.2"), d.value)).status).toBe(204);
  });

  test("лимит отпускает через час", () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 999)).toBe(false);
    expect(allow("a", 1000)).toBe(true);
  });
});
