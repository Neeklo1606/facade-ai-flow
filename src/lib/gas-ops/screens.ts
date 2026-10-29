/**
 * Экраны рабочего контура газа (ADR-044, F1–F2): название, группа меню, роли и шаги
 * «Что делать здесь». Меню, шапка, нижняя панель и подсказки берут всё отсюда, поэтому
 * название экрана в меню, в шапке и во вкладке браузера не расходится.
 */
import { ROLE_LABEL, type Role } from "@/domain/gas-ops/model";

export type GasScreenKey =
  | "start"
  | "brigade"
  | "week"
  | "directory"
  | "foreman"
  | "moderation"
  | "entries"
  | "reports"
  | "brigades"
  | "objects"
  | "estimates"
  | "employees"
  | "summary"
  | "admin"
  | "guide"
  | "questions"
  | "more";

export type GasGroup = "work" | "catalogs" | "growth" | "help";

export interface GasScreen {
  key: GasScreenKey;
  to: string;
  /** Название в меню и в шапке: один заголовок на экран */
  title: string;
  /** Подпись в нижней панели телефона: до 10 знаков */
  short: string;
  group: GasGroup | null;
  roles: readonly Role[];
  /** Два-три шага действием: строка «Что делать здесь» под заголовком */
  steps: readonly string[];
}

const ALL: readonly Role[] = ["admin", "manager", "foreman", "director"];

export const GAS_GROUP_LABEL: Record<GasGroup, string> = {
  work: "Работа",
  catalogs: "Справочники",
  growth: "Развитие",
  help: "Помощь",
};

/** Подпись группы «Развитие»: граница договора называется один раз, в меню */
export const OUT_OF_SCOPE_LABEL = "Вне договора v1.0";

