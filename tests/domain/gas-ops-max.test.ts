import { describe, expect, test } from "bun:test";
import { createMessengerMemory } from "@/adapters/gas-ops/max/memory";
import {
  MAX_SECRET_HEADER,
  createMaxInbound,
  createMaxMessenger,
  parseMaxUpdate,
} from "@/adapters/gas-ops/max/channel";
import { demoInbound } from "@/adapters/gas-ops/max/demo";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import { NOT_LINKED_TEXT, handleInbound, maxWebhookResponse, type MaxDeps } from "@/api/gas-max";
import {
  INVITE_ALPHABET,
  INVITE_LENGTH,
  createInvite,
  inviteCode,
  isNewEvent,
  linkedUserId,
  redeemInvite,
  type MaxLink,
} from "@/domain/gas-ops/max-link";
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import type { InboundEvent, OutboundMessage, OutboundMessenger } from "@/ports/messenger";

/**
 * Бот бригадира в MAX (ADR-061, 14; раздел 6): привязка по одноразовому коду, повтор
 * доставки не создаёт вторую запись, диалог идёт по машине T2 до записи в хранилище.
 */

const NOW = "2026-10-03T18:05:00";

function invite(code: string, userId = "u-foreman-1", now = NOW): MaxLink {
  return createInvite({ id: `ml-${code}`, userId, createdBy: "u-manager", now, code });
}

