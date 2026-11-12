/**
 * Общее для команд пилота (ADR-069): сотрудник входа и приглашение. Сотрудник учёта времени
 * получает тот же идентификатор, что строка `employees`: по нему сервер узнаёт его роль.
 */
import type { createDriver } from "../src/adapters/db";
import { createInvite, normalizePhone } from "../src/api/auth-store";
import { EMPLOYEE_ROLE_FOR, type PilotRole } from "../src/domain/gas-ops/pilot";

type Driver = ReturnType<typeof createDriver>;

export function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : process.argv[at + 1];
  return value && !value.startsWith("--") ? value.trim() : undefined;
}

export function complain(text: string): never {
  console.error(text);
  process.exit(1);
}

export function phoneOf(input: string | undefined): string {
  if (!input) complain('Укажите телефон: --phone "+79210000000" — по нему человек входит');
  const phone = normalizePhone(input);
  if (phone.replace(/\D/g, "").length < 10) {
    complain(`Телефон «${input}» не похож на номер: нужен код страны и десять цифр`);
  }
  return phone;
}

export const POSITION: Record<PilotRole, string> = {
  admin: "Руководитель",
  manager: "Менеджер проверки",
  director: "Руководитель",
  foreman: "Бригадир",
};

/** Завести сотрудника входа; повтор телефона отклоняется */
export async function createEmployee(
  driver: Driver,
  input: { name: string; phone: string; role: PilotRole; order: number },
): Promise<string> {
  const [taken] = await driver.query<{ name: string }>(
    "select name from employees where phone = $1 limit 1",
    [input.phone],
  );
  if (taken) complain(`Телефон ${input.phone} уже у сотрудника «${taken.name}».`);
  const id = crypto.randomUUID();
  await driver.query(
    `insert into employees (id, name, position, role, phone, email, telegram, status, row_order)
       values ($1::uuid, $2, $3, $4::employee_role, $5, null, null, 'active'::employee_status, $6)`,
    [id, input.name, POSITION[input.role], EMPLOYEE_ROLE_FOR[input.role], input.phone, input.order],
  );
  return id;
}

/** Ссылка первого входа на 72 часа: после входа человек попадает сразу в учёт времени */
export async function inviteLink(
  input: { employeeId: string; createdBy: string; phone: string },
  origin: string,
): Promise<string> {
  const token = await createInvite({ ...input, email: null });
  return `${origin.replace(/\/+$/, "")}/login?invite=${token}&to=%2Fgas`;
}

export function warnSecret() {
  if (!process.env["SESSION_SECRET"]) {
    console.log(
      "Внимание: SESSION_SECRET не задан. Сервер должен работать с тем же значением, что и эта\n" +
        "команда, иначе ссылка не подойдёт: токен хранится хэшем с этой солью.",
    );
  }
}
