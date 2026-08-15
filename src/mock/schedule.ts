/** График работ: 4 уровня — объект → этап → захватка → работа. Синтетические данные. */

export interface WorkItem {
  id: string;
  name: string;
  planStart: string;
  planEnd: string;
  factStart?: string;
  factEnd?: string;
  progress: number;
  critical?: boolean;
}

export interface ZoneItem {
  id: string;
  name: string;
  works: WorkItem[];
}

export interface StageItem {
  id: string;
  name: string;
  zones: ZoneItem[];
}

export interface ProjectSchedule {
  projectId: string;
  stages: StageItem[];
}

export const schedules: ProjectSchedule[] = [
  {
    projectId: "obj-severnaya-korona",
    stages: [
      {
        id: "st-sk-1",
        name: "Подготовка и замеры",
        zones: [
          {
            id: "z-sk-1-1",
            name: "Захватка 1, оси А-Г",
            works: [
              {
                id: "w-sk-101",
                name: "Геодезическая съемка фасада",
                planStart: "2026-03-02",
                planEnd: "2026-03-20",
                factStart: "2026-03-02",
                factEnd: "2026-03-22",
                progress: 100,
              },
              {
                id: "w-sk-102",
                name: "Замерная карта, согласование",
                planStart: "2026-03-16",
                planEnd: "2026-04-06",
                factStart: "2026-03-20",
                factEnd: "2026-04-14",
                progress: 100,
                critical: true,
              },
            ],
          },
        ],
      },
      {
        id: "st-sk-2",
        name: "Подсистема",
        zones: [
          {
            id: "z-sk-2-1",
            name: "Захватка 1, оси А-Г",
            works: [
              {
                id: "w-sk-201",
                name: "Установка кронштейнов, 1-8 этажи",
                planStart: "2026-04-08",
                planEnd: "2026-05-28",
                factStart: "2026-04-15",
                factEnd: "2026-06-04",
                progress: 100,
                critical: true,
              },
              {
                id: "w-sk-202",
                name: "Монтаж направляющих, 1-8 этажи",
                planStart: "2026-05-12",
                planEnd: "2026-06-24",
                factStart: "2026-05-22",
                factEnd: "2026-07-02",
                progress: 100,
              },
            ],
          },
          {
            id: "z-sk-2-2",
            name: "Захватка 2, оси Г-К",
            works: [
              {
                id: "w-sk-203",
                name: "Установка кронштейнов, 9-16 этажи",
                planStart: "2026-06-01",
                planEnd: "2026-07-17",
                factStart: "2026-06-08",
                factEnd: "2026-07-28",
                progress: 100,
                critical: true,
              },
              {
                id: "w-sk-204",
                name: "Монтаж направляющих, 9-16 этажи",
                planStart: "2026-07-06",
                planEnd: "2026-08-21",
                factStart: "2026-07-20",
                progress: 74,
                critical: true,
              },
            ],
          },
        ],
      },
      {
        id: "st-sk-3",
        name: "Утеплитель и мембрана",
        zones: [
          {
            id: "z-sk-3-1",
            name: "Захватка 1, оси А-Г",
            works: [
              {
                id: "w-sk-301",
                name: "Монтаж утеплителя 100 мм",
                planStart: "2026-06-15",
                planEnd: "2026-07-31",
                factStart: "2026-06-24",
                factEnd: "2026-08-06",
                progress: 100,
              },
              {
                id: "w-sk-302",
                name: "Ветрозащитная мембрана",
                planStart: "2026-07-13",
                planEnd: "2026-08-14",
                factStart: "2026-07-24",
                progress: 88,
              },
            ],
          },
          {
            id: "z-sk-3-2",
            name: "Захватка 2, оси Г-К",
            works: [
              {
                id: "w-sk-303",
                name: "Монтаж утеплителя 100 мм",
                planStart: "2026-07-27",
                planEnd: "2026-09-11",
                factStart: "2026-08-05",
                progress: 34,
                critical: true,
              },
            ],
          },
        ],
      },
      {
        id: "st-sk-4",
        name: "Облицовка",
        zones: [
          {
            id: "z-sk-4-1",
            name: "Захватка 1, оси А-Г",
            works: [
              {
                id: "w-sk-401",
                name: "Керамогранит 600х600, 1-8 этажи",
                planStart: "2026-07-20",
                planEnd: "2026-09-18",
                factStart: "2026-07-30",
                progress: 46,
              },
            ],
          },
          {
            id: "z-sk-4-2",
            name: "Захватка 2, оси Г-К",
            works: [
              {
                id: "w-sk-402",
                name: "Керамогранит 600х600, 9-16 этажи",
                planStart: "2026-08-24",
                planEnd: "2026-10-23",
                progress: 0,
                critical: true,
              },
            ],
          },
        ],
      },
      {
        id: "st-sk-5",
        name: "Примыкания и сдача",
        zones: [
          {
            id: "z-sk-5-1",
            name: "Весь фасад",
            works: [
              {
                id: "w-sk-501",
                name: "Монтаж примыканий и отливов",
                planStart: "2026-09-21",
                planEnd: "2026-10-30",
                progress: 0,
                critical: true,
              },
              {
                id: "w-sk-502",
                name: "Исполнительная документация, сдача",
                planStart: "2026-10-26",
                planEnd: "2026-11-28",
                progress: 0,
                critical: true,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    projectId: "obj-meridian",
    stages: [
      {
        id: "st-md-1",
        name: "Подсистема",
        zones: [
          {
            id: "z-md-1-1",
            name: "Захватка 1, оси А-Г",
            works: [
              {
                id: "w-md-101",
                name: "Установка кронштейнов, 1-7 этажи",
                planStart: "2026-03-02",
                planEnd: "2026-05-15",
                factStart: "2026-03-16",
                factEnd: "2026-06-05",
                progress: 100,
                critical: true,
              },
              {
                id: "w-md-102",
                name: "Монтаж направляющих, 6-7 этажи",
                planStart: "2026-06-08",
                planEnd: "2026-08-14",
                factStart: "2026-06-22",
                progress: 62,
                critical: true,
              },
            ],
          },
        ],
      },
      {
        id: "st-md-2",
        name: "Светопрозрачные конструкции",
        zones: [
          {
            id: "z-md-2-1",
            name: "Захватка 2, оси Г-Л",
            works: [
              {
                id: "w-md-201",
                name: "Монтаж стоечно-ригельной системы",
                planStart: "2026-07-06",
                planEnd: "2026-09-25",
                factStart: "2026-07-27",
                progress: 28,
                critical: true,
              },
              {
                id: "w-md-202",
                name: "Установка стеклопакетов",
                planStart: "2026-09-07",
                planEnd: "2026-11-20",
                progress: 0,
              },
            ],
          },
        ],
      },
      {
        id: "st-md-3",
        name: "Сдача",
        zones: [
          {
            id: "z-md-3-1",
            name: "Весь фасад",
            works: [
              {
                id: "w-md-301",
                name: "Пусконаладка и сдача заказчику",
                planStart: "2026-11-16",
                planEnd: "2026-12-20",
                progress: 0,
                critical: true,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    projectId: "obj-school-1547",
    stages: [
      {
        id: "st-sh-1",
        name: "Утеплитель",
        zones: [
          {
            id: "z-sh-1-1",
            name: "Главный фасад",
            works: [
              {
                id: "w-sh-101",
                name: "Монтаж утеплителя 1-3 этажи",
                planStart: "2026-06-01",
                planEnd: "2026-07-10",
                factStart: "2026-06-01",
                factEnd: "2026-07-08",
                progress: 100,
              },
            ],
          },
        ],
      },
      {
        id: "st-sh-2",
        name: "Штукатурный слой",
        zones: [
          {
            id: "z-sh-2-1",
            name: "Главный фасад",
            works: [
              {
                id: "w-sh-201",
                name: "Базовый и декоративный слой",
                planStart: "2026-07-06",
                planEnd: "2026-09-04",
                factStart: "2026-07-06",
                progress: 71,
                critical: true,
              },
            ],
          },
          {
            id: "z-sh-2-2",
            name: "Дворовый фасад",
            works: [
              {
                id: "w-sh-202",
                name: "Базовый и декоративный слой",
                planStart: "2026-08-03",
                planEnd: "2026-09-25",
                factStart: "2026-08-10",
                progress: 22,
                critical: true,
              },
            ],
          },
        ],
      },
    ],
  },
];

export const getSchedule = (projectId: string) =>
  schedules.find((s) => s.projectId === projectId);

/** План-факт по неделям, м² смонтированной облицовки. Факт — из принятых отчётов. */
export interface WeekPoint {
  week: string;
  plan: number;
  fact: number;
}

export const weeklyPlanFact: Record<string, WeekPoint[]> = {
  "obj-severnaya-korona": [
    { week: "23 июн", plan: 620, fact: 604 },
    { week: "30 июн", plan: 640, fact: 588 },
    { week: "7 июл", plan: 660, fact: 612 },
    { week: "14 июл", plan: 660, fact: 570 },
    { week: "21 июл", plan: 680, fact: 646 },
    { week: "28 июл", plan: 680, fact: 602 },
    { week: "4 авг", plan: 700, fact: 588 },
    { week: "11 авг", plan: 700, fact: 226 },
  ],
  "obj-meridian": [
    { week: "23 июн", plan: 480, fact: 402 },
    { week: "30 июн", plan: 500, fact: 388 },
    { week: "7 июл", plan: 520, fact: 430 },
    { week: "14 июл", plan: 520, fact: 366 },
    { week: "21 июл", plan: 540, fact: 402 },
    { week: "28 июл", plan: 540, fact: 458 },
    { week: "4 авг", plan: 560, fact: 412 },
    { week: "11 авг", plan: 560, fact: 168 },
  ],
  "obj-school-1547": [
    { week: "23 июн", plan: 260, fact: 268 },
    { week: "30 июн", plan: 260, fact: 254 },
    { week: "7 июл", plan: 280, fact: 288 },
    { week: "14 июл", plan: 280, fact: 274 },
    { week: "21 июл", plan: 300, fact: 306 },
    { week: "28 июл", plan: 300, fact: 292 },
    { week: "4 авг", plan: 300, fact: 284 },
    { week: "11 авг", plan: 300, fact: 122 },
  ],
};

export function weeklyForProjects(projectIds: string[]): WeekPoint[] {
  const rows = projectIds.map((id) => weeklyPlanFact[id]).filter(Boolean) as WeekPoint[][];
  if (rows.length === 0) return [];
  const base = rows[0]!;
  return base.map((point, i) => ({
    week: point.week,
    plan: rows.reduce((s, r) => s + (r[i]?.plan ?? 0), 0),
    fact: rows.reduce((s, r) => s + (r[i]?.fact ?? 0), 0),
  }));
}
