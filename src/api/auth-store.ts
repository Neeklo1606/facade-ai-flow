import { createDriver, driverConfigFromEnv, fixtureCodec, type Driver } from "@/adapters/db";
import { serverEnv } from "@/lib/runtime-env";

/**
 * Хранилище входа (ADR-021, п. 9). Отдельно от репозиториев предметной области: коды, сессии
 * и приглашения — инфраструктура сервера. В демо-контуре этого модуля нет вовсе.
 *
 * Правила границ здесь же, а не в вызывающем коде: срок кода, число попыток, частота запросов.
 * Иначе первый же новый вызов их обойдёт.
 */

const CODE_TTL_MIN = 5;
const CODE_ATTEMPTS = 3;
const CODE_PER_HOUR = 5;
const SESSION_DAYS = 30;
/** Продлеваем, когда до конца меньше недели: иначе каждый запрос писал бы в базу */
const RENEW_WHEN_LEFT_DAYS = 7;
const INVITE_HOURS = 72;

let driver: Driver | null = null;

/**
 * Вход работает в рабочем контуре и только с базой: без неё сессию негде хранить и выход
 * нечем завершить. Контур — из сборки, а не из окружения: иначе задать `DATABASE_URL` рядом
 * с демонстрацией значило бы потребовать вход у зрителя показа (ADR-021, п. 6).
 */
export function authAvailable() {
  if (import.meta.env.VITE_DATA_SOURCE !== "server") return false;
  const env = typeof process === "undefined" ? {} : process.env;
  return !!driverConfigFromEnv(env);
}

function db(): Driver {
  if (driver) return driver;
  const env = typeof process === "undefined" ? {} : process.env;
  const config = driverConfigFromEnv(env);
  if (!config) throw new Error("Вход без базы невозможен: задайте DATABASE_URL");
  driver = createDriver(config);
  return driver;
}

/**
 * В базе ключи — uuid, в приложении читаемые (`e-volkova`): тот же кодек, что у адаптера
 * базы (ADR-005, п. 4). Без него сессия писалась бы с чужим идентификатором и падала
 * на вставке — так и случилось при первой проверке входа.
 */
const codec = fixtureCodec();
const toDb = (id: string) => codec.encode(id);
const fromDb = (id: string) => codec.decode(id);

const encoder = new TextEncoder();

/** Хэш кода и токена: журнал базы не должен давать вход (ADR-021, границы) */
async function hash(value: string) {
  const salt = serverEnv("SESSION_SECRET") ?? serverEnv("DEMO_ACCESS_KEY") ?? "fieldops";
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${value}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Шесть цифр: диктуются по телефону и набираются в перчатках */
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100_000 + ((bytes[0] ?? 0) % 900_000));
}

/** Токен приглашения: 32 знака из адресной строки без путаницы в регистре */
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes]
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Телефон в один вид: по нему ищут сотрудника, а вводят его как придётся */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const ten =
    digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))
      ? digits.slice(1)
      : digits;
  return ten.length === 10 ? `+7${ten}` : `+${digits}`;
}

export type CodeRefusal = "too-often" | "no-attempts" | "wrong" | "expired";