describe("привязка по одноразовому коду", () => {
  test("код из восьми символов без похожих букв и цифр", () => {
    const code = inviteCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(code).toHaveLength(INVITE_LENGTH);
    expect([...code].every((c) => INVITE_ALPHABET.includes(c))).toBe(true);
    expect(code).not.toMatch(/[01OI]/);
  });

  test("код привязывает аккаунт; повтор тем же человеком не ошибка, другим — «использован»", () => {
    const links = [invite("ABCD2345")];
    const first = redeemInvite(links, { code: "abcd2345", maxUserId: "max-1", now: NOW });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(linkedUserId(first.links, "max-1")).toBe("u-foreman-1");
    expect(redeemInvite(first.links, { code: "ABCD2345", maxUserId: "max-1", now: NOW }).ok).toBe(
      true,
    );
    expect(
      redeemInvite(first.links, { code: "ABCD2345", maxUserId: "max-2", now: NOW }),
    ).toMatchObject({ ok: false, reason: "used" });
  });

  test("неизвестный код, истёкший срок, аккаунт уже у другого сотрудника", () => {
    expect(redeemInvite([], { code: "NOPE2345", maxUserId: "max-1", now: NOW })).toMatchObject({
      ok: false,
      reason: "unknown",
    });
    const old = invite("OLDC2345", "u-foreman-1", "2026-09-28T09:00:00");
    expect(redeemInvite([old], { code: "OLDC2345", maxUserId: "max-1", now: NOW })).toMatchObject({
      ok: false,
      reason: "expired",
    });
    const taken = { ...invite("TAKE2345", "u-manager"), maxUserId: "max-1", linkedAt: NOW };
    expect(
      redeemInvite([taken, invite("NEWC2345")], { code: "NEWC2345", maxUserId: "max-1", now: NOW }),
    ).toMatchObject({ ok: false, reason: "taken" });
  });

  test("новая привязка пользователя снимает прежнюю: действует последняя", () => {
    const before = { ...invite("FRST2345"), maxUserId: "max-old", linkedAt: NOW };
    const result = redeemInvite([before, invite("SCND2345")], {
      code: "SCND2345",
      maxUserId: "max-new",
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(linkedUserId(result.links, "max-old")).toBeNull();
    expect(linkedUserId(result.links, "max-new")).toBe("u-foreman-1");
  });

  test("событие с уже принятым внешним id не новое, пустой id не принимается", () => {
    const seen = new Set(["callback:1"]);
    expect(isNewEvent(seen, "callback:1")).toBe(false);
    expect(isNewEvent(seen, "callback:2")).toBe(true);
    expect(isNewEvent(seen, " ")).toBe(false);
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

function setup(links: MaxLink[] = [invite("ABCD2345")]) {
  const store = memoryStore();
  const state = createMessengerMemory(links);
  const sent: OutboundMessage[] = [];
  const messenger: OutboundMessenger = {
    channel: "demo",
    send: async (message) => {
      sent.push(message);
      return { ok: true, sentAt: NOW };
    },
  };
  const deps: MaxDeps = { store, state, messenger, now: () => NOW };
  let counter = 0;
  const event = (kind: InboundEvent["kind"], payload: string, id?: string): InboundEvent => ({
    channel: "demo",
    externalId: id ?? `ev-${++counter}`,
    channelUserId: "max-1",
    chatId: "chat-1",
    kind,
    payload,
    callbackId: null,
  });
  /** Нажать кнопку последнего ответа по подписи */
  const press = (label: string | RegExp, id?: string) => {
    const last = sent.at(-1)!;
    const button = last.buttons.find(
      (b) =>
        "callback" in b && (typeof label === "string" ? b.label === label : label.test(b.label)),
    );
    if (!button || !("callback" in button)) {
      throw new Error(`Нет кнопки ${label} в «${last.text}»`);
    }
    return handleInbound(deps, event("callback", button.callback, id));
  };
  return { store, state, sent, deps, event, press };
}

describe("обработчик событий бота", () => {
  test("без привязки бот отвечает «Обратитесь к менеджеру» и ничего не записывает", async () => {
    const { deps, event, sent, store } = setup([]);
    const before = store.now().entries.length;
    expect(await handleInbound(deps, event("text", "с 8 до 17"))).toEqual({
      status: "not-linked",
    });
    expect(sent.at(-1)!.text).toBe(NOT_LINKED_TEXT);
    expect(sent.at(-1)!.toChannelUserId).toBe("max-1");
    expect(store.now().entries.length).toBe(before);
  });

  test("неверный код приглашения: причина и без привязки", async () => {
    const { deps, event, sent } = setup();
    expect(await handleInbound(deps, event("start", "WRNG2345"))).toMatchObject({
      status: "invite-refused",
      reason: "unknown",
    });
    expect(sent.at(-1)!.text).toMatch(/Код не найден/);
  });

  test("запуск с кодом, путь кнопками машины T2, запись в хранилище с каналом bot", async () => {
    const { deps, event, sent, store, press, state } = setup();
    const before = store.now().entries.length;
    expect(await handleInbound(deps, event("start", "ABCD2345"))).toMatchObject({
      status: "handled",
    });
    expect(sent.at(-1)!.text).toMatch(/Добрый день, Бригадир 1/);
    await press("Внести время");
    await press(/ОБ-101/);
    await press(/^Сегодня/);
    await press("08:00–17:00");
    await press("60 мин");
    expect(sent.at(-1)!.text).toMatch(/Проверьте запись/);
    const done = await press("Отправить", "send-1");
    expect(done.status).toBe("handled");
    const created = store.now().entries.at(-1)!;
    expect(store.now().entries.length).toBe(before + 1);
    expect(created).toMatchObject({
      brigadeId: "brg-1",
      objectId: "obj-m1",
      minutes: 480,
      channel: "bot",
      status: "pending",
      createdBy: "u-foreman-1",
    });
    expect(done).toEqual({ status: "handled", entryId: created.id });
    expect(sent.at(-1)!.text).toContain(created.number);
    expect((await state.links())[0]!.maxUserId).toBe("max-1");

    // Повторная доставка того же события: не обрабатывается, второй записи нет
    expect(await handleInbound(deps, event("callback", "send", "send-1"))).toEqual({
      status: "duplicate",
    });
    expect(store.now().entries.length).toBe(before + 1);
  });

  test("«Отправить» на старом сообщении после отправки не создаёт вторую запись", async () => {
    const { deps, event, store, press, sent } = setup();
    await handleInbound(deps, event("start", "ABCD2345"));
    await press("Внести время");
    await press(/ОБ-101/);
    await press(/^Сегодня/);
    await press("08:00–17:00");
    await press("60 мин");
    const summary = sent.at(-1)!;
    await press("Отправить");
    const count = store.now().entries.length;
    // Человек нажал «Отправить» на старом сообщении ещё раз: новое событие, диалог уже завершён
    const button = summary.buttons.find((b) => b.label === "Отправить")!;
    await handleInbound(deps, event("callback", "callback" in button ? button.callback : ""));
    expect(store.now().entries.length).toBe(count);
  });

  test("бот принимает время только от бригадира", async () => {
    const { deps, event, sent } = setup([invite("MNGR2345", "u-manager")]);
    expect(await handleInbound(deps, event("start", "MNGR2345"))).toEqual({
      status: "not-foreman",
    });
    expect(sent.at(-1)!.text).toMatch(/от бригадира/);
  });
});

/* ---------------------------------------------------------------- Канал MAX */

describe("канал MAX: каркас без ключей", () => {
  test("вебхук без настройки отвечает 501", async () => {
    const response = await maxWebhookResponse(
      new Request("http://x/api/max/webhook", { method: "POST", body: "{}" }),
      createMaxInbound({}),
      null,
    );
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ code: "not-configured" });
  });

  test("настроенный вебхук: чужой секрет 401, событие уходит в обработчик", async () => {
    const { deps } = setup();
    const inbound = createMaxInbound({ MAX_BOT_TOKEN: "t", MAX_WEBHOOK_SECRET: "s3cret" });
    const body = JSON.stringify({
      update_type: "bot_started",
      timestamp: 1,
      user: { user_id: 77 },
      chat_id: 5,
      payload: "ABCD2345",
    });
    const bad = await maxWebhookResponse(
      new Request("http://x", { method: "POST", body, headers: { [MAX_SECRET_HEADER]: "nope" } }),
      inbound,
      deps,
    );
    expect(bad.status).toBe(401);
    const ok = await maxWebhookResponse(
      new Request("http://x", { method: "POST", body, headers: { [MAX_SECRET_HEADER]: "s3cret" } }),
      inbound,
      deps,
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "handled" });
  });

  test("события MAX в общий вид: запуск, кнопка, текст; служебное — null", () => {
    expect(
      parseMaxUpdate({
        update_type: "message_callback",
        callback: { callback_id: "cb1", payload: "send", user: { user_id: 7 } },
        message: { recipient: { chat_id: 9 } },
      }),
    ).toEqual({
      channel: "max",
      externalId: "callback:cb1",
      channelUserId: "7",
      chatId: "9",
      kind: "callback",
      payload: "send",
      callbackId: "cb1",
    });
    expect(
      parseMaxUpdate({
        update_type: "message_created",
        message: { body: { mid: "m1", text: "с 8 до 17" }, sender: { user_id: 7 }, recipient: {} },
      }),
    ).toMatchObject({ externalId: "message:m1", kind: "text", payload: "с 8 до 17" });
    expect(parseMaxUpdate({ update_type: "user_added" })).toBeNull();
    expect(demoInbound.parse({ externalId: "e", channelUserId: "u", kind: "bogus" })).toBeNull();
  });

  test("отправка без токена ничего не шлёт; с токеном — сообщение с кнопками на адрес MAX", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ message: { body: { mid: "mid-1" } } }));
    }) as unknown as typeof fetch;
    const message: OutboundMessage = {
      key: "k",
      toUserId: "u-foreman-1",
      text: "Был перерыв?",
      buttons: [{ label: "30 мин", callback: "break:30" }],
    };
    const off = createMaxMessenger({ env: {}, channelUserOf: async () => "77", fetch: fake });
    expect(await off.send(message)).toEqual({ ok: false, reason: "Канал MAX не настроен." });
    expect(calls).toHaveLength(0);

    const on = createMaxMessenger({
      env: { MAX_BOT_TOKEN: "token-1" },
      channelUserOf: async () => "77",
      fetch: fake,
      now: () => NOW,
    });
    expect(await on.send(message)).toEqual({ ok: true, sentAt: NOW, messageId: "mid-1" });
    expect(calls[0]!.url).toBe("https://platform-api.max.ru/messages?user_id=77");
    expect((calls[0]!.init.headers as Record<string, string>)["Authorization"]).toBe("token-1");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      text: "Был перерыв?",
      attachments: [
        {
          type: "inline_keyboard",
          payload: { buttons: [[{ type: "callback", text: "30 мин", payload: "break:30" }]] },
        },
      ],
    });
    const unlinked = createMaxMessenger({
      env: { MAX_BOT_TOKEN: "token-1" },
      channelUserOf: async () => null,
      fetch: fake,
    });
    expect(await unlinked.send(message)).toEqual({
      ok: false,
      reason: "Сотрудник не привязан к MAX.",
    });
  });
});
