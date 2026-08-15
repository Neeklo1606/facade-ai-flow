export type TaskStatus = "new" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskSource = "manual" | "agent";

export interface TaskComment {
  id: string;
  author: string;
  at: string;
  text: string;
  isAgent?: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  projectId: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  createdAt: string;
  source: TaskSource;
  contractClause?: string;
  agentName?: string;
  agentConfidence?: "high" | "medium" | "low";
  checklist?: ChecklistItem[];
  comments?: TaskComment[];
}

export const taskStatusLabels: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  review: "На проверке",
  done: "Готово",
};

export const taskStatusOrder: TaskStatus[] = ["new", "in_progress", "review", "done"];

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  critical: "Критичный",
};

export const TODAY = new Date("2026-08-12");

export const tasks: Task[] = [
  {
    id: "T-1042",
    title: "Согласовать замерную карту по осям Г-К с заказчиком",
    description:
      "Передать замерную карту захватки 2 в ГК «Стройинвест», получить отметку о согласовании и приложить к исполнительной документации.",
    projectId: "obj-severnaya-korona",
    assignee: "Волкова Е.С.",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-08-16",
    createdAt: "2026-07-28",
    source: "manual",
    checklist: [
      { id: "c1", text: "Свести замеры по осям Г-К", done: true },
      { id: "c2", text: "Отправить заказчику на согласование", done: true },
      { id: "c3", text: "Получить подписанный экземпляр", done: false },
    ],
    comments: [
      { id: "cm1", author: "Соколов И.П.", at: "2026-08-10T11:20:00+03:00", text: "Заказчик просит добавить отметки по парапету." },
    ],
  },
  {
    id: "T-1051",
    title: "Передать исполнительную документацию по 5-8 этажам",
    description:
      "По договору исполнительная документация по завершенным этажам передается в течение 10 рабочих дней после закрытия захватки.",
    projectId: "obj-severnaya-korona",
    assignee: "Волкова Е.С.",
    status: "new",
    priority: "critical",
    dueDate: "2026-08-11",
    createdAt: "2026-08-01",
    source: "agent",
    contractClause: "п. 6.5 договора СИ-2025/114-НВФ",
    agentName: "Парсер договоров",
    agentConfidence: "high",
    checklist: [
      { id: "c1", text: "Собрать акты скрытых работ", done: true },
      { id: "c2", text: "Подписать у технадзора", done: false },
      { id: "c3", text: "Передать заказчику по реестру", done: false },
    ],
    comments: [
      {
        id: "cm1",
        author: "Парсер договоров",
        at: "2026-08-01T09:02:00+03:00",
        isAgent: true,
        text: "Задача создана из п. 6.5 договора: срок — 10 рабочих дней после закрытия захватки.",
      },
    ],
  },
  {
    id: "T-1058",
    title: "Заказать кронштейн КР-150 на захватку 2",
    description: "Остаток на складе 0 при потребности 480 шт. Нужна заявка поставщику с поставкой до 20 августа.",
    projectId: "obj-meridian",
    assignee: "Дорохов С.Н.",
    status: "in_progress",
    priority: "critical",
    dueDate: "2026-08-08",
    createdAt: "2026-07-30",
    source: "agent",
    agentName: "Контролер сроков",
    agentConfidence: "medium",
    checklist: [
      { id: "c1", text: "Сформировать заявку", done: true },
      { id: "c2", text: "Разослать трем поставщикам", done: false },
    ],
    comments: [
      {
        id: "cm1",
        author: "Контролер сроков",
        at: "2026-07-30T07:10:00+03:00",
        isAgent: true,
        text: "Расчет потребности сделан по остаткам и темпу монтажа за 2 недели.",
      },
    ],
  },
  {
    id: "T-1060",
    title: "Устранить замечания по монтажу примыканий, 9 этаж",
    projectId: "obj-meridian",
    assignee: "Ким А.В.",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-08-14",
    createdAt: "2026-08-05",
    source: "manual",
  },
  {
    id: "T-1063",
    title: "Подготовить КС-2 за июль",
    projectId: "obj-school-1547",
    assignee: "Волкова Е.С.",
    status: "review",
    priority: "normal",
    dueDate: "2026-08-15",
    createdAt: "2026-08-03",
    source: "manual",
  },
  {
    id: "T-1064",
    title: "Проверить геометрию стены по осям Г-К перед облицовкой",
    projectId: "obj-severnaya-korona",
    assignee: "Гареев Р.М.",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-08-18",
    createdAt: "2026-08-07",
    source: "manual",
  },
  {
    id: "T-1067",
    title: "Проверить сертификаты на керамогранит 600х600 антрацит",
    projectId: "obj-primorskiy",
    assignee: "Волкова Е.С.",
    status: "new",
    priority: "normal",
    dueDate: "2026-08-19",
    createdAt: "2026-08-08",
    source: "manual",
  },
  {
    id: "T-1069",
    title: "Согласовать график поставки утеплителя на сентябрь",
    projectId: "obj-severnaya-korona",
    assignee: "Дорохов С.Н.",
    status: "new",
    priority: "normal",
    dueDate: "2026-08-22",
    createdAt: "2026-08-09",
    source: "manual",
  },
  {
    id: "T-1070",
    title: "Организовать выезд на замеры по ТЦ «Галактика»",
    projectId: "obj-galaktika",
    assignee: "Соколов И.П.",
    status: "new",
    priority: "high",
    dueDate: "2026-08-10",
    createdAt: "2026-08-02",
    source: "manual",
  },
  {
    id: "T-1071",
    title: "Закрыть акт скрытых работ по утеплителю, захватка 1",
    projectId: "obj-severnaya-korona",
    assignee: "Гареев Р.М.",
    status: "review",
    priority: "high",
    dueDate: "2026-08-15",
    createdAt: "2026-08-06",
    source: "manual",
  },
  {
    id: "T-1074",
    title: "Согласовать узел примыкания к парапету",
    projectId: "obj-severnaya-korona",
    assignee: "Волкова Е.С.",
    status: "in_progress",
    priority: "normal",
    dueDate: "2026-08-21",
    createdAt: "2026-08-06",
    source: "manual",
  },
  {
    id: "T-1076",
    title: "Проверить крепление лесов после ветровой нагрузки",
    projectId: "obj-meridian",
    assignee: "Ким А.В.",
    status: "new",
    priority: "critical",
    dueDate: "2026-08-13",
    createdAt: "2026-08-11",
    source: "manual",
  },
  {
    id: "T-1078",
    title: "Контроль поставки минеральной ваты 100 мм",
    projectId: "obj-meridian",
    assignee: "Дорохов С.Н.",
    status: "in_progress",
    priority: "critical",
    dueDate: "2026-08-13",
    createdAt: "2026-08-07",
    source: "manual",
  },
  {
    id: "T-1080",
    title: "Сформировать отчет по объемам за первую половину августа",
    projectId: "obj-school-1547",
    assignee: "Гареев Р.М.",
    status: "new",
    priority: "normal",
    dueDate: "2026-08-17",
    createdAt: "2026-08-11",
    source: "manual",
  },
  {
    id: "T-1081",
    title: "Закрыть акт скрытых работ по утеплителю, захватка 1",
    projectId: "obj-primorskiy",
    assignee: "Гареев Р.М.",
    status: "done",
    priority: "normal",
    dueDate: "2026-08-05",
    createdAt: "2026-07-25",
    source: "manual",
  },
  {
    id: "T-1083",
    title: "Обновить схему захваток после переноса лесов",
    projectId: "obj-primorskiy",
    assignee: "Ким А.В.",
    status: "in_progress",
    priority: "low",
    dueDate: "2026-08-24",
    createdAt: "2026-08-10",
    source: "manual",
  },
  {
    id: "T-1085",
    title: "Подготовить письмо заказчику о переносе срока по захватке 2",
    projectId: "obj-severnaya-korona",
    assignee: "Соколов И.П.",
    status: "review",
    priority: "high",
    dueDate: "2026-08-14",
    createdAt: "2026-08-09",
    source: "manual",
  },
  {
    id: "T-1087",
    title: "Принять смонтированный участок мембраны, 1-8 этажи",
    projectId: "obj-severnaya-korona",
    assignee: "Соколов И.П.",
    status: "done",
    priority: "normal",
    dueDate: "2026-08-08",
    createdAt: "2026-08-01",
    source: "manual",
  },
];

export const isOverdue = (t: Task, today: Date = TODAY) =>
  t.status !== "done" && new Date(t.dueDate) < today;

export const overdueTasks = (today: Date = TODAY) => tasks.filter((t) => isOverdue(t, today));
