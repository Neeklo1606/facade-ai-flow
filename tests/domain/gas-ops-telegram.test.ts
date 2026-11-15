import { describe, expect, test } from "bun:test";
import { createMessengerMemory } from "@/adapters/gas-ops/max/memory";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import {
  TELEGRAM_CALLBACK_LIMIT,
  TELEGRAM_SECRET_HEADER,
  createTelegramInbound,
  createTelegramMessenger,
  parseTelegramUpdate,
  resolveTelegramCallback,
  telegramCallbackData,
  telegramChatOf,
  telegramMessageBody,
} from "@/adapters/gas-ops/telegram/channel";
import {
  NOT_LINKED_TEXT,
  handleInbound,
  localNow,
  maxWebhookResponse,
  type MaxDeps,
} from "@/api/gas-max";
import { createInvite, type MaxLink } from "@/domain/gas-ops/max-link";
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import type { OutboundMessage } from "@/ports/messenger";

/**
 * Канал Telegram бота бригадира: разбор обновлений Bot API, секрет вебхука, сообщения
 * с клавиатурой и тот же обработчик, что у MAX: привязка по `/start КОД`, запись времени.
 */

const NOW = "2026-10-03T18:05:00";

const message = (text: string, extra: Record<string, unknown> = {}) => ({
  update_id: 1001,
  message: {
    message_id: 5,
    from: { id: 424242, is_bot: false, first_name: "Иван" },
    chat: { id: 424242, type: "private" },
    date: 1_759_500_000,
    text,
    ...extra,
  },
});

describe("обновления Telegram в общий вид", () => {
  test("/start с кодом — запуск с кодом; id аккаунта с префиксом tg:", () => {
    expect(parseTelegramUpdate(message("/start ABCD2345"))).toEqual({
      channel: "telegram",
      externalId: "tg:update:1001",
      channelUserId: "tg:424242",
      chatId: "424242",
      kind: "start",
      payload: "ABCD2345",
      callbackId: null,
    });
  });

  test("/start без кода и /start@ИмяБота", () => {
    expect(parseTelegramUpdate(message("/start"))).toMatchObject({ kind: "start", payload: "" });
    expect(parseTelegramUpdate(message("/start@gaika_bot ABCD2345"))).toMatchObject({
      kind: "start",
      payload: "ABCD2345",
    });
  });

  test("обычный текст — событие text", () => {
    expect(parseTelegramUpdate(message("с 8 до 17"))).toMatchObject({
      kind: "text",
      payload: "с 8 до 17",
      channelUserId: "tg:424242",
    });
    // «/startup» — не команда запуска
    expect(parseTelegramUpdate(message("/startup"))).toMatchObject({ kind: "text" });
  });

  test("callback_query — нажатие кнопки с callback_data и id для ответа", () => {
    expect(
      parseTelegramUpdate({
        update_id: 1002,
        callback_query: {
          id: "cbq-9",
          from: { id: 424242 },
          message: { message_id: 6, chat: { id: 424242, type: "private" } },
          chat_instance: "x",
          data: "break:30",
        },
      }),
    ).toEqual({
      channel: "telegram",
      externalId: "tg:update:1002",
      channelUserId: "tg:424242",
      chatId: "424242",
      kind: "callback",
      payload: "break:30",
      callbackId: "cbq-9",
    });
  });

  test("группы, сообщения без текста, служебные обновления — null", () => {
    expect(
      parseTelegramUpdate(message("с 8 до 17", { chat: { id: -100, type: "group" } })),
    ).toBeNull();
    expect(
      parseTelegramUpdate({
        update_id: 3,
        message: { message_id: 1, from: { id: 1 }, chat: { id: 1, type: "private" }, photo: [] },
      }),
    ).toBeNull();
    expect(parseTelegramUpdate({ update_id: 4, edited_message: {} })).toBeNull();
    expect(parseTelegramUpdate({})).toBeNull();
    expect(parseTelegramUpdate(null)).toBeNull();
  });
});

