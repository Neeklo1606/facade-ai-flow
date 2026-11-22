import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createDriver, fixtureCodec } from "@/adapters/db";

/**
 * Вход под одновременными попытками (ADR-021; план критического тестирования, раздел 2).
 * Ссылка-приглашение пускает одного, а не всех, кто открыл её в один миг; код подтверждения
 * не перебирается сотней параллельных запросов в обход трёх попыток.
 *
 * Нужна база с миграциями: `GAS_SECURITY_DATABASE_URL`. Без неё проверять нечего — вход живёт
 * только с базой, и файл проверяет, что так и сказано (а не молча проходит).
 */

setDefaultTimeout(60_000);

const DB_URL = process.env["GAS_SECURITY_DATABASE_URL"]?.trim() || null;
if (DB_URL) process.env["DATABASE_URL"] = DB_URL;

const store = DB_URL ? await import("@/api/auth-store") : null;
const driver = DB_URL ? createDriver({ kind: "pg", url: DB_URL }) : null;

afterAll(async () => {
  await driver?.close();
});

const codec = fixtureCodec();
const EMPLOYEE = "e-security-race";
const PHONE = "+70000000077";

async function employee(): Promise<void> {
  await driver!.query(`delete from employees where id = $1::uuid`, [codec.encode(EMPLOYEE)]);
  await driver!.query(
    `insert into employees (id, name, position, role, phone, status)
       values ($1::uuid, 'Проверка входа', 'Проверка', (enum_range(null::employee_role))[1],
               $2, (enum_range(null::employee_status))[1])`,
    [codec.encode(EMPLOYEE), PHONE],
  );
}

describe("одновременные попытки входа", () => {
  test("без базы вход недоступен: проверка требует GAS_SECURITY_DATABASE_URL", () => {
    if (DB_URL) return;
    expect(store).toBeNull();
  });

  test("одна ссылка-приглашение, десять одновременных открытий — входит один", async () => {
    if (!store) return;
    await employee();
    const token = await store.createInvite({
      employeeId: EMPLOYEE,
      createdBy: EMPLOYEE,
      phone: PHONE,
      email: null,
    });
    const results = await Promise.all(Array.from({ length: 10 }, () => store.useInvite(token)));
    // Кодек расшифровывает только ключи набора: сотрудник проверки возвращается своим uuid
    expect(results.filter((r) => r !== null)).toEqual([codec.encode(EMPLOYEE)]);
    // Повторно ссылка не пускает
    expect(await store.useInvite(token)).toBeNull();
  });

  test("код: сорок одновременных неверных попыток списывают все три, верный потом не входит", async () => {
    if (!store) return;
    await driver!.query(`delete from auth_codes where phone = $1`, [PHONE]);
    const issued = await store.createCode(PHONE);
    const code = "code" in issued ? issued.code : undefined;
    if (!code) throw new Error("код не выдан");
    const wrong = code === "100000" ? "100001" : "100000";
    const results = await Promise.all(
      Array.from({ length: 40 }, () => store.useCode(PHONE, wrong)),
    );
    expect(results.filter((r) => r === "wrong").length).toBeLessThanOrEqual(2);
    expect(results.every((r) => r === "wrong" || r === "no-attempts")).toBe(true);
    // Попытки кончились: верный код уже не открывает вход
    expect(await store.useCode(PHONE, code)).toBe("no-attempts");
  });

  test("верный код, пять одновременных отправок — вход один раз", async () => {
    if (!store) return;
    await driver!.query(`delete from auth_codes where phone = $1`, [PHONE]);
    const issued = await store.createCode(PHONE);
    const code = "code" in issued ? issued.code : undefined;
    if (!code) throw new Error("код не выдан");
    const results = await Promise.all(Array.from({ length: 5 }, () => store.useCode(PHONE, code)));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });
});
