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
  | "site"
  | "supply"
  | "suppliers"
  | "deliveries"
  | "supplyOverview"
  | "materials"
  | "docs"
  | "docsRegistry"
  | "workJournal"
  | "docsOverview"
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

/** Роли учёта времени (модуль 1): журнал записей и прежние экраны контура */
const ALL: readonly Role[] = ["admin", "manager", "foreman", "director"];
/** Все роли, включая снабжение и ПТО (ADR-057): старт, инструкция, «Ещё» */
const EVERYONE: readonly Role[] = [...ALL, "prorab", "supply", "pto"];

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
    roles: EVERYONE,
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
    roles: EVERYONE,
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
  // ---------- Снабжение (ADR-057) ----------
  {
    key: "site",
    to: "/gas/site",
    title: "Сегодня прораба",
    short: "Сегодня",
    group: "work",
    roles: ["admin", "prorab"],
    steps: [
      "Нажмите микрофон или напишите, что нужно: «труба 20 50 метров к пятнице».",
      "Проверьте строки черновика: позицию и количество подтверждаете вы.",
      "Когда поставка приедет, откройте её в «Принять поставку» и сверьте количество.",
    ],
  },
  {
    key: "supply",
    to: "/gas/supply",
    title: "Заявки",
    short: "Заявки",
    group: "work",
    roles: ["admin", "supply", "director"],
    steps: [
      "Начните с новых и просроченных: таблица идёт по сроку и приоритету.",
      "Откройте заявку, сверьте с лимитом сметы и нажмите «Взять в работу».",
      "Запросите предложения файлом или текстом, внесите ответы и выберите лучшее.",
    ],
  },
  {
    key: "suppliers",
    to: "/gas/suppliers",
    title: "Поставщики",
    short: "Поставщ.",
    group: "catalogs",
    roles: ["admin", "supply", "director"],
    steps: [
      "Найдите поставщика по названию или категории.",
      "Откройте строку: история предложений, цен и сроков.",
    ],
  },
  {
    key: "deliveries",
    to: "/gas/deliveries",
    title: "Поставки",
    short: "Поставки",
    group: "work",
    roles: ["admin", "supply", "director"],
    steps: [
      "Посмотрите, что в пути и к какой дате.",
      "Принятые поставки показывают расхождения и сертификаты.",
    ],
  },
  {
    key: "supplyOverview",
    to: "/gas/supply-overview",
    title: "Снабжение",
    short: "Снабж.",
    group: "work",
    roles: ["admin", "director"],
    steps: [
      "Сумма заказов считается по выбранным предложениям заказанных заявок.",
      "Проверьте просрочки и превышения сметы: строка ведёт в заявку.",
    ],
  },
  {
    key: "materials",
    to: "/gas/materials",
    title: "Материалы",
    short: "Материалы",
    group: "work",
    roles: ["admin", "director", "pto", "supply"],
    steps: [
      "Здесь материалы, принятые на объектах, с сертификатами и паспортами.",
      "Материал без сертификата помечен: в акт его не включить, пока документа нет.",
    ],
  },
  // ---------- Исполнительная документация (ADR-058) ----------
  {
    key: "docs",
    to: "/gas/docs",
    title: "Документы",
    short: "Документы",
    group: "work",
    roles: ["admin", "pto"],
    steps: [
      "Выберите объект и нажмите «Создать черновики актов» в блоке «Сформировать пакет».",
      "Откройте акт: у каждого поля источник, строки «Не хватает» ведут к добавлению.",
      "Полный комплект передайте на подпись, затем загрузите скан подписанного.",
    ],
  },
  {
    key: "docsRegistry",
    to: "/gas/docs-registry",
    title: "Реестр ИД",
    short: "Реестр",
    group: "work",
    roles: ["admin", "pto", "director"],
    steps: [
      "Подписанные акты объекта собираются в текущий реестр.",
      "«Закрыть реестр версией» фиксирует список; xlsx и пакет zip скачиваются здесь.",
    ],
  },
  {
    key: "workJournal",
    to: "/gas/work-journal",
    title: "Журнал работ",
    short: "Журнал",
    group: "work",
    roles: ["admin", "pto"],
    steps: [
      "Черновики записей собираются из подтверждённых объёмов.",
      "Сверьте текст, допишите условия производства работ и нажмите «Принять запись».",
    ],
  },
  {
    key: "docsOverview",
    to: "/gas/docs-overview",
    title: "Готовность ИД",
    short: "ИД",
    group: "work",
    roles: ["admin", "director"],
    steps: [
      "Процент комплектности считается по всем работам объекта, с актом и без.",
      "Блокеры показывают, чего не хватает и кто отвечает.",
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
  roles: EVERYONE,
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
  prorab: "site",
  supply: "supply",
  pto: "docs",
};

/** Одна строка о роли в переключателе: кто это и что делает */
export const ROLE_ABOUT: Record<Role, string> = {
  foreman: "Вносит время бригады за день с телефона. Сумм не видит.",
  manager: "Проверяет записи бригадиров: принимает, исправляет с причиной, возвращает.",
  director: "Закрывает неделю: что мешает, итог, версия отчёта.",
  admin: "Ведёт состав бригад, ставки, сметы и выгрузку Excel.",
  prorab: "Заказывает материалы голосом или текстом и принимает поставки на объекте.",
  supply: "Ведёт заявки: предложения поставщиков, выбор, заказ и доставку.",
  pto: "Собирает акты из подтверждённых работ, проверяет комплект и ведёт реестр ИД.",
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
  // Прораб, как бригадир, живёт в своём экране телефона: панели нет
  prorab: [],
  supply: ["supply", "deliveries", "suppliers", "materials"],
  pto: ["docs", "docsRegistry", "workJournal", "materials"],
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
  director: [
    "week",
    "reports",
    "supplyOverview",
    "docsOverview",
    "entries",
    "objects",
    "summary",
    "brigades",
    "directory",
  ],
  admin: [
    "directory",
    "objects",
    "estimates",
    "moderation",
    "employees",
    "admin",
    "reports",
    "supply",
    "docs",
  ],
  foreman: [],
  prorab: [],
  supply: ["supply", "suppliers", "deliveries", "materials"],
  pto: ["docs", "docsRegistry", "workJournal", "materials"],
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

export const ROLE_ORDER: readonly Role[] = [
  "foreman",
  "manager",
  "director",
  "admin",
  "prorab",
  "supply",
  "pto",
];

/**
 * Полевые роли: свой интерфейс телефона без меню, плавающей панели и колокольчика.
 * Бригадир и прораб (ADR-056, ADR-057)
 */
export const isFieldRole = (role: Role) => role === "foreman" || role === "prorab";

/** Первая буква роли для аватара в шапке */
export const roleInitial = (role: Role) => ROLE_LABEL[role].slice(0, 1);
