import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { authChannel } from "./auth-channel";
import {
  authAvailable,
  closeSession,
  createCode,
  normalizePhone,
  openSession,
  useCode,
  useInvite,
} from "./auth-store";
import { clearSessionCookie, currentSessionId, grantAuthSession } from "./session";
import { serverRepositories } from "./server-repositories";

/**
 * Вход сотрудника (ADR-021). Экран входа знает об учётных записях ровно столько, сколько знает
 * посторонний: ответ на известный и неизвестный телефон одинаковый. Иначе форма входа
 * превращается в способ узнать, кто работает в компании.
 */

const phoneInput = z.object({ phone: z.string().min(6).max(32) });
const codeInput = phoneInput.extend({ code: z.string().min(4).max(8) });

async function employeeByPhone(phone: string) {
  const employees = await serverRepositories().directory.employees();
  return employees.find((item) => normalizePhone(item.phone) === phone && item.status === "active");
}

/** Запросить код. Отвечает одинаково, есть такой сотрудник или нет */
export const requestCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => phoneInput.parse(input))
  .handler(async ({ data }) => {
    if (!authAvailable()) return { ok: false as const, reason: "no-database" as const };
    const phone = normalizePhone(data.phone);
    const employee = await employeeByPhone(phone);
    if (!employee) return { ok: true as const, shown: null };
    const created = await createCode(phone);
    if ("refusal" in created) return { ok: false as const, reason: created.refusal };
    const channel = authChannel();
    const sent = await channel.sendCode(phone, created.code);
    // Заглушка возвращает код: экран покажет его и скажет, что SMS не подключены
    return { ok: true as const, shown: channel.kind === "log" ? sent.shown : null };
  });

/** Проверить код и открыть сессию */
export const verifyCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => codeInput.parse(input))
  .handler(async ({ data }) => {
    if (!authAvailable()) return { ok: false as const, reason: "no-database" as const };
    const phone = normalizePhone(data.phone);
    const employee = await employeeByPhone(phone);
    const result = await useCode(phone, data.code.trim());
    if (result !== "ok" || !employee) {
      return { ok: false as const, reason: result === "ok" ? "wrong" : result };
    }
    const sessionId = await openSession(
      employee.id,
      getRequest().headers.get("user-agent") ?? null,
    );
    await grantAuthSession(sessionId);
    return { ok: true as const };
  });

/** Войти по одноразовой ссылке приглашения */
export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(input))
  .handler(async ({ data }) => {
    if (!authAvailable()) return { ok: false as const, reason: "no-database" as const };
    const employeeId = await useInvite(data.token);
    if (!employeeId) return { ok: false as const, reason: "expired" as const };
    const sessionId = await openSession(employeeId, getRequest().headers.get("user-agent") ?? null);
    await grantAuthSession(sessionId);
    return { ok: true as const };
  });

/** Выход: сессия гаснет на сервере, кука снимается */
export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const sessionId = await currentSessionId();
  if (sessionId && authAvailable()) await closeSession(sessionId);
  clearSessionCookie();
  return { ok: true as const };
});

/** Нужен ли вход: экран входа спрашивает это до того, как показать форму */
export const authStateFn = createServerFn({ method: "GET" }).handler(async () => ({
  required: authAvailable(),
  channel: authAvailable() ? authChannel().kind : null,
}));
