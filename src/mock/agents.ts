export type AgentId =
  | "ag-contract-parser"
  | "ag-report-processor"
  | "ag-task-generator"
  | "ag-deadline-controller"
  | "ag-request-builder"
  | "ag-digest-analyst";

export interface AgentSetting {
  key: string;
  label: string;
  hint: string;
  enabled: boolean;
}

export interface AgentTestField {
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
}

export interface Agent {
  id: AgentId;
  name: string;
  summary: string;
  enabled: boolean;
  runsWeek: number;
  accuracy: number;
  avgCost: number;
  description: string;
  prompt: string;
  tools: { name: string; description: string }[];
  settings: AgentSetting[];
  testFileName: string;
  testFields: AgentTestField[];
}

export const agents: Agent[] = [
  {
    id: "ag-contract-parser",
    name: "Парсер договоров",
    summary: "Извлекает предмет, сроки, штрафы и контрольные точки из договоров подряда",
    enabled: true,
    runsWeek: 14,
    accuracy: 94,
    avgCost: 8.4,
    description:
      "Разбирает PDF и сканы договоров: определяет стороны, сумму, график платежей, контрольные точки и санкции. Каждое поле сопровождается цитатой со страницей — человек подтверждает или исправляет.",
    prompt:
      "Ты — юридический аналитик подрядной организации по фасадам. Извлеки из договора структурированные поля: стороны, предмет, сумму, сроки этапов, контрольные точки, штрафные санкции, порядок приёмки. Для каждого поля верни точную цитату и номер страницы. Если поле отсутствует — верни null и не додумывай.",
    tools: [
      { name: "pdf_extract", description: "Постраничное извлечение текста и таблиц" },
      { name: "ocr_scan", description: "Распознавание сканов и печатей" },
      { name: "milestones_writer", description: "Запись контрольных точек в график" },
    ],
    settings: [
      { key: "autorun", label: "Запускать при загрузке документа", hint: "Автозапуск для типа «Договор»", enabled: true },
      { key: "require", label: "Требовать подтверждения человеком", hint: "Поля не уходят в систему без проверки", enabled: true },
      { key: "tasks", label: "Предлагать задачи из контрольных точек", hint: "Только предложение, без автосоздания", enabled: true },
    ],
    testFileName: "Договор ПС-2025-067-СПК.pdf",
    testFields: [
      { label: "Заказчик", value: "ГК «Промстрой»", confidence: "high" },
      { label: "Сумма договора", value: "64 200 000 ₽", confidence: "high" },
      { label: "Срок завершения", value: "30 октября 2026", confidence: "medium" },
      { label: "Штраф за просрочку", value: "0,1% от суммы этапа за день", confidence: "low" },
    ],
  },
  {
    id: "ag-report-processor",
    name: "Обработчик отчётов с объекта",
    summary: "Превращает голосовые и текстовые отчёты прорабов в объёмы, риски и задачи",
    enabled: true,
    runsWeek: 62,
    accuracy: 91,
    avgCost: 2.1,
    description:
      "Принимает голосовые сообщения из Telegram, расшифровывает речь, выделяет выполненные объёмы по захваткам, нехватку материалов и людей. Формирует черновик отчёта для приёмки РП.",
    prompt:
      "Ты — помощник прораба. По расшифровке голосового отчёта определи: объект, захватку, выполненный объём (м²), число рабочих, погодные ограничения, проблемы и потребности в материалах. Не выдумывай цифры: если объём не назван явно — верни null.",
    tools: [
      { name: "speech_to_text", description: "Распознавание речи с шумом стройплощадки" },
      { name: "volume_matcher", description: "Сопоставление работ с позициями графика" },
      { name: "photo_check", description: "Проверка наличия фото по захватке" },
    ],
    settings: [
      { key: "autorun", label: "Обрабатывать входящие из Telegram", hint: "Мгновенно после получения сообщения", enabled: true },
      { key: "ask", label: "Переспрашивать прораба при неясности", hint: "Уточняющий вопрос в чат", enabled: true },
      { key: "auto", label: "Автопринятие при высокой уверенности", hint: "Выключено: приёмка только человеком", enabled: false },
    ],
    testFileName: "voice-2026-08-12-gareev.ogg",
    testFields: [
      { label: "Объект", value: "ЖК «Северная Корона», корпус 3", confidence: "high" },
      { label: "Захватка", value: "Захватка 2, оси 5–9", confidence: "high" },
      { label: "Выполнено за смену", value: "148 м² облицовки", confidence: "medium" },
      { label: "Проблема", value: "Не хватает кронштейнов КР-150 (~200 шт.)", confidence: "medium" },
    ],
  },
  {
    id: "ag-task-generator",
    name: "Генератор задач",
    summary: "Создаёт задачи из отчётов, договоров и отклонений графика",
    enabled: true,
    runsWeek: 37,
    accuracy: 88,
    avgCost: 1.6,
    description:
      "Формирует задачи с исполнителем, сроком и ссылкой на источник. Дубли объединяет, срок берёт из графика или контрольной точки договора.",
    prompt:
      "Сформируй задачи из входного события. Каждая задача: заголовок, объект, исполнитель по роли, срок, приоритет, ссылка на источник. Не создавай задачу, если аналогичная открыта.",
    tools: [
      { name: "tasks_writer", description: "Создание задач в реестре" },
      { name: "dedupe", description: "Поиск дублей среди открытых задач" },
      { name: "roles_lookup", description: "Подбор исполнителя по роли и объекту" },
    ],
    settings: [
      { key: "autorun", label: "Автосоздание задач", hint: "Задачи появляются со статусом «Предложена»", enabled: true },
      { key: "notify", label: "Уведомлять исполнителя в Telegram", hint: "Сообщение с кнопкой «Принять»", enabled: true },
      { key: "priority", label: "Повышать приоритет при просрочке", hint: "Автоматически через 2 дня", enabled: false },
    ],
    testFileName: "Отчёт Р-2026-341 (принят)",
    testFields: [
      { label: "Задача", value: "Дозаказать кронштейны КР-150, 200 шт.", confidence: "high" },
      { label: "Исполнитель", value: "Дорохов С.Н. (снабжение)", confidence: "high" },
      { label: "Срок", value: "18 августа 2026", confidence: "medium" },
      { label: "Приоритет", value: "Высокий", confidence: "medium" },
    ],
  },
  {
    id: "ag-deadline-controller",
    name: "Контролёр сроков",
    summary: "Следит за контрольными точками и предупреждает о риске срыва",
    enabled: true,
    runsWeek: 21,
    accuracy: 96,
    avgCost: 0.9,
    description:
      "Ежедневно сверяет план и факт по захваткам, считает прогноз завершения по текущему темпу и поднимает флаг за 14 дней до риска срыва контрольной точки.",
    prompt:
      "Сравни план и факт по каждой захватке. Рассчитай прогноз завершения по темпу за 7 дней. Верни список контрольных точек с риском срыва, величиной отставания и рекомендованным действием.",
    tools: [
      { name: "schedule_read", description: "Чтение графика работ" },
      { name: "forecast", description: "Прогноз по темпу за 7 дней" },
      { name: "alerts", description: "Публикация в ленту внимания" },
    ],
    settings: [
      { key: "daily", label: "Ежедневная сверка в 07:00", hint: "По московскому времени", enabled: true },
      { key: "window", label: "Горизонт предупреждения 14 дней", hint: "Раньше — слишком много шума", enabled: true },
      { key: "mail", label: "Письмо заказчику при риске", hint: "Только после подтверждения РП", enabled: false },
    ],
    testFileName: "График ЖК «Северная Корона» (13.08)",
    testFields: [
      { label: "Точка риска", value: "Завершение монтажа подконструкции", confidence: "high" },
      { label: "Отставание", value: "11,2% от плана", confidence: "high" },
      { label: "Прогноз завершения", value: "29 августа (план — 21 августа)", confidence: "medium" },
      { label: "Рекомендация", value: "Вторая бригада на захватки 3–4", confidence: "low" },
    ],
  },
  {
    id: "ag-request-builder",
    name: "Формирователь заявок",
    summary: "Собирает заявку на закупку, подбирает поставщиков и готовит письмо",
    enabled: true,
    runsWeek: 9,
    accuracy: 90,
    avgCost: 3.7,
    description:
      "По потребности из отчётов и графика собирает позиции, нормирует номенклатуру, подбирает поставщиков по категориям и формирует текст письма. Рассылка — только после подтверждения человеком.",
    prompt:
      "Собери заявку на закупку: позиции с единицами и количеством, срок поставки, объект. Подбери поставщиков по категории и рейтингу. Сформируй деловое письмо-запрос цен. Не отправляй письмо самостоятельно.",
    tools: [
      { name: "catalog_lookup", description: "Нормализация номенклатуры" },
      { name: "suppliers_match", description: "Подбор поставщиков по категории" },
      { name: "mail_draft", description: "Черновик письма-запроса" },
    ],
    settings: [
      { key: "auto", label: "Собирать заявку из потребностей", hint: "Из принятых отчётов и графика", enabled: true },
      { key: "confirm", label: "Отправка только после подтверждения", hint: "Человек в цикле, отключить нельзя", enabled: true },
      { key: "min", label: "Минимум 3 поставщика в рассылке", hint: "Для сравнения цен", enabled: true },
    ],
    testFileName: "Потребность по ЖК «Северная Корона»",
    testFields: [
      { label: "Позиции", value: "Кронштейн КР-150 — 200 шт.; анкер 10×100 — 800 шт.", confidence: "high" },
      { label: "Срок поставки", value: "до 24 августа 2026", confidence: "medium" },
      { label: "Поставщики", value: "МеталлПрофиль-Юг, СтройКомплект, Фасад-Снаб", confidence: "high" },
      { label: "Ожидаемая сумма", value: "≈ 412 000 ₽", confidence: "low" },
    ],
  },
  {
    id: "ag-digest-analyst",
    name: "Аналитик сводок",
    summary: "Готовит утреннюю сводку по объектам и письма заказчикам",
    enabled: false,
    runsWeek: 6,
    accuracy: 87,
    avgCost: 5.2,
    description:
      "Собирает данные по всем объектам за сутки: объёмы, отклонения, поставки, риски. Формирует сводку для РП и черновики отчётных писем заказчикам.",
    prompt:
      "Сформируй сводку по объектам за период: выполненные объёмы, отклонение план-факт, поставки, риски и открытые вопросы. Пиши деловым языком, без оценочных суждений, каждый факт — со ссылкой на источник.",
    tools: [
      { name: "metrics_read", description: "Агрегация показателей по объектам" },
      { name: "mail_draft", description: "Черновик письма заказчику" },
      { name: "chart_render", description: "Диаграмма план-факт для письма" },
    ],
    settings: [
      { key: "daily", label: "Утренняя сводка в 08:00", hint: "Отправляется в Telegram РП", enabled: false },
      { key: "weekly", label: "Еженедельное письмо заказчику", hint: "Черновик по пятницам", enabled: true },
      { key: "charts", label: "Прикладывать диаграмму план-факт", hint: "PNG во вложении", enabled: true },
    ],
    testFileName: "Данные за 11.08.2026",
    testFields: [
      { label: "Объектов в сводке", value: "5", confidence: "high" },
      { label: "Общее отклонение", value: "−6,4% к плану", confidence: "medium" },
      { label: "Ключевой риск", value: "Поставка керамогранита по «Меридиану»", confidence: "medium" },
      { label: "Тон письма", value: "Деловой, без обязательств по срокам", confidence: "low" },
    ],
  },
];

