/**
 * Сотрудник учёта времени с входом (ADR-069): строка `employees` и `gas_users` с одним
 * идентификатором и ссылка первого входа. Бригадиру нужна бригада из справочника.
 *
 *   DATABASE_URL=… SESSION_SECRET=… bun run db:gas-user --name "Иванова Ольга" \
 *     --phone "+79210000001" --role manager --url "https://ваш-адрес"
 *   … --role foreman --brigade "Бригада 1"
 *
 * Роли: manager (проверка, сметы, справочники), director (неделя, закрытие, выгрузка),
 * foreman (ввод времени своей бригады, без сумм), admin (всё, включая роли).
 */
import { createDriver, driverConfigFromEnv } from "../src/adapters/db";
import { createGasDbStore } from "../src/adapters/gas-ops/db-store";
import { addGasUser, isPilotRole, PILOT_ROLES } from "../src/domain/gas-ops/pilot";
import { arg, complain, createEmployee, inviteLink, phoneOf, warnSecret } from "./gas-pilot-lib";

const name = arg("name");
const role = arg("role") ?? "";
const brigade = arg("brigade") ?? null;
const origin = arg("url") ?? "http://localhost:3000";
if (!name || name.length < 3) complain('Укажите имя: --name "Иванова Ольга"');
if (!isPilotRole(role)) complain(`Укажите роль: --role ${PILOT_ROLES.join("|")}`);
if (role === "foreman" && !brigade) complain('Бригадиру нужна бригада: --brigade "Бригада 1"');
const phone = phoneOf(arg("phone"));

const config = driverConfigFromEnv(process.env);
if (!config) complain("Задайте DATABASE_URL — строку подключения к PostgreSQL");
const driver = createDriver(config);
const timeZone = process.env["APP_TIME_ZONE"]?.trim() || "Europe/Moscow";

try {
  const store = createGasDbStore(driver, { timeZone });
  const snapshot = await store.read();
  const admin = snapshot.users.find((u) => u.role === "admin");
  if (!admin) complain("Компания не заведена: сначала bun run db:gas-init.");
  // Проверка до записи сотрудника входа: бригада и повтор отклоняются без следа в базе
  addGasUser(snapshot, { id: "check", name, role, brigadeName: brigade });
  const [count] = await driver.query<{ n: number }>("select count(*)::int as n from employees");
  const id = await createEmployee(driver, { name, phone, role, order: (count?.n ?? 0) + 1 });
  await store.update((s) => addGasUser(s, { id, name, role, brigadeName: brigade }));
  const link = await inviteLink({ employeeId: id, createdBy: admin.id, phone }, origin);
  console.log(`Заведён: ${name}, роль ${role}${brigade ? `, ${brigade}` : ""}, телефон ${phone}.`);
  console.log(`\nСсылка для первого входа — действует 72 часа, срабатывает один раз:\n${link}\n`);
  warnSecret();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await driver.close();
}
