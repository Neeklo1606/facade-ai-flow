/**
 * Сценарии проводки по ролям (ADR-010).
 *
 * Шаг засчитывается по факту: открыт нужный экран (`screen`) или выполнено действие (`action` —
 * ключ `meta.action` мутации или действие интерфейса). Тексты говорят только о том, что система
 * действительно делает; где звено имитируется, шаг говорит об этом прямо.
 */
import type { EmployeeRole } from "@/contracts";

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
  doneOn: { screen?: string[]; action?: string[] };
}

export interface Scenario {
  id: string;
  title: string;
  steps: GuideStep[];
}

const supply: Scenario = {
  id: "supply",
  title: "Снабжение: от спецификации до решения",
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
      id: "review",
      text: "Проверьте позицию с пометкой «Требует внимания»: подтвердите или исправьте её.",
      target: "review-list",
      on: ["document"],
      to: (p) => `/projects/${p}/documents`,
      doneOn: { action: ["confirmPositions", "correctPosition", "confirmAutoVerified"] },
    },
    {
      id: "hand-over",
      text: "Передайте проверенные позиции в закупку.",
      note: "Пока в документе есть позиции «Не удалось определить», кнопка недоступна: исправьте или исключите их.",
      target: "hand-over",
      on: ["document"],
      to: (p) => `/projects/${p}/documents`,
      doneOn: { action: ["handOver"] },
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
  ],
};

const manager: Scenario = {
  id: "manager",
  title: "Руководитель: что требует решения",
  steps: [
    {
      id: "dashboard",
      text: "Откройте дашборд: шесть метрик и очередь того, что ждёт решения.",
      target: "nav-dashboard",
      to: () => "/",
      doneOn: { screen: ["dashboard"] },
    },
    {
      id: "attention",
      text: "Откройте пункт в блоке «Требует решения».",
      target: "attention-list",
      on: ["dashboard"],
      to: () => "/",
      doneOn: { action: ["openAttention"] },
    },
    {
      id: "source",
      text: "Нажмите на значок источника рядом со значением — откроется письмо или сообщение, из которого оно взято.",
      target: "source",
      on: ["dashboard", "rfq", "field-reports", "timeline", "project"],
      to: () => "/",
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
      id: "dashboard",
      text: "Откройте дашборд: сводка по всем объектам.",
      target: "nav-dashboard",
      to: () => "/",
      doneOn: { screen: ["dashboard"] },
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

export function scenarioFor(role: EmployeeRole): Scenario {
  return byRole[role];
}

export function scenarioById(id: string | null): Scenario | null {
  return [supply, manager, pto, foreman, director].find((item) => item.id === id) ?? null;
}
