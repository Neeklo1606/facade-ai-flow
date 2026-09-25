/**
 * Первая неделя на чистой базе, рабочий контур: то, что описано в docs/IMPLEMENTATION.md.
 * Запуск: node .verify/first-week/week.mjs "<ссылка приглашения>"
 * Снимки и журнал — рядом с этим файлом.
 */
import { chromium } from "playwright";
import writeXlsxFile from "write-excel-file/node";
import { mkdir } from "node:fs/promises";
import { loginByPhone } from "./login.mjs";

const base = process.env.BASE ?? "http://localhost:4712";
const invite = process.argv[2];
const out = ".verify/first-week";
await mkdir(out, { recursive: true });

const log = [];
const step = (text) => {
  log.push(text);
  console.log(text);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
page.on("console", (message) => {
  if (message.type() === "error") log.push(`КОНСОЛЬ: ${message.text()}`);
});
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
};
/** Окно важнее страницы: у фильтров за ним бывают те же метки */
const scope = async () => {
  const dialog = page.getByRole("dialog");
  return (await dialog.count()) ? dialog.first() : page;
};
const click = async (name, options = {}) => {
  const target = (await scope()).getByRole("button", { name, ...options }).first();
  await target.waitFor({ state: "visible", timeout: 15000 });
  await target.click();
  await page.waitForTimeout(600);
};
const fill = async (label, value) => {
  const field = (await scope()).getByLabel(label, { exact: false }).first();
  await field.waitFor({ state: "visible", timeout: 15000 });
  await field.fill(String(value));
};