/** Сколько кодов запрошено на телефон за час: защита от перебора и от счёта за SMS */
export async function codesLastHour(phone: string) {
  const rows = await db().query<{ count: string }>(
    `select count(*)::text as count from auth_codes
       where phone = $1 and created_at > now() - interval '1 hour'`,
    [phone],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function createCode(phone: string) {
  if ((await codesLastHour(phone)) >= CODE_PER_HOUR) return { refusal: "too-often" as const };
  const code = newCode();
  await db().query(
    `insert into auth_codes (phone, code_hash, attempts_left, expires_at)
       values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [phone, await hash(code), CODE_ATTEMPTS, String(CODE_TTL_MIN)],
  );
  return { code };
}

/** Проверка кода: одна попытка списывается всегда, иначе перебор бесплатен */
export async function useCode(phone: string, code: string): Promise<CodeRefusal | "ok"> {
  const rows = await db().query<{ id: string; code_hash: string; attempts_left: number }>(
    `select id, code_hash, attempts_left from auth_codes
       where phone = $1 and used_at is null and expires_at > now()
       order by created_at desc limit 1`,
    [phone],
  );
  const row = rows[0];
  if (!row) return "expired";
  if (row.attempts_left <= 0) return "no-attempts";
  if (row.code_hash !== (await hash(code))) {
    await db().query(`update auth_codes set attempts_left = attempts_left - 1 where id = $1`, [
      row.id,
    ]);
    return row.attempts_left <= 1 ? "no-attempts" : "wrong";
  }
  await db().query(`update auth_codes set used_at = now() where id = $1`, [row.id]);
  return "ok";
}

/** Новая сессия сотрудника. Истёкшие чистятся здесь же: отдельного задания заводить не за чем */
export async function openSession(employeeId: string, userAgent: string | null) {
  await db().query(`delete from auth_sessions where expires_at < now() - interval '30 days'`);
  const rows = await db().query<{ id: string }>(
    `insert into auth_sessions (employee_id, expires_at, user_agent)
       values ($1, now() + ($2 || ' days')::interval, $3) returning id::text as id`,
    [toDb(employeeId), String(SESSION_DAYS), userAgent?.slice(0, 200) ?? null],
  );
  return rows[0]!.id;
}

/** Сотрудник живой сессии. Продление при активности — здесь, а не в вызывающем коде */
export async function sessionEmployee(sessionId: string) {
  const rows = await db().query<{ employee_id: string; close: boolean }>(
    `select employee_id::text as employee_id,
            expires_at < now() + ($2 || ' days')::interval as close
       from auth_sessions
       where id = $1::uuid and revoked_at is null and expires_at > now()`,
    [sessionId, String(RENEW_WHEN_LEFT_DAYS)],
  );
  const row = rows[0];
  if (!row) return null;
  await db().query(
    row.close
      ? `update auth_sessions set last_seen_at = now(),
           expires_at = now() + ($2 || ' days')::interval where id = $1::uuid`
      : `update auth_sessions set last_seen_at = now() where id = $1::uuid`,
    row.close ? [sessionId, String(SESSION_DAYS)] : [sessionId],
  );
  return fromDb(row.employee_id);
}

/** Выход: сессия гаснет на сервере, а не только в браузере (ADR-021, п. 4) */
export async function closeSession(sessionId: string) {
  await db().query(`update auth_sessions set revoked_at = now() where id = $1::uuid`, [sessionId]);
}

/** Все сессии сотрудника: выключение доступа на экране пользователей */
export async function closeEmployeeSessions(employeeId: string) {
  await db().query(
    `update auth_sessions set revoked_at = now()
       where employee_id = $1::uuid and revoked_at is null`,
    [toDb(employeeId)],
  );
}

export async function createInvite(input: {
  employeeId: string;
  createdBy: string;
  phone: string | null;
  email: string | null;
}) {
  const token = newToken();
  // Живое приглашение на сотрудника всегда одно: новое гасит прежнее (ADR-021, п. 8)
  await db().query(
    `update auth_invites set revoked_at = now()
       where employee_id = $1::uuid and accepted_at is null and revoked_at is null`,
    [toDb(input.employeeId)],
  );
  await db().query(
    `insert into auth_invites (employee_id, token_hash, phone, email, created_by, expires_at)
       values ($1::uuid, $2, $3, $4, $5::uuid, now() + ($6 || ' hours')::interval)`,
    [
      toDb(input.employeeId),
      await hash(token),
      input.phone,
      input.email,
      toDb(input.createdBy),
      String(INVITE_HOURS),
    ],
  );
  return token;
}

/** Принять приглашение: возвращает сотрудника или null, если ссылка гашена или просрочена */
export async function useInvite(token: string) {
  const rows = await db().query<{ id: string; employee_id: string }>(
    `select id::text as id, employee_id::text as employee_id from auth_invites
       where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > now()`,
    [await hash(token)],
  );
  const row = rows[0];
  if (!row) return null;
  await db().query(`update auth_invites set accepted_at = now() where id = $1::uuid`, [row.id]);
  return fromDb(row.employee_id);
}

/** Состояние приглашений для экрана пользователей */
export async function invitesByEmployee() {
  const rows = await db().query<{
    employee_id: string;
    expires_at: string;
    accepted_at: string | null;
  }>(
    `select employee_id::text as employee_id, expires_at::text, accepted_at::text
       from auth_invites where revoked_at is null`,
  );
  return rows.map((row) => ({ ...row, employee_id: fromDb(row.employee_id) }));
}

/** Последняя активность сотрудника: экран пользователей показывает, кто вошёл хоть раз */
export async function lastSeenByEmployee() {
  const rows = await db().query<{ employee_id: string; last_seen_at: string }>(
    `select employee_id::text as employee_id, max(last_seen_at)::text as last_seen_at
       from auth_sessions where revoked_at is null group by employee_id`,
  );
  return rows.map((row) => ({ ...row, employee_id: fromDb(row.employee_id) }));
}