export interface AgentRun {
  id: string;
  agentId: AgentId;
  at: string;
  target: string;
  projectId: string;
  durationSec: number;
  success: boolean;
  result: string;
  failReason?: string;
  tokens: number;
  cost: number;
  input: string;
  steps: string[];
  tools: string[];
  output: string;
  confirmedBy?: string;
}

const A = {
  cp: "ag-contract-parser",
  rp: "ag-report-processor",
  tg: "ag-task-generator",
  dc: "ag-deadline-controller",
  rb: "ag-request-builder",
  da: "ag-digest-analyst",
} as const;

export const agentRuns: AgentRun[] = [
  {
    id: "run-0301", agentId: A.rp, at: "2026-08-12T08:14:00+03:00", target: "Голосовой отчёт Гареев Р.М., 1:42",
    projectId: "obj-severnaya-korona", durationSec: 24, success: true, result: "Черновик отчёта Р-2026-341",
    tokens: 5120, cost: 2.3,
    input: "voice-2026-08-12-gareev.ogg (1:42), захватка 2",
    steps: ["Распознавание речи", "Выделение объёмов и проблем", "Сопоставление с графиком", "Черновик отчёта"],
    tools: ["speech_to_text", "volume_matcher", "photo_check"],
    output: "Объём 148 м², 9 рабочих, нехватка кронштейнов КР-150 (~200 шт.)",
    confirmedBy: "Соколов И.П. принял отчёт, исправил объём 148 → 142 м²",
  },
  {
    id: "run-0300", agentId: A.tg, at: "2026-08-12T08:16:00+03:00", target: "Отчёт Р-2026-341",
    projectId: "obj-severnaya-korona", durationSec: 9, success: true, result: "Создано 2 задачи",
    tokens: 2380, cost: 1.1,
    input: "Принятый отчёт Р-2026-341",
    steps: ["Разбор потребностей", "Поиск дублей", "Подбор исполнителей", "Создание задач"],
    tools: ["dedupe", "roles_lookup", "tasks_writer"],
    output: "З-1: дозаказ кронштейнов (Дорохов С.Н., 18.08); З-2: фото захватки 2 (Гареев Р.М., 13.08)",
    confirmedBy: "Соколов И.П. подтвердил обе задачи",
  },
  {
    id: "run-0299", agentId: A.dc, at: "2026-08-12T07:00:00+03:00", target: "График всех объектов",
    projectId: "obj-meridian", durationSec: 41, success: true, result: "2 риска срыва",
    tokens: 7400, cost: 3.4,
    input: "Плановые и фактические объёмы по 5 объектам на 12.08",
    steps: ["Чтение графика", "Расчёт темпа за 7 дней", "Прогноз завершения", "Публикация в ленту внимания"],
    tools: ["schedule_read", "forecast", "alerts"],
    output: "БЦ «Меридиан»: отставание 11,2%; ЖК «Галактика»: риск по остеклению витражей",
    confirmedBy: "Соколов И.П. просмотрел ленту внимания",
  },
  {
    id: "run-0298", agentId: A.rb, at: "2026-08-12T06:38:00+03:00", target: "Заявка З-2026-121",
    projectId: "obj-severnaya-korona", durationSec: 63, success: true, result: "Заявка и письмо готовы",
    tokens: 9120, cost: 4.6,
    input: "Потребность: кронштейн КР-150 (200 шт.), анкер 10×100 (800 шт.)",
    steps: ["Нормализация номенклатуры", "Подбор поставщиков", "Расчёт ожидаемой суммы", "Черновик письма"],
    tools: ["catalog_lookup", "suppliers_match", "mail_draft"],
    output: "3 поставщика, ожидаемая сумма ≈ 412 000 ₽, письмо-запрос цен",
    confirmedBy: "Соколов И.П. подтвердил рассылку (демо)",
  },
  {
    id: "run-0297", agentId: A.rp, at: "2026-08-12T06:12:00+03:00", target: "Голосовой отчёт Ким А.В., 2:05",
    projectId: "obj-meridian", durationSec: 31, success: false, result: "Не удалось распознать объёмы",
    failReason: "Сильный шум ветра и техники: уверенность распознавания 41%, ниже порога 70%",
    tokens: 4100, cost: 1.9,
    input: "voice-2026-08-12-kim.ogg (2:05)",
    steps: ["Распознавание речи", "Оценка уверенности", "Остановка: ниже порога"],
    tools: ["speech_to_text"],
    output: "Запрос уточнения отправлен прорабу в Telegram",
  },
  {
    id: "run-0296", agentId: A.cp, at: "2026-08-11T18:44:00+03:00", target: "Договор ПС-2025/067-СПК",
    projectId: "obj-meridian", durationSec: 118, success: true, result: "Извлечено 14 полей, 6 контрольных точек",
    tokens: 21400, cost: 11.4,
    input: "PDF, 34 страницы, скан с печатями",
    steps: ["Постраничное извлечение", "OCR печатей", "Извлечение полей и цитат", "Сбор контрольных точек"],
    tools: ["pdf_extract", "ocr_scan", "milestones_writer"],
    output: "Сумма 64,2 млн ₽; срок 30.10.2026; штраф 0,1%/день; 6 контрольных точек",
    confirmedBy: "Волкова Е.С. подтвердила 12 полей, исправила 2",
  },
  {
    id: "run-0295", agentId: A.da, at: "2026-08-11T17:00:00+03:00", target: "Сводка за 11.08",
    projectId: "obj-severnaya-korona", durationSec: 52, success: true, result: "Сводка по 5 объектам",
    tokens: 12800, cost: 6.1,
    input: "Показатели по 5 объектам за сутки",
    steps: ["Агрегация показателей", "Выделение рисков", "Формирование текста", "Диаграмма план-факт"],
    tools: ["metrics_read", "chart_render"],
    output: "Отклонение −6,4%; ключевой риск — поставка керамогранита по «Меридиану»",
    confirmedBy: "Соколов И.П. прочитал сводку",
  },
  {
    id: "run-0294", agentId: A.tg, at: "2026-08-11T16:52:00+03:00", target: "Контрольные точки договора СИ-2025/114-НВФ",
    projectId: "obj-severnaya-korona", durationSec: 14, success: true, result: "Предложено 6 задач",
    tokens: 3100, cost: 1.4,
    input: "6 контрольных точек из договора",
    steps: ["Разбор точек", "Поиск дублей", "Назначение сроков", "Предложение задач"],
    tools: ["dedupe", "tasks_writer"],
    output: "6 задач со сроками от 21.08 до 18.11",
    confirmedBy: "Соколов И.П. подтвердил 5 из 6 задач",
  },
  {
    id: "run-0293", agentId: A.rp, at: "2026-08-11T08:22:00+03:00", target: "Отчёт Ким А.В. (текст)",
    projectId: "obj-galaktika", durationSec: 11, success: true, result: "Черновик отчёта Р-2026-338",
    tokens: 2600, cost: 1.2,
    input: "Текстовое сообщение из Telegram, 640 символов",
    steps: ["Разбор текста", "Сопоставление с графиком", "Черновик отчёта"],
    tools: ["volume_matcher"],
    output: "Витражи: 6 блоков, 7 рабочих, замечаний нет",
    confirmedBy: "Соколов И.П. принял отчёт",
  },
  {
    id: "run-0292", agentId: A.dc, at: "2026-08-11T07:00:00+03:00", target: "График всех объектов",
    projectId: "obj-primorskiy", durationSec: 38, success: true, result: "1 риск срыва",
    tokens: 7100, cost: 3.2,
    input: "Плановые и фактические объёмы на 11.08",
    steps: ["Чтение графика", "Расчёт темпа", "Прогноз", "Публикация"],
    tools: ["schedule_read", "forecast", "alerts"],
    output: "ЖК «Приморский»: риск по утеплению, отставание 4,1%",
  },
  {
    id: "run-0291", agentId: A.cp, at: "2026-08-10T15:10:00+03:00", target: "Доп. соглашение №2 к СИ-2025/114-НВФ",
    projectId: "obj-severnaya-korona", durationSec: 74, success: true, result: "Извлечено 8 полей",
    tokens: 14200, cost: 7.6,
    input: "PDF, 6 страниц",
    steps: ["Извлечение текста", "Сравнение с основным договором", "Извлечение изменений"],
    tools: ["pdf_extract", "milestones_writer"],
    output: "Сумма увеличена на 3,4 млн ₽, срок сдвинут на 14 дней",
    confirmedBy: "Волкова Е.С. подтвердила все поля",
  },
  {
    id: "run-0290", agentId: A.rb, at: "2026-08-10T12:31:00+03:00", target: "Заявка З-2026-118",
    projectId: "obj-meridian", durationSec: 58, success: true, result: "Заявка и письмо готовы",
    tokens: 8600, cost: 4.1,
    input: "Потребность: подконструкция, 1 200 пог. м",
    steps: ["Нормализация номенклатуры", "Подбор поставщиков", "Черновик письма"],
    tools: ["catalog_lookup", "suppliers_match", "mail_draft"],
    output: "3 поставщика, письмо-запрос цен",
    confirmedBy: "Дорохов С.Н. подтвердил рассылку (демо)",
  },
  {
    id: "run-0289", agentId: A.rp, at: "2026-08-10T08:05:00+03:00", target: "Голосовой отчёт Гареев Р.М., 0:58",
    projectId: "obj-school-1547", durationSec: 19, success: true, result: "Черновик отчёта Р-2026-335",
    tokens: 3400, cost: 1.6,
    input: "voice-2026-08-10-gareev.ogg (0:58)",
    steps: ["Распознавание речи", "Выделение объёмов", "Черновик отчёта"],
    tools: ["speech_to_text", "volume_matcher"],
    output: "Штукатурные работы, 96 м², 5 рабочих",
    confirmedBy: "Соколов И.П. принял отчёт",
  },
  {
    id: "run-0288", agentId: A.tg, at: "2026-08-10T07:44:00+03:00", target: "Отклонение графика «Меридиан»",
    projectId: "obj-meridian", durationSec: 8, success: true, result: "Создана 1 задача",
    tokens: 1900, cost: 0.9,
    input: "Риск срыва контрольной точки 21.08",
    steps: ["Разбор риска", "Поиск дублей", "Создание задачи"],
    tools: ["dedupe", "tasks_writer"],
    output: "Задача: усилить бригаду на захватках 3–4 (Ким А.В., 14.08)",
    confirmedBy: "Соколов И.П. подтвердил задачу",
  },
  {
    id: "run-0287", agentId: A.da, at: "2026-08-09T17:00:00+03:00", target: "Еженедельное письмо заказчику",
    projectId: "obj-severnaya-korona", durationSec: 47, success: true, result: "Черновик письма",
    tokens: 11200, cost: 5.4,
    input: "Показатели за неделю 03.08–09.08",
    steps: ["Агрегация недели", "Формирование текста", "Диаграмма"],
    tools: ["metrics_read", "chart_render", "mail_draft"],
    output: "Письмо «Еженедельный отчёт о ходе работ» ожидает подтверждения",
    confirmedBy: "Ожидает подтверждения РП",
  },
  {
    id: "run-0286", agentId: A.cp, at: "2026-08-09T11:20:00+03:00", target: "Договор ПРМ-2026/012",
    projectId: "obj-primorskiy", durationSec: 96, success: false, result: "Обработка прервана",
    failReason: "Скан низкого качества: 9 страниц из 28 не распознаны, OCR-уверенность ниже 50%",
    tokens: 16800, cost: 9.2,
    input: "PDF, 28 страниц, скан 150 dpi",
    steps: ["Извлечение текста", "OCR сканов", "Проверка полноты: не пройдена"],
    tools: ["pdf_extract", "ocr_scan"],
    output: "Запрошен исходный файл лучшего качества у ПТО",
  },
  {
    id: "run-0285", agentId: A.dc, at: "2026-08-09T07:00:00+03:00", target: "График всех объектов",
    projectId: "obj-galaktika", durationSec: 36, success: true, result: "Рисков нет",
    tokens: 6800, cost: 3.1,
    input: "Плановые и фактические объёмы на 09.08",
    steps: ["Чтение графика", "Расчёт темпа", "Прогноз"],
    tools: ["schedule_read", "forecast"],
    output: "Все контрольные точки в пределах допуска",
  },
  {
    id: "run-0284", agentId: A.rp, at: "2026-08-08T18:41:00+03:00", target: "Голосовой отчёт Ким А.В., 1:12",
    projectId: "obj-galaktika", durationSec: 22, success: true, result: "Черновик отчёта Р-2026-331",
    tokens: 4200, cost: 1.9,
    input: "voice-2026-08-08-kim.ogg (1:12)",
    steps: ["Распознавание речи", "Выделение объёмов", "Черновик отчёта"],
    tools: ["speech_to_text", "volume_matcher"],
    output: "Витражные блоки: 4 шт., простой 2 часа из-за крана",
    confirmedBy: "Соколов И.П. вернул отчёт на уточнение",
  },
  {
    id: "run-0283", agentId: A.tg, at: "2026-08-08T14:03:00+03:00", target: "Отчёт Р-2026-329",
    projectId: "obj-school-1547", durationSec: 7, success: true, result: "Создана 1 задача",
    tokens: 1600, cost: 0.7,
    input: "Принятый отчёт Р-2026-329",
    steps: ["Разбор потребностей", "Создание задачи"],
    tools: ["tasks_writer"],
    output: "Задача: заказать сетку фасадную, 400 м² (Дорохов С.Н., 12.08)",
    confirmedBy: "Соколов И.П. подтвердил задачу",
  },
  {
    id: "run-0282", agentId: A.rb, at: "2026-08-08T10:15:00+03:00", target: "Заявка З-2026-114",
    projectId: "obj-primorskiy", durationSec: 49, success: true, result: "Заявка и письмо готовы",
    tokens: 7900, cost: 3.8,
    input: "Потребность: керамогранит, 2 400 м²",
    steps: ["Нормализация номенклатуры", "Подбор поставщиков", "Черновик письма"],
    tools: ["catalog_lookup", "suppliers_match", "mail_draft"],
    output: "4 поставщика, письмо-запрос цен",
    confirmedBy: "Дорохов С.Н. подтвердил рассылку (демо)",
  },
  {
    id: "run-0281", agentId: A.rp, at: "2026-08-07T08:30:00+03:00", target: "Голосовой отчёт Гареев Р.М., 1:26",
    projectId: "obj-severnaya-korona", durationSec: 25, success: true, result: "Черновик отчёта Р-2026-327",
    tokens: 4600, cost: 2.1,
    input: "voice-2026-08-07-gareev.ogg (1:26)",
    steps: ["Распознавание речи", "Выделение объёмов", "Черновик отчёта"],
    tools: ["speech_to_text", "volume_matcher", "photo_check"],
    output: "Облицовка 132 м², фото по захватке 1 приложены",
    confirmedBy: "Соколов И.П. принял отчёт",
  },
  {
    id: "run-0280", agentId: A.dc, at: "2026-08-07T07:00:00+03:00", target: "График всех объектов",
    projectId: "obj-meridian", durationSec: 39, success: true, result: "1 риск срыва",
    tokens: 7000, cost: 3.2,
    input: "Плановые и фактические объёмы на 07.08",
    steps: ["Чтение графика", "Расчёт темпа", "Прогноз", "Публикация"],
    tools: ["schedule_read", "forecast", "alerts"],
    output: "БЦ «Меридиан»: отставание 9,8%",
    confirmedBy: "Соколов И.П. просмотрел ленту внимания",
  },
  {
    id: "run-0279", agentId: A.cp, at: "2026-08-06T16:25:00+03:00", target: "Договор ГЛК-2026/041",
    projectId: "obj-galaktika", durationSec: 105, success: true, result: "Извлечено 13 полей, 5 контрольных точек",
    tokens: 19800, cost: 10.6,
    input: "PDF, 31 страница",
    steps: ["Извлечение текста", "Извлечение полей и цитат", "Сбор контрольных точек"],
    tools: ["pdf_extract", "milestones_writer"],
    output: "Сумма 51,7 млн ₽; срок 15.12.2026; 5 контрольных точек",
    confirmedBy: "Волкова Е.С. подтвердила 13 полей",
  },
  {
    id: "run-0278", agentId: A.da, at: "2026-08-06T08:00:00+03:00", target: "Сводка за 05.08",
    projectId: "obj-severnaya-korona", durationSec: 44, success: true, result: "Сводка по 5 объектам",
    tokens: 10400, cost: 5.0,
    input: "Показатели по 5 объектам за сутки",
    steps: ["Агрегация показателей", "Выделение рисков", "Формирование текста"],
    tools: ["metrics_read"],
    output: "Отклонение −5,1%; поставки в графике",
  },
  {
    id: "run-0277", agentId: A.tg, at: "2026-08-05T13:18:00+03:00", target: "Отчёт Р-2026-322",
    projectId: "obj-primorskiy", durationSec: 6, success: true, result: "Создана 1 задача",
    tokens: 1400, cost: 0.6,
    input: "Принятый отчёт Р-2026-322",
    steps: ["Разбор потребностей", "Создание задачи"],
    tools: ["tasks_writer"],
    output: "Задача: проверить геометрию оконных проёмов, оси 1–4 (Волкова Е.С., 08.08)",
    confirmedBy: "Соколов И.П. подтвердил задачу",
  },
  {
    id: "run-0276", agentId: A.rp, at: "2026-08-05T08:11:00+03:00", target: "Голосовой отчёт Гареев Р.М., 0:44",
    projectId: "obj-school-1547", durationSec: 14, success: true, result: "Черновик отчёта Р-2026-321",
    tokens: 2200, cost: 1.0,
    input: "voice-2026-08-05-gareev.ogg (0:44)",
    steps: ["Распознавание речи", "Черновик отчёта"],
    tools: ["speech_to_text"],
    output: "Подготовка основания, 210 м², 4 рабочих",
    confirmedBy: "Соколов И.П. принял отчёт",
  },
  {
    id: "run-0275", agentId: A.dc, at: "2026-08-05T07:00:00+03:00", target: "График всех объектов",
    projectId: "obj-school-1547", durationSec: 33, success: true, result: "Рисков нет",
    tokens: 6400, cost: 2.9,
    input: "Плановые и фактические объёмы на 05.08",
    steps: ["Чтение графика", "Расчёт темпа", "Прогноз"],
    tools: ["schedule_read", "forecast"],
    output: "Все контрольные точки в пределах допуска",
  },
  {
    id: "run-0274", agentId: A.rb, at: "2026-08-04T11:02:00+03:00", target: "Заявка З-2026-109",
    projectId: "obj-school-1547", durationSec: 41, success: true, result: "Заявка и письмо готовы",
    tokens: 6900, cost: 3.3,
    input: "Потребность: утеплитель, 1 800 м²",
    steps: ["Нормализация номенклатуры", "Подбор поставщиков", "Черновик письма"],
    tools: ["catalog_lookup", "suppliers_match", "mail_draft"],
    output: "3 поставщика, письмо-запрос цен",
    confirmedBy: "Дорохов С.Н. подтвердил рассылку (демо)",
  },
  {
    id: "run-0273", agentId: A.cp, at: "2026-08-03T09:47:00+03:00", target: "Спецификация к СИ-2025/114-НВФ",
    projectId: "obj-severnaya-korona", durationSec: 61, success: true, result: "Извлечено 42 позиции",
    tokens: 13600, cost: 7.1,
    input: "XLSX, 42 строки",
    steps: ["Разбор таблицы", "Нормализация номенклатуры", "Сверка с графиком"],
    tools: ["pdf_extract", "milestones_writer"],
    output: "42 позиции номенклатуры сопоставлены с работами графика",
    confirmedBy: "Волкова Е.С. подтвердила спецификацию",
  },
  {
    id: "run-0272", agentId: A.rp, at: "2026-08-03T08:19:00+03:00", target: "Голосовой отчёт Ким А.В., 1:33",
    projectId: "obj-meridian", durationSec: 27, success: true, result: "Черновик отчёта Р-2026-318",
    tokens: 4800, cost: 2.2,
    input: "voice-2026-08-03-kim.ogg (1:33)",
    steps: ["Распознавание речи", "Выделение объёмов", "Черновик отчёта"],
    tools: ["speech_to_text", "volume_matcher"],
    output: "Подконструкция: 88 пог. м, 8 рабочих",
    confirmedBy: "Соколов И.П. принял отчёт",
  },
];

export const agentById = (id: string) => agents.find((a) => a.id === id);
export const agentName = (id: string) => agentById(id)?.name ?? id;
