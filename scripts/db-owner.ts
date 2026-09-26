/**
 * Первый руководитель в пустой базе (ADR-021, поправка от 26.09.2026).
 *
 * Запуск:
 *   DATABASE_URL=… SESSION_SECRET=… bun run db:owner --name "Соколов Артём" --phone "+79210000000"
 *
 * Печатает ссылку-приглашение на 72 часа: первый вход не должен зависеть от канала отправки
 * кодов, которого на внедрении ещё нет. Только в пустую базу — дальше людей заводит сам
 * руководитель на экране «Сотрудники».
 */
import { createDriver, driverConfigFromEnv } from "../src/adapters/db";
import { createInvite, normalizePhone } from "../src/api/auth-store";
import { employeeRole, type EmployeeRole } from "../src/contracts";
import { can as canRole } from "../src/domain/access";

function arg(name: string) {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : process.argv[at + 1];
  return value && !value.startsWith("--") ? value.trim() : undefined;
}

const name = arg("name");
const phoneInput = arg("phone");
const email = arg("email") ?? null;
const position = arg("position") ?? "Руководитель проекта";
const role = (arg("role") ?? "manager") as EmployeeRole;
const origin = (arg("url") ?? "http://localhost:3000").replace(/\/+$/, "");

const complain = (text: string) => {
  console.error(text);
  process.exit(1);
};

if (!name || name.length < 3) {
  complain('Укажите имя: --name "Соколов Артём"');
}
if (!phoneInput) {
  complain('Укажите телефон: --phone "+79210000000" — по нему он будет входить');
}
if (!employeeRole.values.includes(role)) {
  complain(`Роль «${role}» не из матрицы прав. Роли: ${employeeRole.values.join(", ")}`);
}
/*
 * Первым заводится тот, кто сможет завести остальных: без права на «Права доступа» он не
 * пригласит никого, и база останется с одним человеком без выхода из положения.
 */
if (!canRole(role, "access", "write")) {
  const able = employeeRole.values.filter((item) =>
    canRole(item as EmployeeRole, "access", "write"),
  );
  complain(
    `Роль «${role}» не может заводить сотрудников, а первый обязан: иначе пригласить остальных ` +
      `будет некому. Подходящие роли: ${able.join(", ")}`,
  );
}
const phone = normalizePhone(phoneInput!);
if (phone.replace(/\D/g, "").length < 10) {
  complain(`Телефон «${phoneInput}» не похож на номер: нужен код страны и десять цифр`);
}

const config = driverConfigFromEnv(process.env);
if (!config) complain("Задайте DATABASE_URL — строку подключения к PostgreSQL");
const driver = createDriver(config!);

try {
  const [present] = await driver.query<{ n: number }>("select count(*)::int as n from employees");
  if (present && present.n > 0) {
    complain(
      `В базе уже есть сотрудники (${present.n}): первого руководителя заводят только в пустую. ` +
        "Дальше людей заводит он сам на экране «Сотрудники».",
    );
  }
  const id = crypto.randomUUID();
  await driver.query(
    `insert into employees (id, name, position, role, phone, email, telegram, status, row_order)
       values ($1::uuid, $2, $3, $4::employee_role, $5, $6, null, 'active'::employee_status, 1)`,
    [id, name!, position, role, phone, email],
  );
  const token = await createInvite({ employeeId: id, createdBy: id, phone, email });
  const link = `${origin}/login?invite=${token}`;

  console.log(`Заведён: ${name}, ${position}, роль ${role}, телефон ${phone}`);
  console.log(`\nСсылка для первого входа — действует 72 часа, срабатывает один раз:\n${link}\n`);
  if (!process.env["SESSION_SECRET"]) {
    console.log(
      "Внимание: SESSION_SECRET не задан. Сервер должен работать с тем же значением, что и эта\n" +
        "команда, иначе ссылка не подойдёт: токен хранится хэшем с этой солью.",
    );
  }
  console.log(
    "Дальше: откройте ссылку, затем заведите остальных на экране «Сотрудники» — каждому\n" +
      "приглашение своей кнопкой. Порядок внедрения — docs/IMPLEMENTATION.md.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await driver.close();
}
