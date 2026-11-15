/**
 * Подключения в «Настройках» (ADR-072): что настроено на сервере на самом деле, а не надпись
 * «не подключён» навсегда. Сервер отдаёт только признаки «задано / не задано» и имя папки
 * и модели — ни одного значения ключа.
 */

export interface ServerConnections {
  database: boolean;
  max: boolean;
  telegram: boolean;
  yandexDisk: { configured: boolean; folder: string | null };
  model: { configured: boolean; name: string | null };
  sheets: boolean;
}

export interface ConnectionRow {
  key: keyof ServerConnections;
  name: string;
  detail: string;
  state: string;
  on: boolean;
}

/** Признаки по окружению сервера: переменная задана и не пустая */
export function connectionsOf(
  env: Record<string, string | undefined>,
  model: { available: boolean; model: string | null },
  folder: string,
): ServerConnections {
  const has = (...names: string[]) => names.every((n) => (env[n] ?? "").trim() !== "");
  const disk = has("YANDEX_DISK_TOKEN");
  return {
    database: has("DATABASE_URL"),
    max: has("MAX_BOT_TOKEN", "MAX_WEBHOOK_SECRET"),
    telegram: has("TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"),
    yandexDisk: { configured: disk, folder: disk ? folder.replace(/^disk:/, "") : null },
    model: { configured: model.available, name: model.model },
    sheets: has("GAS_SHEETS_SA_JSON", "GAS_SHEET_ID"),
  };
}

/**
 * Строки списка. Канал бота работает только вместе с базой: без неё диалог и привязки
 * негде хранить, поэтому «токен задан, базы нет» — не «подключён»
 */
export function connectionRows(c: ServerConnections): ConnectionRow[] {
  const bot = (on: boolean, name: string, env: string): ConnectionRow => ({
    key: name === "Бот Telegram" ? "telegram" : "max",
    name,
    detail: on
      ? c.database
        ? "Бригадир выбирает объект и дату, пишет время: запись сама попадает в табель"
        : "Токен задан, но нет базы: диалогу негде храниться"
      : `Приём времени от бригадиров. Администратор сервера задаёт ${env}`,
    state: on && c.database ? "подключён" : on ? "ждёт базу" : "не подключён",
    on: on && c.database,
  });
  return [
    {
      key: "database",
      name: "PostgreSQL",
      detail: c.database
        ? "Записи, табель и сметы хранятся на сервере"
        : "Без базы данные живут во вкладке (демо)",
      state: c.database ? "подключена" : "не подключена",
      on: c.database,
    },
    bot(c.telegram, "Бот Telegram", "TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET"),
    bot(c.max, "Бот MAX", "MAX_BOT_TOKEN и MAX_WEBHOOK_SECRET"),
    {
      key: "yandexDisk",
      name: "Яндекс Диск: папка смет",
      detail: c.yandexDisk.configured
        ? `Папка ${c.yandexDisk.folder}: новые сметы забираются на экране «Стоимость работ»`
        : "Сметы из папки одним нажатием. Администратор сервера задаёт YANDEX_DISK_TOKEN и YANDEX_DISK_FOLDER",
      state: c.yandexDisk.configured ? "подключена" : "не подключена",
      on: c.yandexDisk.configured,
    },
    {
      key: "model",
      name: "Помощник: модель",
      detail: c.model.configured
        ? `Отвечает по данным недели, смет и записей. Модель ${c.model.name ?? "по умолчанию"}`
        : "Без ключа помощник отвечает на заготовленные вопросы. Ключ: ANTHROPIC_API_KEY",
      state: c.model.configured ? "подключена" : "заготовленные ответы",
      on: c.model.configured,
    },
    {
      key: "sheets",
      name: "Google Таблица",
      detail: c.sheets
        ? "Лист недели обновляется сам после изменений"
        : "Копия отчёта в облачной таблице. Задаются GAS_SHEETS_SA_JSON и GAS_SHEET_ID",
      state: c.sheets ? "подключена" : "не подключена",
      on: c.sheets,
    },
  ];
}
