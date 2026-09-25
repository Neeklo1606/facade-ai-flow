import { describe, expect, test } from "bun:test";
import { normalizePhone, newCode } from "@/api/auth-store";
import { PERSONA_PREFIX, SESSION_PREFIX, signSession, verifySession } from "@/lib/session-token";

/**
 * Вход (ADR-021). Проверяется то, что молча ломает вход целиком: приведение телефона
 * и разбор значения куки. Оба места уже подводили — кука приходит процентно-закодированной,
 * и приставка `s:` не узнавалась, отчего вход «срабатывал», а сессии не было.
 */

describe("телефон", () => {
  test("один вид из всего, что набирают руками", () => {
    const same = ["+7 921 655-27-84", "8 921 655 27 84", "79216552784", "+7(921)655-27-84"];
    for (const value of same) expect(normalizePhone(value), value).toBe("+79216552784");
  });

  test("чужой формат не превращается молча в российский", () => {
    expect(normalizePhone("+380 44 000-00-00")).toBe("+380440000000");
  });
});

describe("код подтверждения", () => {
  test("шесть цифр", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/u);
  });
});

describe("значение сессии", () => {
  test("приставка сессии переживает процентное кодирование куки", async () => {
    const signed = await signSession(`${SESSION_PREFIX}0ddac062-3a8a-4cd9-8748-d8bfd685ded0`);
    const asCookie = encodeURIComponent(signed);
    expect(asCookie).not.toBe(signed);
    expect(await verifySession(asCookie)).toBe(
      `${SESSION_PREFIX}0ddac062-3a8a-4cd9-8748-d8bfd685ded0`,
    );
  });

  test("персона демонстрации читается так же", async () => {
    const signed = await signSession(`${PERSONA_PREFIX}e-volkova`);
    expect(await verifySession(signed)).toBe(`${PERSONA_PREFIX}e-volkova`);
  });

  test("подделанная подпись не проходит", async () => {
    const signed = await signSession(`${SESSION_PREFIX}0ddac062-3a8a-4cd9-8748-d8bfd685ded0`);
    const other = signed.replace(`${SESSION_PREFIX}0ddac062`, `${SESSION_PREFIX}1ddac062`);
    expect(await verifySession(other)).toBeNull();
  });
});
