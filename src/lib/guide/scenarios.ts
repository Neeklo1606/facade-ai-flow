/**
 * Сценарии проводки по ролям (ADR-010).
 *
 * Шаг засчитывается по факту: открыт нужный экран (`screen`) или выполнено действие (`action` —
 * ключ `meta.action` мутации или действие интерфейса). Тексты говорят только о том, что система
 * действительно делает; где звено имитируется, шаг говорит об этом прямо.
 */
import type { EmployeeRole } from "@/contracts";
import type { Role as GasRole } from "@/domain/gas-ops/model";

export interface GuideStep {
  id: string;
  /** Инструкция: одно предложение, начинается с глагола */
  text: string;
  /** Оговорка под инструкцией: что имитируется, что мешает */
  note?: string;
  /** Элемент для подсветки: значение атрибута `data-tour` */
  target?: string;
  /** Куда перейти, если шаг не на текущем экране */
  to?: (projectId: string) => string;
  /** Экран, на котором шаг выполняется: пока посетитель не там, проводка предлагает перейти */
  on?: string[];
  /**
   * Чьими глазами делается шаг (канон демо, ADR-038): если роль вкладки другая, полоса шагов
   * предлагает переключиться в одно касание, данные вкладки сохраняются.
   */
  role?: EmployeeRole;
  /** Роль газового контура для шага показа «gas-week» (ADR-044, F3) */
  gasRole?: GasRole;
  doneOn: { screen?: string[]; action?: string[] };
}

export interface Scenario {
  id: string;
  title: string;
  steps: GuideStep[];
}

const supply: Scenario = {
  id: "supply",
  title: "Снабжение: от проверенных позиций до поставки",
  // Проверку позиций и передачу в закупку ведёт ПТО; у снабжения документы только на чтение (ADR-012)
  steps: [
    {
      id: "materials",
      text: "Откройте материалы объекта: здесь позиции, которые ПТО проверило и передало в закупку.",
      target: "create-request",
      on: ["materials"],
      to: (p) => `/projects/${p}/materials?purchase=none`,
      doneOn: { screen: ["materials"] },
    },
    {
      id: "request",
      text: "Выберите позиции без запроса и отправьте запрос поставщикам.",
      target: "create-request",
      on: ["materials"],
      to: (p) => `/projects/${p}/materials?purchase=none`,
      doneOn: { action: ["createRequest"] },
    },
    {
      id: "offers",
      text: "Дождитесь предложений поставщиков.",
      note: "В демонстрации письма не уходят, а ответы имитируются и приходят через несколько секунд.",
      target: "requests-list",
      on: ["procurement", "rfq"],
      to: (p) => `/projects/${p}/procurement`,
      doneOn: { action: ["offerReceived"] },
    },
    {
      id: "compare",
      text: "Откройте запрос в списке и нажмите «Открыть сравнение».",
      target: "requests-list",
      on: ["procurement"],
      to: (p) => `/projects/${p}/procurement`,
      doneOn: { screen: ["rfq"] },
    },
    {
      id: "decide",
      text: "Зафиксируйте решение: выберите поставщика и напишите причину.",
      target: "decide",
      on: ["rfq"],
      to: (p) => `/projects/${p}/procurement`,
      doneOn: { action: ["chooseSupplier"] },
    },
    {
      id: "delivery",
      text: "Откройте «Поставки»: решение создало поставку, её движение и приёмка ведутся здесь.",
      note: "В демонстрации отгрузку и «в пути» отмечает имитация, это подписано рядом со статусом.",
      on: ["deliveries"],
      to: (p) => `/projects/${p}/deliveries`,
      doneOn: { screen: ["deliveries"] },
    },
  ],
};

