export type ProjectStatus = "ok" | "warn" | "danger" | "done";

export interface Project {
  id: string;
  name: string;
  shortName: string;
  address: string;
  customer: string;
  contractNo: string;
  contractDate: string;
  contractSum: number;
  deadline: string;
  startDate: string;
  progress: number;
  manager: string;
  status: ProjectStatus;
  budgetFact: number;
  areaTotal: number;
  areaDone: number;
  openTasks: number;
  overdueTasks: number;
  planFactDeviation: number;
}

export const projects: Project[] = [
  {
    id: "obj-severnaya-korona",
    name: "ЖК «Северная Корона», корпус 3",
    shortName: "Северная Корона к3",
    address: "г. Москва, ул. Полярная, вл. 14, корп. 3",
    customer: "ГК «Стройинвест»",
    contractNo: "СИ-2025/114-НВФ",
    contractDate: "2026-02-10",
    contractSum: 78400000,
    startDate: "2026-03-02",
    deadline: "2026-11-28",
    progress: 62,
    manager: "Соколов И.П.",
    status: "warn",
    budgetFact: 44120000,
    areaTotal: 14200,
    areaDone: 8804,
    openTasks: 23,
    overdueTasks: 4,
    planFactDeviation: -6.4,
  },
  {
    id: "obj-meridian",
    name: "БЦ «Меридиан»",
    shortName: "БЦ Меридиан",
    address: "г. Москва, Дмитровское ш., 71с2",
    customer: "ООО «Проектстрой»",
    contractNo: "ПС-2025/067-СПК",
    contractDate: "2026-01-22",
    contractSum: 95300000,
    startDate: "2026-02-16",
    deadline: "2026-12-20",
    progress: 41,
    manager: "Соколов И.П.",
    status: "danger",
    budgetFact: 37980000,
    areaTotal: 9800,
    areaDone: 4018,
    openTasks: 31,
    overdueTasks: 7,
    planFactDeviation: -11.2,
  },
  {
    id: "obj-primorskiy",
    name: "ЖК «Приморский квартал», дом 7",
    shortName: "Приморский д7",
    address: "г. Санкт-Петербург, Приморский пр., 42",
    customer: "АО «ДСК-Регион»",
    contractNo: "ДСК-2026/009-НВФ",
    contractDate: "2026-04-04",
    contractSum: 52700000,
    startDate: "2026-05-12",
    deadline: "2027-02-15",
    progress: 24,
    manager: "Соколов И.П.",
    status: "ok",
    budgetFact: 11480000,
    areaTotal: 11350,
    areaDone: 2724,
    openTasks: 18,
    overdueTasks: 1,
    planFactDeviation: 1.8,
  },
  {
    id: "obj-school-1547",
    name: "Школа № 1547, реконструкция фасада",
    shortName: "Школа 1547",
    address: "г. Москва, ул. Хлобыстова, 12",
    customer: "ГК «Стройинвест»",
    contractNo: "СИ-2026/021-РЕК",
    contractDate: "2026-03-18",
    contractSum: 18600000,
    startDate: "2026-06-01",
    deadline: "2026-09-25",
    progress: 78,
    manager: "Соколов И.П.",
    status: "ok",
    budgetFact: 13740000,
    areaTotal: 3200,
    areaDone: 2496,
    openTasks: 9,
    overdueTasks: 0,
    planFactDeviation: 2.6,
  },
  {
    id: "obj-galaktika",
    name: "ТЦ «Галактика»",
    shortName: "ТЦ Галактика",
    address: "г. Химки, Ленинградское ш., 5",
    customer: "ООО «Проектстрой»",
    contractNo: "ПС-2026/033-СПК",
    contractDate: "2026-05-06",
    contractSum: 43900000,
    startDate: "2026-06-22",
    deadline: "2027-01-30",
    progress: 12,
    manager: "Соколов И.П.",
    status: "warn",
    budgetFact: 5120000,
    areaTotal: 7600,
    areaDone: 912,
    openTasks: 14,
    overdueTasks: 2,
    planFactDeviation: -3.1,
  },
];

export const getProject = (id: string) => projects.find((p) => p.id === id);