export const GAS_SCREENS: readonly GasScreen[] = [
  {
    key: "start",
    to: "/gas",
    title: "Учёт выработки бригад",
    short: "Начало",
    group: null,
    roles: ALL,
    steps: [
      "Нажмите «Начать показ», чтобы за 3 минуты пройти путь записи от бригадира до Excel.",
      "Или выберите роль и посмотрите свой экран.",
    ],
  },
  {
    key: "brigade",
    to: "/gas/brigade",
    title: "Сегодня",
    short: "Сегодня",
    group: "work",
    roles: ["admin", "manager", "foreman"],
    steps: [
      "Нажмите «Добавить время» и выберите объект из графика на сегодня.",
      "Укажите, кто работал, начало, окончание и перерыв.",
      "Проверьте сводку и нажмите «Отправить». Вопросы менеджера придут в «Мои записи».",
    ],
  },
  {
    key: "week",
    to: "/gas/week",
    title: "Неделя",
    short: "Неделя",
    group: "work",
    roles: ["admin", "manager", "director"],
    steps: [
      "Посмотрите итог недели и блок «До закрытия осталось».",
      "Разберите причины по ссылкам или примите их как есть с причиной.",
      "Нажмите «Закрыть неделю»: зафиксируется версия, файл версии останется доступен.",
    ],
  },
  {
    key: "directory",
    to: "/gas/directory",
    title: "Справочники",
    short: "Справочн.",
    group: "catalogs",
    roles: ["admin", "manager", "director"],
    steps: [
      "Проверьте состав бригад: кто и с какой даты в бригаде.",
      "Задайте ставки с датой начала: без них стоимость труда скрыта.",
      "Сверьте профиль выгрузки Excel: обязательные столбцы и итог с экраном.",
    ],
  },
  {
    key: "foreman",
    to: "/gas/foreman",
    title: "Бот бригадира",
    short: "Бот",
    group: "work",
    roles: ["admin", "manager", "foreman"],
    steps: [
      "Нажмите «Внести время» и выберите объект из списка на сегодня.",
      "Выберите день, начало, окончание и перерыв кнопками.",
      "Проверьте минуты в сводке и нажмите «Отправить»: придёт номер записи.",
    ],
  },
  {
    key: "moderation",
    to: "/gas/moderation",
    title: "Проверка",
    short: "Проверка",
    group: "work",
    roles: ["admin", "manager"],
    steps: [
      "Начните с группы «Требуют внимания»: красная метка блокирует подтверждение.",
      "Откройте запись, сверьте время и сумму, нажмите «Подтвердить».",
      "Записи без замечаний можно подтвердить пачкой одной кнопкой.",
      "На компьютере клавиши J и K ведут по списку, Enter подтверждает открытую запись.",
    ],
  },
  {
    key: "entries",
    to: "/gas/entries",
    title: "Журнал",
    short: "Журнал",
    group: "work",
    roles: ALL,
    steps: [
      "Найдите запись по номеру, объекту или бригаде в поиске.",
      "Сузьте список фильтрами дня и статуса.",
      "Откройте строку: там история проверки и кто что исправил.",
    ],
  },
  {
    key: "reports",
    to: "/gas/reports",
    title: "Отчёт",
    short: "Отчёт",
    group: "work",
    roles: ["admin", "manager", "director"],
    steps: [
      "Выберите день или всю неделю: таблица повторяет ваш Excel.",
      "Раскройте группу до бригад и адресов, чтобы увидеть сумму, часы и доходность.",
      "Нажмите «Выгрузить Excel»: файл откроется в привычной структуре.",
    ],
  },
  {
    key: "brigades",
    to: "/gas/brigades",
    title: "Бригады",
    short: "Бригады",
    group: "catalogs",
    roles: ["admin", "manager", "director"],
    steps: [
      "Откройте бригаду, чтобы увидеть бригадира, состав и объекты недели.",
      "Сравните часы и доходность бригад за неделю.",
    ],
  },
  {
    key: "objects",
    to: "/gas/objects",
    title: "Объекты",
    short: "Объекты",
    group: "catalogs",
    roles: ["admin", "manager", "director"],
    steps: [
      "Найдите объект по адресу или номеру.",
      "Объект без подтверждённой стоимости помечен: доходность по нему не считается.",
    ],
  },
  {
    key: "estimates",
    to: "/gas/estimates",
    title: "Сметы",
    short: "Сметы",
    group: "catalogs",
    roles: ["admin", "manager"],
    steps: [
      "Проверьте источник суммы: смета, ввод менеджера или нет источника.",
      "Для котла без сметы внесите сумму вручную с комментарием.",
    ],
  },
  {
    key: "employees",
    to: "/gas/employees",
    title: "Сотрудники",
    short: "Люди",
    group: "catalogs",
    roles: ["admin", "manager"],
    steps: [
      "Найдите сотрудника и его бригаду.",
      "Идентификатор MAX помечен как имитация: канал не подключён.",
    ],
  },
  {
    key: "summary",
    to: "/gas/overview",
    title: "Обзор",
    short: "Обзор",
    // По ТЗ v1.0 дашборд в договор не входит: «Обзор» остаётся в «Развитии» (граница договора)
    group: "growth",
    roles: ["admin", "manager", "director"],
    steps: [
      "Посмотрите итог недели: начислено, часы, доходность и что ждёт решения.",
      "Плана недели в данных нет: рядом с суммой стоит метка «План не задан».",
    ],
  },
  {
    key: "admin",
    to: "/gas/admin",
    title: "Настройка",
    short: "Настройка",
    group: "growth",
    roles: ["admin"],
    steps: [
      "Проверьте роли и правила расчёта.",
      "Журнал действий показывает, кто и что сделал в системе.",
    ],
  },
  {
    key: "guide",
    to: "/gas/guide",
    title: "Инструкция",
    short: "Помощь",
    group: "help",
    roles: ALL,
    steps: [
      "Выберите свою роль во вкладках.",
      "Нажмите «Показать на экране» у шага: откроется нужный экран с подсветкой.",
    ],
  },
  {
    key: "questions",
    to: "/gas/questions",
    title: "Вопросы к согласованию",
    short: "Вопросы",
    group: "help",
    roles: ["admin", "manager", "director"],
    steps: [
      "Пройдите вопросы сверху вниз: первые сильнее всего влияют на расчёт.",
      "Запишите ответ заказчика в поле и отметьте статус.",
      "«Скопировать список» соберёт вопросы текстом для мессенджера.",
    ],
  },
];