const manager: Scenario = {
  id: "manager",
  title: "Руководитель: что требует решения",
  steps: [
    {
      id: "attention-open",
      text: "Откройте «Обзор»: три числа по всем объектам и очередь того, что ждёт решения.",
      target: "nav-attention",
      to: () => "/attention",
      doneOn: { screen: ["attention"] },
    },
    {
      id: "attention",
      text: "Откройте пункт в блоке «Требует решения».",
      target: "attention-list",
      on: ["attention"],
      to: () => "/attention",
      doneOn: { action: ["openAttention"] },
    },
    {
      id: "source",
      text: "Нажмите на значок источника рядом со значением — откроется письмо или сообщение, из которого оно взято.",
      target: "source",
      on: ["attention", "rfq", "field-reports", "timeline", "project"],
      to: () => "/attention",
      doneOn: { action: ["openSource"] },
    },
    {
      id: "project",
      text: "Откройте карточку объекта.",
      target: "nav-projects",
      on: ["projects"],
      to: () => "/projects",
      doneOn: { screen: ["project", "project-progress", "project-team"] },
    },
    {
      id: "milestones",
      text: "Откройте вкладку «Ход работ»: захватки и контрольные точки договора.",
      target: "tab-progress",
      on: ["project", "project-team"],
      to: (p) => `/projects/${p}`,
      doneOn: { screen: ["project-progress"] },
    },
    {
      id: "history",
      text: "Откройте историю и решения объекта.",
      target: "nav-timeline",
      to: (p) => `/projects/${p}/timeline`,
      doneOn: { screen: ["timeline"] },
    },
  ],
};

const pto: Scenario = {
  id: "pto",
  title: "ПТО: проверка извлечённых позиций",
  steps: [
    {
      id: "open-spec",
      text: "Откройте спецификацию объекта в документации.",
      target: "documents-list",
      on: ["documents", "document"],
      to: (p) => `/projects/${p}/documents`,
      doneOn: { screen: ["document"] },
    },
    {
      id: "confirm",
      text: "Подтвердите позицию или все позиции, которые система распознала уверенно.",
      target: "review-list",
      on: ["document"],
      to: (p) => `/projects/${p}/documents`,
      doneOn: { action: ["confirmPositions", "confirmAutoVerified"] },
    },
    {
      id: "correct",
      text: "Исправьте количество или наименование позиции с пометкой «Требует внимания».",
      target: "review-list",
      on: ["document"],
      to: (p) => `/projects/${p}/documents`,
      doneOn: { action: ["correctPosition"] },
    },
    {
      id: "history",
      text: "Откройте историю объекта: исправление количества попало туда с автором и временем.",
      target: "nav-timeline",
      to: (p) => `/projects/${p}/timeline`,
      doneOn: { screen: ["timeline"] },
    },
  ],
};

const foreman: Scenario = {
  id: "foreman",
  title: "Прораб: отчёт с площадки",
  steps: [
    {
      id: "project",
      text: "Откройте карточку своего объекта.",
      target: "nav-projects",
      on: ["projects"],
      to: () => "/projects",
      doneOn: { screen: ["project", "project-progress", "project-team"] },
    },
    {
      id: "reports",
      text: "Откройте отчёты с площадки.",
      target: "nav-field-reports",
      to: (p) => `/projects/${p}/field-reports`,
      doneOn: { screen: ["field-reports"] },
    },
    {
      id: "voice",
      text: "В голосовом отчёте нажмите на распознанное поле — подсветится цитата, из которой оно взято.",
      note: "В демонстрации отчёты — готовый набор: сообщения из Telegram не принимаются.",
      target: "voice-report",
      on: ["field-reports"],
      to: (p) => `/projects/${p}/field-reports`,
      doneOn: { action: ["inspectVoiceField"] },
    },
    {
      id: "accept",
      text: "Подтвердите объём: примите отчёт или исправьте объём.",
      target: "report-accept",
      on: ["field-reports"],
      to: (p) => `/projects/${p}/field-reports`,
      doneOn: { action: ["reviewReport"] },
    },
  ],
};