describe("секрет вебхука Telegram", () => {
  const inbound = createTelegramInbound({
    TELEGRAM_BOT_TOKEN: "123:abc",
    TELEGRAM_WEBHOOK_SECRET: "s3cret",
  });
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

  test("верный секрет принимается, неверный и пустой — нет", () => {
    expect(inbound.configured).toBe(true);
    expect(inbound.verify(req({ "X-Telegram-Bot-Api-Secret-Token": "s3cret" }))).toBe(true);
    expect(inbound.verify(req({ [TELEGRAM_SECRET_HEADER]: "s3creT" }))).toBe(false);
    expect(inbound.verify(req({ [TELEGRAM_SECRET_HEADER]: "s3cret-longer" }))).toBe(false);
    expect(inbound.verify(req({}))).toBe(false);
  });

  test("без токена или секрета канал не настроен; без секрета ничего не проходит", () => {
    expect(createTelegramInbound({ TELEGRAM_BOT_TOKEN: "t" }).configured).toBe(false);
    expect(createTelegramInbound({ TELEGRAM_WEBHOOK_SECRET: "s" }).configured).toBe(false);
    expect(createTelegramInbound({}).verify(req({ [TELEGRAM_SECRET_HEADER]: "" }))).toBe(false);
  });

  test("вебхук без настройки — 501, чужой секрет — 401", async () => {
    const off = await maxWebhookResponse(
      new Request("http://x/api/telegram/webhook", { method: "POST", body: "{}" }),
      createTelegramInbound({}),
      null,
    );
    expect(off.status).toBe(501);
    expect(await off.json()).toEqual({
      code: "not-configured",
      message: "Канал Telegram не настроен.",
    });
    const { deps } = setup();
    const bad = await maxWebhookResponse(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify(message("/start ABCD2345")),
        headers: { [TELEGRAM_SECRET_HEADER]: "nope" },
      }),
      inbound,
      deps,
    );
    expect(bad.status).toBe(401);
  });
});

describe("сообщения Telegram", () => {
  test("кнопки ответа — callback_data, ссылки — url; относительная ссылка не уходит", () => {
    expect(
      telegramMessageBody({
        text: "Был перерыв?",
        buttons: [
          { label: "30 мин", callback: "break:30" },
          { label: "Открыть табель", to: "https://gaika.example.ru/gas/tabel" },
          { label: "Раздел", to: "/gas/tabel" },
        ],
      }),
    ).toEqual({
      text: "Был перерыв?",
      reply_markup: {
        inline_keyboard: [
          [{ text: "30 мин", callback_data: "break:30" }],
          [{ text: "Открыть табель", url: "https://gaika.example.ru/gas/tabel" }],
        ],
      },
    });
    expect(telegramMessageBody({ text: "Готово", buttons: [] })).toEqual({ text: "Готово" });
  });

  test("callback_data не длиннее 64 байт: длинное значение — отпечаток, находится обратно", () => {
    const long = `answer:${"ж".repeat(40)}`;
    const data = telegramCallbackData(long);
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(TELEGRAM_CALLBACK_LIMIT);
    expect(data.startsWith("#")).toBe(true);
    expect(resolveTelegramCallback(data, ["send", long])).toBe(long);
    expect(resolveTelegramCallback(data, ["send"])).toBeNull();
    expect(telegramCallbackData("break:30")).toBe("break:30");
    expect(resolveTelegramCallback("break:30", [])).toBe("break:30");
  });

  test("id чата только из аккаунта Telegram", () => {
    expect(telegramChatOf("tg:424242")).toBe("424242");
    expect(telegramChatOf("424242")).toBeNull();
    expect(telegramChatOf("tg:abc")).toBeNull();
  });

  test("отправка без токена ничего не шлёт; с токеном — sendMessage на адрес Bot API", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }));
    }) as unknown as typeof fetch;
    const out: OutboundMessage = {
      key: "k",
      toUserId: "u-foreman-1",
      text: "Был перерыв?",
      buttons: [{ label: "30 мин", callback: "break:30" }],
    };
    const off = createTelegramMessenger({
      env: {},
      channelUserOf: async () => "tg:1",
      fetch: fake,
    });
    expect(await off.send(out)).toEqual({ ok: false, reason: "Канал Telegram не настроен." });
    expect(calls).toHaveLength(0);

    const on = createTelegramMessenger({
      env: { TELEGRAM_BOT_TOKEN: "123:abc" },
      channelUserOf: async () => "tg:424242",
      fetch: fake,
      now: () => NOW,
    });
    expect(await on.send(out)).toEqual({ ok: true, sentAt: NOW, messageId: "424242:77" });
    expect(calls[0]!.url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      chat_id: "424242",
      text: "Был перерыв?",
      reply_markup: { inline_keyboard: [[{ text: "30 мин", callback_data: "break:30" }]] },
    });

    // Аккаунт MAX (без префикса) или нет привязки: в Telegram не отправляется
    const maxOnly = createTelegramMessenger({
      env: { TELEGRAM_BOT_TOKEN: "123:abc" },
      channelUserOf: async () => "77",
      fetch: fake,
    });
    expect(await maxOnly.send(out)).toEqual({
      ok: false,
      reason: "Сотрудник не привязан к Telegram.",
    });
    expect(calls).toHaveLength(1);
  });

  test("правка сообщения и ответ на нажатие кнопки", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, result: true }));
    }) as unknown as typeof fetch;
    const tg = createTelegramMessenger({
      env: { TELEGRAM_BOT_TOKEN: "123:abc" },
      channelUserOf: async () => null,
      fetch: fake,
      now: () => NOW,
    });
    expect(await tg.edit!("424242:77", { text: "Отправлено", buttons: [] })).toEqual({
      ok: true,
      sentAt: NOW,
      messageId: "424242:77",
    });
    expect(calls[0]).toEqual({
      url: "https://api.telegram.org/bot123:abc/editMessageText",
      body: {
        chat_id: "424242",
        message_id: 77,
        text: "Отправлено",
        reply_markup: { inline_keyboard: [] },
      },
    });
    await tg.answerCallback!("cbq-9");
    expect(calls[1]).toEqual({
      url: "https://api.telegram.org/bot123:abc/answerCallbackQuery",
      body: { callback_query_id: "cbq-9" },
    });
  });

  test("отказ Telegram и сбой сети: причина без адреса и токена", async () => {
    const refused = createTelegramMessenger({
      env: { TELEGRAM_BOT_TOKEN: "123:abc" },
      channelUserOf: async () => "tg:1",
      fetch: (async () =>
        new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), {
          status: 400,
        })) as unknown as typeof fetch,
    });
    expect(await refused.send({ key: "k", toUserId: "u", text: "x", buttons: [] })).toEqual({
      ok: false,
      reason: "Telegram ответил 400: Bad Request: chat not found",
    });
    const down = createTelegramMessenger({
      env: { TELEGRAM_BOT_TOKEN: "123:abc" },
      channelUserOf: async () => "tg:1",
      fetch: (async () => {
        throw new Error("connect failed https://api.telegram.org/bot123:abc/sendMessage");
      }) as unknown as typeof fetch,
    });
    const result = await down.send({ key: "k", toUserId: "u", text: "x", buttons: [] });
    expect(result).toEqual({ ok: false, reason: "Telegram недоступен." });
  });
});