/* ---------- День 1: вход первого руководителя ---------- */
if (invite) {
  await page.goto(invite, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await click(/Войти по приглашению/);
  await page.waitForTimeout(2500);
  step(`1. Вход по ссылке приглашения: ${page.url()}`);
} else {
  const entered = await loginByPhone(page, base, "+79216552784");
  step(`1. Вход по телефону и коду ${entered.code}: ${entered.url}`);
}
await shot("w01-vhod");

/* ---------- День 2: объект ---------- */
await page.goto(`${base}/projects`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await click(/Добавить объект/);
await page.waitForTimeout(600);
await fill("Название", "ЖК Поморье, корпус 2");
await fill("Код", "ПМР-2");
await fill("Регион", "Архангельская область");
await fill("Заказчик", "ООО «Северный дом»");
await fill("Договор", "ПД-2026/14");
const dates = (await scope()).locator('input[type="date"]');
if (await dates.count()) {
  await dates.nth(0).fill("2026-09-01");
  if ((await dates.count()) > 1) await dates.nth(1).fill("2027-06-30");
}
await shot("w02-obekt-forma");
await click(/^Создать объект$/);
await page.waitForTimeout(2500);
step(`2. Объект создан: ${page.url()}`);
// Создание ведёт прямо на карточку: её адрес и есть адрес объекта
const projectPath = new URL(page.url()).pathname.replace(/\/$/, "");
await shot("w03-obekt");

/* ---------- День 2: категории и номенклатура ---------- */
await page.goto(`${base}/catalogs`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await click(/Категория верхнего уровня/);
await fill("Название", "Подконструкция");
await click(/^Создать$/);
await page.waitForTimeout(1200);
step("3. Категория верхнего уровня создана");
await shot("w04-kategoriya");

const file = `${out}/nomenklatura.xlsx`;
const written = await writeXlsxFile(
  [
    ["Наименование", "Ед. изм.", "Категория"],
    ["Кронштейн КР-150 оцинкованный", "шт", "Подконструкция"],
    ["Профиль Т-образный 3 м", "м", "Подконструкция"],
    ["Анкер клиновой 10×100", "шт", "Подконструкция"],
    ["", "шт", "Подконструкция"],
  ].map((row) => row.map((value) => ({ type: String, value }))),
);
await written.toFile(file);
await click(/Загрузить из Excel/);
await (await scope()).locator("input[type=file]").setInputFiles(file);
await page.waitForTimeout(900);
await shot("w05-nomenklatura-mastera");
await click(/^Загрузить \d+$/);
await page.waitForTimeout(1800);
const importText = await page.locator("body").innerText();
step(`4. Номенклатура загружена: ${importText.match(/Добавлено[^\n]*/)?.[0] ?? "нет строки итога"}`);
step(`   непринятые: ${importText.match(/строка \d+ — [^\n]*/g)?.join("; ") ?? "нет"}`);
await shot("w06-nomenklatura-itog");
await click(/Готово/);
await page.waitForTimeout(800);

/* ---------- День 2: поставщик ---------- */
step(`   адрес объекта: ${projectPath}`);
await page.goto(`${base}${projectPath}/procurement?view=suppliers`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(1500);
await click(/Завести поставщика/);
await page.waitForTimeout(600);
await fill("Наименование", "ООО «Фасадкомплект Север»");
await fill("Регион поставки", "Архангельская область");
await fill("Контактное лицо", "Пименов Олег");
await fill("Телефон", "+7 921 100-20-30");
await fill("Почта для запросов", "zakaz@fasadkomplekt.example");
const checkbox = (await scope()).getByRole("checkbox", { name: /Подконструкция/ }).first();
if (await checkbox.count()) await checkbox.check();
await shot("w07-postavshchik-forma");
await click(/^Завести$/);
await page.waitForTimeout(2000);
step("5. Поставщик заведён");
await shot("w08-postavshchiki");

/* ---------- День 3: сотрудники и приглашения ---------- */
await page.goto(`${base}/users`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const people = [
  ["Волкова Ирина", "Инженер ПТО", "+79210000011", "pto"],
  ["Дорохов Пётр", "Начальник снабжения", "+79210000012", "supply"],
  ["Гареев Ильдар", "Прораб", "+79210000013", "foreman"],
];
for (const [name, position, phone, role] of people) {
  await click(/Завести сотрудника/);
  await page.waitForTimeout(500);
  await fill("ФИО", name);
  await fill("Должность", position);
  await fill("Телефон", phone);
  const select = (await scope()).getByLabel("Роль").first();
  if (await select.count()) await select.selectOption(role).catch(() => {});
  // Объекты сотрудника: прорабу и ПТО нужен доступ к нашему объекту
  const project = (await scope()).getByRole("checkbox").first();
  if (await project.count()) await project.check().catch(() => {});
  await click(/^Завести$|^Сохранить$/);
  await page.waitForTimeout(1500);
}
step(`6. Заведено сотрудников: ${people.length}`);
await shot("w09-sotrudniki");
const inviteButtons = page.getByRole("button", { name: /Пригласить/ });
const inviteCount = await inviteButtons.count();
if (inviteCount) {
  await inviteButtons.first().click();
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  step(`   приглашение: ${text.match(/\/login\?invite=[a-z0-9]+/)?.[0] ?? "ссылка не показана"}`);
}
await shot("w10-priglashenie");

/* ---------- День 3: захватка ---------- */
await page.goto(`${base}${projectPath}?tab=progress`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await click(/Завести захватку|^Захватка$/);
await page.waitForTimeout(600);
await fill("Название", "Фасад А, оси 1–8");
await fill("Оси", "1–8");
await fill("Этажи", "1–12");
await fill("План", "1240");
await shot("w11-zahvatka-forma");
await click(/^Завести$/);
await page.waitForTimeout(2000);
step("7. Захватка заведена");
await shot("w12-hod-rabot");

/* ---------- День 4: документ и спецификация ---------- */
await page.goto(`${base}${projectPath}/documents`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await click(/Загрузить документацию/);
await page.waitForTimeout(700);
const spec = `${out}/specifikaciya.xlsx`;
const specFile = await writeXlsxFile(
  [
    ["№", "Наименование", "Количество", "Ед."],
    ["1.1", "Кронштейн КР-150 оцинкованный", "420", "шт"],
    ["1.2", "Профиль Т-образный 3 м", "310", "м"],
    ["1.3", "Анкер клиновой 10×100", "1680", "шт"],
  ].map((row) => row.map((value) => ({ type: String, value }))),
);
await specFile.toFile(spec);
const uploadInput = (await scope()).locator("input[type=file]").first();
await uploadInput.setInputFiles(spec);
await page.waitForTimeout(900);
await shot("w13-zagruzka-dokumenta");
await click(/^Загрузить$|Загрузить документ|^Добавить$/);
await page.waitForTimeout(2500);
step(`8. Документ загружен: ${page.url()}`);
await shot("w14-dokumenty");

// Открываем ревизию: строка документа ведёт на экран проверки
await page.getByText("специфик", { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(2500);
step(`   экран проверки: ${page.url()}`);
await shot("w15-proverka-pusto");

const bodyText = await page.locator("body").innerText();
step(`   пустой список говорит: ${bodyText.match(/Позиций из этого файла нет[^\n]*/)?.[0] ?? "—"}`);
step(`   и рядом: ${bodyText.match(/Разбор документов[^\n]*/)?.[0]?.slice(0, 120) ?? "—"}`);

await click(/Загрузить спецификацию из Excel/);
await page.waitForTimeout(700);
await (await scope()).locator("input[type=file]").setInputFiles(spec);
await page.waitForTimeout(900);
await shot("w16-specifikaciya-master");
await click(/^Загрузить \d+$/);
await page.waitForTimeout(2500);
const specText = await page.locator("body").innerText();
step(`9. Спецификация загружена: ${specText.match(/Добавлено[^\n]*/)?.[0] ?? "нет итога"}`);
await shot("w17-specifikaciya-itog");
await click(/Готово/);
await page.waitForTimeout(1500);
await shot("w18-pozicii");

await browser.close();
console.log("\n".concat(log.join("\n")));