const director: Scenario = {
  id: "director",
  title: "Директор: состояние компании",
  steps: [
    {
      id: "attention-open",
      text: "Откройте «Обзор»: что требует решения по всем объектам.",
      target: "nav-attention",
      to: () => "/attention",
      doneOn: { screen: ["attention"] },
    },
    {
      id: "registry",
      text: "Откройте реестр объектов: этап, готовность и что требует внимания.",
      target: "nav-projects",
      to: () => "/projects",
      doneOn: { screen: ["projects"] },
    },
    {
      id: "export",
      text: "Выгрузите реестр в Excel.",
      target: "export",
      on: ["projects"],
      to: () => "/projects",
      doneOn: { action: ["exportExcel"] },
    },
    {
      id: "decisions",
      text: "Откройте историю объекта: кто и на каком основании принимал решения.",
      target: "nav-timeline",
      to: (p) => `/projects/${p}/timeline`,
      doneOn: { screen: ["timeline"] },
    },
  ],
};

/* ---------- Канон демо 18.10 (ADR-038): три сценария одной цепочкой ---------- */

const canonShift: Scenario = {
  id: "canon-shift",
  title: "Смена → учёт",
  steps: [
    {
      id: "open",
      text: "Нажмите голосовую капсулу внизу экрана: здесь говорят с объекта.",
      target: "nav-plus",
      role: "foreman",
      to: () => "/capture?scenario=demo-shift",
      doneOn: { screen: ["capture"] },
    },
    {
      id: "say",
      text: "Удерживайте капсулу и прочитайте пример вслух или нажмите «Показать без микрофона».",
      note: "Расшифровка и разбор в демонстрации подготовлены заранее: это написано рядом с результатом.",
      role: "foreman",
      on: ["capture"],
      to: () => "/capture?scenario=demo-shift",
      doneOn: { action: ["extract"] },
    },
    {
      id: "confirm",
      text: "Коснитесь любого значения, чтобы увидеть фразу-источник, и нажмите «Верно».",
      role: "foreman",
      on: ["capture"],
      to: () => "/capture?scenario=demo-shift",
      doneOn: { action: ["confirmDraft"] },
    },
    {
      id: "today",
      text: "Откройте «Сегодня»: отчёт на проверке, в сводку он попадёт после решения ПТО.",
      role: "foreman",
      to: () => "/today",
      doneOn: { screen: ["today"] },
    },
  ],
};

const canonDocument: Scenario = {
  id: "canon-document",
  title: "ПТО → документ",
  steps: [
    {
      id: "queue",
      text: "Откройте «Проверку» глазами ПТО: первым стоит отчёт прораба из записи.",
      role: "pto",
      to: () => "/check",
      doneOn: { screen: ["check"] },
    },
    {
      id: "accept",
      text: "Примите отчёт или исправьте объём: принятый объём вводит человек.",
      role: "pto",
      on: ["check"],
      to: () => "/check",
      doneOn: { action: ["reviewReport"] },
    },
    {
      id: "files",
      text: "Скачайте сводку смены и черновик ведомости: это настоящие файлы Excel.",
      note: "Ведомость подписана «Черновик, не исполнительная документация».",
      role: "pto",
      on: ["check"],
      to: () => "/check",
      doneOn: { action: ["downloadStatement"] },
    },
  ],
};

const canonSupply: Scenario = {
  id: "canon-supply",
  title: "Объект → снабжение",
  steps: [
    {
      id: "say",
      text: "Скажите о нехватке материала или нажмите «Показать без микрофона», затем «Верно».",
      role: "foreman",
      to: () => "/capture?scenario=demo-supply",
      doneOn: { action: ["confirmDraft"] },
    },
    {
      id: "decide",
      text: "Глазами снабжения примите заявку сдвигом или отклоните с причиной.",
      note: "Ничего не заказывается автоматически: статус меняет человек.",
      role: "supply",
      to: () => "/inbox",
      doneOn: { action: ["decideMaterialRequest"] },
    },
    {
      id: "status",
      text: "Вернитесь к прорабу: во «Входящих» виден статус его заявки.",
      role: "foreman",
      to: () => "/inbox",
      doneOn: { screen: ["inbox"] },
    },
  ],
};