/* ---------------------------------------------------------------- Обработчик */

function memoryStore(): GasStore & { now(): GasOpsSnapshot } {
  let state = structuredClone(getServerSnapshot());
  return {
    read: async () => state,
    update: async (change) => (state = change(state)),
    now: () => state,
  };
}

function invite(code: string, userId = "u-foreman-1"): MaxLink {
  return createInvite({ id: `ml-${code}`, userId, createdBy: "u-manager", now: NOW, code });
}

/** Обработчик с настоящим адаптером Telegram поверх поддельного Bot API */
function setup(links: MaxLink[] = [invite("ABCD2345")]) {
  const store = memoryStore();
  const state = createMessengerMemory(links);
  const api: { method: string; body: Record<string, unknown> }[] = [];
  let mid = 100;
  const fake = (async (url: string, init: RequestInit) => {
    api.push({ method: url.split("/").at(-1)!, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: ++mid } }));
  }) as unknown as typeof fetch;
  const messenger = createTelegramMessenger({
    env: { TELEGRAM_BOT_TOKEN: "123:abc" },
    channelUserOf: async () => null,
    fetch: fake,
    now: () => NOW,
  });
  const deps: MaxDeps = { store, state, messenger, now: () => NOW };
  let update = 0;
  const send = (text: string) => {
    const event = parseTelegramUpdate({ ...message(text), update_id: ++update })!;
    return handleInbound(deps, event);
  };
  const lastSent = () => api.filter((c) => c.method === "sendMessage").at(-1)!.body;
  /** Нажать кнопку последнего ответа по подписи: callback_query с её callback_data */
  const press = (label: string | RegExp) => {
    const rows = (
      lastSent()["reply_markup"] as { inline_keyboard: { text: string; callback_data: string }[][] }
    ).inline_keyboard;
    const button = rows
      .flat()
      .find((b) => (typeof label === "string" ? b.text === label : label.test(b.text)));
    if (!button) throw new Error(`Нет кнопки ${label} в «${String(lastSent()["text"])}»`);
    const event = parseTelegramUpdate({
      update_id: ++update,
      callback_query: {
        id: `cbq-${update}`,
        from: { id: 424242 },
        message: { message_id: mid, chat: { id: 424242, type: "private" } },
        data: button.callback_data,
      },
    })!;
    return handleInbound(deps, event);
  };
  return { store, state, api, deps, send, press, lastSent };
}

