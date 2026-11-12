/**
 * Рабочий контур учёта времени в пустой базе (ADR-069): компания без демо-набора и первый
 * администратор со ссылкой входа. Дальше бригады, объекты и сметы он загружает сам на экранах.
 *
 * Запуск после `bun run db:migrate`:
 *   DATABASE_URL=… SESSION_SECRET=… bun run db:gas-init --name "Соколов Артём" \
 *     --phone "+79210000000" --group "1. Стальные" --url "https://ваш-адрес"
 *
 * Только в пустую базу: если пользователи или объекты учёта времени уже есть, команда
 * останавливается и ничего не пишет.
 */
import { createDriver, driverConfigFromEnv } from "../src/adapters/db";
import { createGasDbStore } from "../src/adapters/gas-ops/db-store";
import { emptyCompany, localDay, weekOf } from "../src/domain/gas-ops/pilot";
import { arg, complain, createEmployee, inviteLink, phoneOf, warnSecret } from "./gas-pilot-lib";

const name = arg("name");
const group = arg("group") ?? "Бригады";
const origin = arg("url") ?? "http://localhost:3000";
if (!name || name.length < 3) complain('Укажите имя: --name "Соколов Артём"');
const phone = phoneOf(arg("phone"));

const config = driverConfigFromEnv(process.env);
if (!config) complain("Задайте DATABASE_URL — строку подключения к PostgreSQL");
const driver = createDriver(config);
const timeZone = process.env["APP_TIME_ZONE"]?.trim() || "Europe/Moscow";

try {
  const [present] = await driver.query<{ users: number; objects: number }>(
    "select (select count(*)::int from gas_users) as users, (select count(*)::int from gas_objects) as objects",
  );
  if (present && (present.users > 0 || present.objects > 0)) {
    complain(
      `В базе уже есть учёт времени (пользователей ${present.users}, объектов ${present.objects}). ` +
        "Компанию заводят только в пустую базу; людей добавляет команда db:gas-user.",
    );
  }
  const id = await createEmployee(driver, { name, phone, role: "admin", order: 1 });
  const today = localDay(new Date(), timeZone);
  await createGasDbStore(driver, { timeZone }).seed(
    emptyCompany({ today, groupName: group, owner: { id, name } }),
  );
  const link = await inviteLink({ employeeId: id, createdBy: id, phone }, origin);
  const week = weekOf(today);
  console.log(`Компания заведена: подразделение «${group}», неделя ${week.from} – ${week.to}.`);
  console.log(`Администратор: ${name}, телефон ${phone}.`);
  console.log(`\nСсылка для первого входа — действует 72 часа, срабатывает один раз:\n${link}\n`);
  warnSecret();
  console.log(
    "Дальше: «Данные» → бригады и сотрудники из Excel, затем менеджеров и бригадиров\n" +
      'заводит команда db:gas-user --role manager|director|foreman [--brigade "Бригада 1"].',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await driver.close();
}