/** Порядок показа: цепочка на одном объекте, финал после третьего (ADR-038) */
export const CANON_SCENARIOS: readonly Scenario[] = [canonShift, canonDocument, canonSupply];

/** Следующий сценарий канона; null — это был последний, впереди финал */
export function nextCanon(id: string | null): Scenario | null {
  const index = CANON_SCENARIOS.findIndex((item) => item.id === id);
  return index >= 0 ? (CANON_SCENARIOS[index + 1] ?? null) : null;
}

/** Персонажи ролей канона в данных демонстрации */
export const CANON_PERSONA: Partial<Record<EmployeeRole, string>> = {
  foreman: "e-gareev",
  pto: "e-volkova",
  supply: "e-dorohov",
  manager: "e-sokolov",
};

const byRole: Record<EmployeeRole, Scenario> = {
  supply,
  manager,
  pto,
  foreman,
  director,
  // Ролей без персоны на экране выбора нет, но словарь обязан быть полным
  finance: manager,
  worker: foreman,
};

/**
 * Сценарий роли при выборе «самому». С канона 18.10 роль начинает свой сценарий канона;
 * прежние сценарии ролей остаются в коде и открываются с флагом `legacy_modules`.
 */
const canonByRole: Partial<Record<EmployeeRole, Scenario>> = {
  foreman: canonShift,
  pto: canonDocument,
  supply: canonSupply,
  manager: canonDocument,
};

export function scenarioFor(role: EmployeeRole, legacy = false): Scenario {
  return legacy ? byRole[role] : (canonByRole[role] ?? byRole[role]);
}

/**
 * Показ газа «gas-week» (ADR-044, F3): путь записи от бригадира до Excel за 3 минуты.
 * Шаг засчитывается действием экрана; адрес шага строит полоса показа из цепочки вкладки.
 */
export const gasWeek: Scenario = {
  id: "gas-week",
  title: "Неделя бригады: от бота до Excel",
  steps: [
    {
      id: "gas-enter",
      text: "Внесите время по объекту на сегодня.",
      note: "Подсказка: ОБ-200, начало 12:00, окончание 14:30, без перерыва.",
      target: "bot",
      gasRole: "foreman",
      on: ["gas-foreman"],
      doneOn: { action: ["gasEntrySummary"] },
    },
    {
      id: "gas-send",
      text: "Отправьте запись и посмотрите номер.",
      target: "bot-send",
      gasRole: "foreman",
      on: ["gas-foreman"],
      doneOn: { action: ["gasEntrySubmitted"] },
    },
    {
      id: "gas-confirm",
      text: "Откройте новую запись в проверке и подтвердите её.",
      target: "review-confirm",
      gasRole: "manager",
      on: ["gas-moderation"],
      doneOn: { action: ["gasEntryConfirmed"] },
    },
    {
      id: "gas-report",
      text: "Найдите запись в недельном отчёте.",
      note: "Строка объекта подсвечена: 14 700 ₽, 2,50 ч, 5 880 ₽/ч.",
      target: "report-row",
      gasRole: "director",
      on: ["gas-reports"],
      doneOn: { action: ["gasReportSeen"] },
    },
    {
      id: "gas-export",
      text: "Выгрузите Excel.",
      target: "export",
      gasRole: "director",
      on: ["gas-reports"],
      doneOn: { action: ["gasExport"] },
    },
    {
      id: "gas-finish",
      text: "Готово: посмотрите, что создано за показ.",
      on: ["gas-finish"],
      doneOn: { screen: ["gas-finish"] },
    },
  ],
};

export function scenarioById(id: string | null): Scenario | null {
  return (
    [...CANON_SCENARIOS, supply, manager, pto, foreman, director, gasWeek].find(
      (item) => item.id === id,
    ) ?? null
  );
}
