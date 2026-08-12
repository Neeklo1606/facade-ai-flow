export type TaskStatus = "new" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskSource = "manual" | "agent";

export interface Task {
  id: string;
  title: string;
  projectId: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  createdAt: string;
  source: TaskSource;
  contractClause?: string;
  agentName?: string;
}

export const taskStatusLabels: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  review: "На проверке",
  done: "Выполнена",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  critical: "Критичный",
};

export const tasks: Task[] = [
  {
    id: "T-1042",
    title: "Согласовать замерную карту по осям Г-К с заказчиком",
    projectId: "obj-severnaya-korona",
    assignee: "Волкова Е.С.",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-08-09",
    createdAt: "2026-07-28",
    source: "agent",
    contractClause: "п. 4.2 договора СИ-2025/114-НВФ",
    agentName: "Генератор задач",
  },
  {
    id: "T-1051",
    title: "Передать исполнительную документацию по 5-8 этажам",
    projectId: "obj-severnaya-korona",
    assignee: "Волкова Е.С.",
    status: "new",
    priority: "critical",
    dueDate: "2026-08-11",
    createdAt: "2026-08-01",
    source: "agent",
    contractClause: "п. 6.5 договора СИ-2025/114-НВФ",
    agentName: "Парсер договоров",
  },
  {
    id: "T-1058",
    title: "Заказать кронштейн КР-150 на захватку 2",
    projectId: "obj-meridian",
    assignee: "Дорохов С.Н.",
    status: "in_progress",
    priority: "critical",
    dueDate: "2026-08-08",
    createdAt: "2026-07-30",
    source: "agent",
    agentName: "Контролер сроков",
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
    id: "T-1067",
    title: "Проверить сертификаты на керамогранит 600х600 антрацит",
    projectId: "obj-primorskiy",
    assignee: "Волкова Е.С.",
    status: "new",
    priority: "normal",
    dueDate: "2026-08-19",
    createdAt: "2026-08-08",
    source: "agent",
    agentName: "Парсер договоров",
    contractClause: "п. 3.7 договора ДСК-2026/009-НВФ",
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
    id: "T-1078",
    title: "Контроль поставки минеральной ваты 100мм",
    projectId: "obj-meridian",
    assignee: "Дорохов С.Н.",
    status: "in_progress",
    priority: "critical",
    dueDate: "2026-08-13",
    createdAt: "2026-08-07",
    source: "agent",
    agentName: "Контролер сроков",
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
];

export const overdueTasks = (today = new Date("2026-08-12")) =>
  tasks.filter((t) => t.status !== "done" && new Date(t.dueDate) < today);
