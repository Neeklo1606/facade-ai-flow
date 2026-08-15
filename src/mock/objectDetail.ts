/** Детализация карточки объекта. Все данные синтетические. */

export type MilestoneStatus = "done" | "on_track" | "at_risk" | "overdue";

export interface Milestone {
  id: string;
  name: string;
  date: string;
  status: MilestoneStatus;
  note?: string;
}

export interface RiskItem {
  id: string;
  title: string;
  detail: string;
  level: "high" | "medium" | "low";
  owner: string;
  fromAgent?: string;
}

export interface FinanceRow {
  label: string;
  value: number;
  hint: string;
}

export interface JournalEntry {
  id: string;
  at: string;
  actor: string;
  isAgent?: boolean;
  text: string;
}

export interface FacadeCell {
  id: string;
  label: string;
  progress: number;
}

export interface ObjectDetail {
  projectId: string;
  milestones: Milestone[];
  risks: RiskItem[];
  finance: FinanceRow[];
  journal: JournalEntry[];
  facade: FacadeCell[];
}

const facadeGrid = (seed: number[]): FacadeCell[] =>
  seed.map((progress, i) => ({
    id: `cell-${i}`,
    label: `З${Math.floor(i / 3) + 1}·${["А-Г", "Г-К", "К-Р"][i % 3]}`,
    progress,
  }));

export const objectDetails: ObjectDetail[] = [
  {
    projectId: "obj-severnaya-korona",
    milestones: [
      { id: "m1", name: "Замерная карта согласована", date: "2026-04-14", status: "done", note: "с опозданием 8 дней" },
      { id: "m2", name: "Подсистема захватки 1 закрыта", date: "2026-07-02", status: "done" },
      { id: "m3", name: "Подсистема захватки 2 закрыта", date: "2026-08-21", status: "at_risk", note: "прогноз 28 августа" },
      { id: "m4", name: "Исполнительная документация 5-8 этажи", date: "2026-08-11", status: "overdue", note: "просрочка 1 день" },
      { id: "m5", name: "Облицовка захватки 1 завершена", date: "2026-09-18", status: "on_track" },
      { id: "m6", name: "Сдача объекта заказчику", date: "2026-11-28", status: "on_track" },
    ],
    risks: [
      {
        id: "r1",
        title: "Дефицит нащельника углового",
        detail: "Остаток 0 при потребности 320 пог. м по захватке 2. Поставка не заказана.",
        level: "high",
        owner: "Дорохов С.Н.",
        fromAgent: "Контролер сроков",
      },
      {
        id: "r2",
        title: "Отставание по подсистеме захватки 2",
        detail: "Факт отстает от плана на 7 дней, работа на критическом пути.",
        level: "high",
        owner: "Гареев Р.М.",
        fromAgent: "Контролер сроков",
      },
      {
        id: "r3",
        title: "Не закрыт акт скрытых работ по утеплителю",
        detail: "Без акта нельзя предъявлять облицовку захватки 1 к приемке.",
        level: "medium",
        owner: "Волкова Е.С.",
      },
    ],
    finance: [
      { label: "Бюджет по договору", value: 78400000, hint: "договор СИ-2025/114-НВФ от 10 фев 2026" },
      { label: "Факт затрат", value: 44120000, hint: "материалы, монтаж, механизмы — 56% бюджета" },
      { label: "Допработы", value: 3860000, hint: "2 согласованных ДС, 1 в работе" },
      { label: "Прогноз до завершения", value: 81100000, hint: "перерасход 2,7 млн ₽ при текущем темпе" },
    ],
    journal: [
      { id: "j1", at: "2026-08-12T08:12:00+03:00", actor: "Гареев Р.М.", text: "Голосовой отчет по захватке 2 — ожидает проверки" },
      { id: "j2", at: "2026-08-12T07:05:00+03:00", actor: "Контролер сроков", isAgent: true, text: "Создана задача T-1058 по дефициту материала" },
      { id: "j3", at: "2026-08-11T19:40:00+03:00", actor: "Соколов И.П.", text: "Принят отчет R-3375, план-факт обновлен" },
      { id: "j4", at: "2026-08-11T14:22:00+03:00", actor: "Парсер договоров", isAgent: true, text: "Из договора извлечен п. 6.5 — срок исполнительной документации" },
      { id: "j5", at: "2026-08-10T11:10:00+03:00", actor: "Волкова Е.С.", text: "Загружена схема узла примыкания к парапету, ред. 2" },
    ],
    facade: facadeGrid([100, 92, 74, 88, 61, 34, 46, 18, 0, 12, 0, 0]),
  },
];

const defaultDetail = (projectId: string): ObjectDetail => ({
  projectId,
  milestones: [
    { id: "m1", name: "Договор подписан", date: "2026-03-01", status: "done" },
    { id: "m2", name: "Подсистема закрыта", date: "2026-09-10", status: "on_track" },
    { id: "m3", name: "Сдача объекта", date: "2026-12-01", status: "on_track" },
  ],
  risks: [
    {
      id: "r1",
      title: "Темп монтажа ниже плана",
      detail: "Недельный факт ниже плана более чем на 10% три недели подряд.",
      level: "medium",
      owner: "Соколов И.П.",
      fromAgent: "Контролер сроков",
    },
  ],
  finance: [
    { label: "Бюджет по договору", value: 0, hint: "по договору" },
    { label: "Факт затрат", value: 0, hint: "накопительным итогом" },
    { label: "Допработы", value: 0, hint: "согласованные ДС" },
    { label: "Прогноз до завершения", value: 0, hint: "при текущем темпе" },
  ],
  journal: [
    { id: "j1", at: "2026-08-11T16:00:00+03:00", actor: "Соколов И.П.", text: "Обновлен график работ" },
  ],
  facade: facadeGrid([100, 84, 62, 70, 48, 26, 30, 12, 0, 0, 0, 0]),
});

export function getObjectDetail(projectId: string, contractSum = 0, budgetFact = 0): ObjectDetail {
  const found = objectDetails.find((d) => d.projectId === projectId);
  if (found) return found;
  const base = defaultDetail(projectId);
  base.finance = [
    { label: "Бюджет по договору", value: contractSum, hint: "сумма договора" },
    { label: "Факт затрат", value: budgetFact, hint: "накопительным итогом" },
    { label: "Допработы", value: Math.round(contractSum * 0.03), hint: "согласованные ДС" },
    { label: "Прогноз до завершения", value: Math.round(contractSum * 1.02), hint: "при текущем темпе" },
  ];
  return base;
}