describe("бот в Telegram: от приглашения до записи времени", () => {
  test("без привязки — «Обратитесь к менеджеру» в тот же чат, записи нет", async () => {
    const { send, store, lastSent } = setup([]);
    const before = store.now().entries.length;
    expect(await send("с 8 до 17")).toEqual({ status: "not-linked" });
    expect(lastSent()).toEqual({ chat_id: "424242", text: NOT_LINKED_TEXT });
    expect(store.now().entries.length).toBe(before);
  });

  test("/start КОД привязывает аккаунт tg:, время текстом и кнопками создаёт запись", async () => {
    const { send, press, store, state, api, lastSent } = setup();
    const before = store.now().entries.length;
    expect(await send("/start ABCD2345")).toMatchObject({ status: "handled" });
    expect(String(lastSent()["text"])).toMatch(/Добрый день, Бригадир 1/);
    expect((await state.links())[0]!.maxUserId).toBe("tg:424242");

    await press("Внести время");
    await press(/ОБ-101/);
    await press(/^Сегодня/);
    await press("08:00–17:00");
    await press("60 мин");
    expect(String(lastSent()["text"])).toMatch(/Проверьте запись/);
    const done = await press("Отправить");
    const created = store.now().entries.at(-1)!;
    expect(store.now().entries.length).toBe(before + 1);
    expect(created).toMatchObject({
      brigadeId: "brg-1",
      objectId: "obj-m1",
      minutes: 480,
      channel: "bot",
      createdBy: "u-foreman-1",
    });
    expect(done).toEqual({ status: "handled", entryId: created.id });
    expect(String(lastSent()["text"])).toContain(created.number);
    // Каждое нажатие подтверждено: часики в Telegram не висят
    expect(api.filter((c) => c.method === "answerCallbackQuery")).toHaveLength(6);
    // Все значения кнопок в пределах 64 байт
    for (const call of api.filter((c) => c.method === "sendMessage")) {
      const markup = call.body["reply_markup"] as
        { inline_keyboard: { callback_data?: string }[][] } | undefined;
      for (const b of markup?.inline_keyboard.flat() ?? []) {
        expect(new TextEncoder().encode(b.callback_data ?? "").length).toBeLessThanOrEqual(64);
      }
    }
  });

  test("время одним сообщением после привязки тоже доходит до записи", async () => {
    const { send, press, store, lastSent } = setup();
    await send("/start ABCD2345");
    const before = store.now().entries.length;
    await press("Внести время");
    await press(/ОБ-101/);
    await press(/^Сегодня/);
    // Время текстом вместо кнопок интервала
    await send("с 8 до 17");
    expect(String(lastSent()["text"])).not.toMatch(/Не понял/);
    for (let i = 0; i < 4 && !/Проверьте запись/.test(String(lastSent()["text"])); i += 1) {
      await press(/^60 мин$|^Верно$/);
    }
    expect(String(lastSent()["text"])).toMatch(/Проверьте запись/);
    await press("Отправить");
    expect(store.now().entries.length).toBe(before + 1);
    expect(store.now().entries.at(-1)!).toMatchObject({ minutes: 480, channel: "bot" });
  });

  test("повтор доставки того же update_id не обрабатывается", async () => {
    const { deps } = setup();
    const event = parseTelegramUpdate(message("/start ABCD2345"))!;
    expect(await handleInbound(deps, event)).toMatchObject({ status: "handled" });
    expect(await handleInbound(deps, event)).toEqual({ status: "duplicate" });
  });
});

describe("местное время сервера", () => {
  test("в поясе APP_TIME_ZONE, без пояса в строке", () => {
    expect(localNow("Europe/Moscow", new Date("2026-10-03T15:05:09Z"))).toBe("2026-10-03T18:05:09");
    expect(localNow("UTC", new Date("2026-10-03T23:59:59Z"))).toBe("2026-10-03T23:59:59");
  });
});

describe("ссылка-приглашение в Telegram (ADR-072)", () => {
  test("t.me с кодом в start, без @ в имени бота", async () => {
    const { telegramInviteUrl } = await import("@/domain/gas-ops/max-link");
    expect(telegramInviteUrl("@gaika_bot", "ABCD2345")).toBe(
      "https://t.me/gaika_bot?start=ABCD2345",
    );
  });
});