/** Вкладка «Ещё» телефона (ADR-048): разделы вне панели, роль, показ, тема */
const MORE_SCREEN: GasScreen = {
  key: "more",
  to: "/gas/more",
  title: "Ещё",
  short: "Ещё",
  group: null,
  roles: ALL,
  steps: [
    "Здесь разделы, которых нет в нижней панели, смена роли, сброс показа и тема.",
    "Нажмите строку, чтобы открыть раздел. «Назад» вернёт сюда.",
  ],
};

export function gasScreenOf(pathname: string): GasScreen {
  if (pathname.replace(/\/+$/, "") === MORE_SCREEN.to) return MORE_SCREEN;
  const path = pathname.replace(/\/+$/, "") || "/gas";
  const exact = GAS_SCREENS.find((screen) => screen.to === path);
  if (exact) return exact;
  const nested = GAS_SCREENS.filter((s) => s.to !== "/gas" && path.startsWith(`${s.to}/`));
  return nested[0] ?? GAS_SCREENS[0]!;
}

export function gasScreen(key: GasScreenKey): GasScreen {
  if (key === "more") return MORE_SCREEN;
  return GAS_SCREENS.find((s) => s.key === key)!;
}

/** Стартовый экран роли: куда ведёт смена роли (F1) */
export const ROLE_HOME: Record<Role, GasScreenKey> = {
  // ADR-056, раздел 1.3 документа владельца: у каждой роли свой стартовый экран
  foreman: "brigade",
  manager: "moderation",
  director: "week",
  admin: "directory",
};

/** Одна строка о роли в переключателе: кто это и что делает */
export const ROLE_ABOUT: Record<Role, string> = {
  foreman: "Вносит время бригады за день с телефона. Сумм не видит.",
  manager: "Проверяет записи бригадиров: принимает, исправляет с причиной, возвращает.",
  director: "Закрывает неделю: что мешает, итог, версия отчёта.",
  admin: "Ведёт состав бригад, ставки, сметы и выгрузку Excel.",
};

/**
 * Нижняя панель телефона: четыре вкладки роли и «Ещё» (ADR-055, раздел 2.5). Первые четыре
 * пункта меню роли ниже, кроме тех, что телефону не нужны.
 */
export const ROLE_TABS: Record<Role, readonly GasScreenKey[]> = {
  manager: ["moderation", "entries", "week", "reports"],
  director: ["week", "reports", "entries", "objects"],
  admin: ["directory", "objects", "estimates", "moderation"],
  foreman: [],
};

/**
 * Меню-таблетка компьютера по ролям (ADR-055, раздел 2.4) из экранов, которые уже есть.
 * Чего ещё нет, в меню не показывается (правило 3). Ставки, состав и профиль выгрузки
 * живут в «Справочниках» (ADR-056), «Снабжение» и «Документы» руководителя — другие контуры,
 * в них ведёт пункт «Модули» плавающей панели. Пункты меню роли — её разрешённые экраны.
 */
export const ROLE_MENU: Record<Role, readonly GasScreenKey[]> = {
  manager: [
    "moderation",
    "entries",
    "week",
    "reports",
    "objects",
    "estimates",
    "brigades",
    "directory",
  ],
  director: ["week", "reports", "entries", "objects", "summary", "brigades", "directory"],
  admin: ["directory", "objects", "estimates", "moderation", "employees", "admin", "reports"],
  foreman: [],
};

/** Разделы только личного контура заказчика: рабочий лист встречи с ним (ADR-047) */
export const CLIENT_ONLY_SCREENS: readonly GasScreenKey[] = ["questions"];

export function screensFor(role: Role, contour: "public" | "client" = "public"): GasScreen[] {
  return GAS_SCREENS.filter(
    (screen) =>
      screen.roles.includes(role) &&
      (contour === "client" || !CLIENT_ONLY_SCREENS.includes(screen.key)),
  );
}

export const ROLE_ORDER: readonly Role[] = ["foreman", "manager", "director", "admin"];

/** Первая буква роли для аватара в шапке */
export const roleInitial = (role: Role) => ROLE_LABEL[role].slice(0, 1);
