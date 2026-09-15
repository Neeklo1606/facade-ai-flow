import type { ScheduleItem, VolumeEntry, WorkItem, WorkType, WorkZone } from "./types";

/** Договорные расценки. Одна расценка — один источник правды по деньгам. */
export const workTypes: WorkType[] = [
  { id: "wt-facade", name: "Монтаж навесного вентилируемого фасада", unit: "м²", rate: 4332.13 },
  { id: "wt-sub", name: "Монтаж подконструкции", unit: "м²", rate: 1480 },
  { id: "wt-insul", name: "Утепление минеральной ватой", unit: "м²", rate: 960 },
  { id: "wt-plaster", name: "Штукатурный фасад", unit: "м²", rate: 2650 },
  { id: "wt-glass", name: "Монтаж витражных конструкций", unit: "м²", rate: 7400 },
];

export const workZones: WorkZone[] = [
  /* ЖК «Северная Корона», корпус 3 — сквозной объект */
  { id: "z-korona-1", projectId: "p-korona", parentId: null, level: "zone", name: "Захватка 1, оси А–Г", axes: "А–Г", floors: "1–8", planQty: 6400, factQty: 6400, unit: "м²" },
  { id: "z-korona-2", projectId: "p-korona", parentId: null, level: "zone", name: "Захватка 2, оси Г–К", axes: "Г–К", floors: "9–11", planQty: 2400, factQty: 1846, unit: "м²" },
  { id: "z-korona-3", projectId: "p-korona", parentId: null, level: "zone", name: "Захватка 3, оси К–Р", axes: "К–Р", floors: "12–16", planQty: 5200, factQty: 1320, unit: "м²" },
  { id: "z-korona-4", projectId: "p-korona", parentId: null, level: "zone", name: "Стилобат, оси А–Р", axes: "А–Р", floors: "1–2", planQty: 3100, factQty: 0, unit: "м²" },

  /* БЦ «Меридиан» */
  { id: "z-meridian-1", projectId: "p-meridian", parentId: null, level: "zone", name: "Захватка 1, северный фасад", axes: "1–9", floors: "1–7", planQty: 4200, factQty: 2980, unit: "м²" },
  { id: "z-meridian-2", projectId: "p-meridian", parentId: null, level: "zone", name: "Захватка 2, южный фасад", axes: "9–18", floors: "1–7", planQty: 3800, factQty: 1120, unit: "м²" },

  /* ЖК «Приморский квартал», дом 7 */
  { id: "z-primorsky-1", projectId: "p-primorsky", parentId: null, level: "zone", name: "Захватка 1, секция А", axes: "А–Д", floors: "1–10", planQty: 5600, factQty: 4180, unit: "м²" },
  { id: "z-primorsky-2", projectId: "p-primorsky", parentId: null, level: "zone", name: "Захватка 2, секция Б", axes: "Д–И", floors: "1–10", planQty: 5200, factQty: 1600, unit: "м²" },

  /* Школа № 1547 */
  { id: "z-school-1", projectId: "p-school", parentId: null, level: "zone", name: "Главный корпус, дворовый фасад", axes: "1–12", floors: "1–4", planQty: 3400, factQty: 3120, unit: "м²" },
  { id: "z-school-2", projectId: "p-school", parentId: null, level: "zone", name: "Спортивный блок", axes: "12–18", floors: "1–2", planQty: 1800, factQty: 980, unit: "м²" },

  /* ТЦ «Галактика» */
  { id: "z-galaxy-1", projectId: "p-galaxy", parentId: null, level: "zone", name: "Витражи входной группы", axes: "А–В", floors: "1–3", planQty: 1400, factQty: 860, unit: "м²" },
  { id: "z-galaxy-2", projectId: "p-galaxy", parentId: null, level: "zone", name: "Атриум, световой фонарь", axes: "В–Е", floors: "3", planQty: 900, factQty: 240, unit: "м²" },
];

export const workItems: WorkItem[] = workZones.map((zone) => {
  const workTypeId =
    zone.projectId === "p-school" ? "wt-plaster" : zone.projectId === "p-galaxy" ? "wt-glass" : "wt-facade";
  const type = workTypes.find((item) => item.id === workTypeId)!;
  return {
    id: `wi-${zone.id.replace("z-", "")}`,
    projectId: zone.projectId,
    zoneId: zone.id,
    workTypeId,
    name: type.name,
    unit: type.unit,
    planQty: zone.planQty,
    factQty: zone.factQty,
    rate: type.rate,
  } satisfies WorkItem;
});

function rateOf(zoneId: string) {
  return workItems.find((item) => item.zoneId === zoneId)!.rate;
}

function entry(
  input: Omit<VolumeEntry, "amount" | "rate" | "unit" | "projectId" | "workItemId"> & { projectId?: string },
): VolumeEntry {
  const item = workItems.find((wi) => wi.zoneId === input.zoneId)!;
  return {
    ...input,
    projectId: item.projectId,
    workItemId: item.id,
    unit: item.unit,
    rate: item.rate,
    amount: Math.round(input.qty * rateOf(input.zoneId)),
  };
}

/**
 * Записи объёмов — единственный источник денежных агрегатов объекта.
 * Всё, что показывают дашборд, карточка объекта, аналитика и график,
 * считается селекторами из этого массива.
 */
export const volumeEntries: VolumeEntry[] = [
  /* Корона, захватка 1 — закрыта полностью */
  entry({ id: "ve-k1-1", zoneId: "z-korona-1", date: "2026-06-30", qty: 3200, approved: true, closed: true, actNumber: "КС-2 №1", crewId: "cr-korona-1", sourceId: "src-act-k1", reportId: null }),
  entry({ id: "ve-k1-2", zoneId: "z-korona-1", date: "2026-07-31", qty: 3200, approved: true, closed: true, actNumber: "КС-2 №2", crewId: "cr-korona-1", sourceId: "src-act-k2", reportId: null }),

  /* Корона, захватка 2 — 1292 м² закрыто, 554 м² открыто */
  entry({ id: "ve-k2-1", zoneId: "z-korona-2", date: "2026-08-31", qty: 1292, approved: true, closed: true, actNumber: "КС-2 №3", crewId: "cr-korona-1", sourceId: "src-act-k3", reportId: null }),
  entry({ id: "ve-k2-2", zoneId: "z-korona-2", date: "2026-09-05", qty: 554, approved: false, closed: false, actNumber: null, crewId: "cr-korona-1", sourceId: "src-tg-gareev", reportId: "fr-korona-0905" }),

  /* Корона, захватка 3 */
  entry({ id: "ve-k3-1", zoneId: "z-korona-3", date: "2026-08-31", qty: 1320, approved: true, closed: true, actNumber: "КС-2 №3", crewId: "cr-korona-2", sourceId: "src-act-k3", reportId: null }),

  /* Меридиан */
  entry({ id: "ve-m1-1", zoneId: "z-meridian-1", date: "2026-07-31", qty: 1800, approved: true, closed: true, actNumber: "КС-2 №1", crewId: "cr-meridian-1", sourceId: null, reportId: null }),
  entry({ id: "ve-m1-2", zoneId: "z-meridian-1", date: "2026-08-31", qty: 1180, approved: true, closed: true, actNumber: "КС-2 №2", crewId: "cr-meridian-1", sourceId: null, reportId: null }),
  entry({ id: "ve-m2-1", zoneId: "z-meridian-2", date: "2026-09-03", qty: 1120, approved: false, closed: false, actNumber: null, crewId: "cr-meridian-1", sourceId: null, reportId: "fr-meridian-0903" }),

  /* Приморский квартал */
  entry({ id: "ve-p1-1", zoneId: "z-primorsky-1", date: "2026-07-31", qty: 2600, approved: true, closed: true, actNumber: "КС-2 №1", crewId: "cr-primorsky-1", sourceId: null, reportId: null }),
  entry({ id: "ve-p1-2", zoneId: "z-primorsky-1", date: "2026-08-31", qty: 1580, approved: true, closed: true, actNumber: "КС-2 №2", crewId: "cr-primorsky-1", sourceId: null, reportId: null }),
  entry({ id: "ve-p2-1", zoneId: "z-primorsky-2", date: "2026-09-04", qty: 1600, approved: true, closed: false, actNumber: null, crewId: "cr-primorsky-1", sourceId: null, reportId: null }),

  /* Школа */
  entry({ id: "ve-s1-1", zoneId: "z-school-1", date: "2026-07-31", qty: 3120, approved: true, closed: true, actNumber: "КС-2 №1", crewId: "cr-school-1", sourceId: null, reportId: null }),
  entry({ id: "ve-s2-1", zoneId: "z-school-2", date: "2026-08-31", qty: 980, approved: true, closed: true, actNumber: "КС-2 №2", crewId: "cr-school-1", sourceId: null, reportId: null }),

  /* Галактика */
  entry({ id: "ve-g1-1", zoneId: "z-galaxy-1", date: "2026-08-31", qty: 860, approved: true, closed: true, actNumber: "КС-2 №1", crewId: "cr-galaxy-1", sourceId: null, reportId: null }),
  entry({ id: "ve-g2-1", zoneId: "z-galaxy-2", date: "2026-09-02", qty: 240, approved: false, closed: false, actNumber: null, crewId: "cr-galaxy-1", sourceId: null, reportId: null }),
];

export const scheduleItems: ScheduleItem[] = [
  { id: "sch-k-1", projectId: "p-korona", zoneId: "z-korona-1", name: "Захватка 1, оси А–Г", startDate: "2026-05-12", endDate: "2026-07-31", progress: 100, dependsOn: [], crewId: "cr-korona-1", critical: false },
  { id: "sch-k-2", projectId: "p-korona", zoneId: "z-korona-2", name: "Захватка 2, оси Г–К, этажи 9–11", startDate: "2026-08-01", endDate: "2026-09-10", progress: 77, dependsOn: ["sch-k-1"], crewId: "cr-korona-1", critical: true },
  { id: "sch-k-3", projectId: "p-korona", zoneId: "z-korona-3", name: "Захватка 3, оси К–Р", startDate: "2026-08-15", endDate: "2026-11-20", progress: 25, dependsOn: ["sch-k-1"], crewId: "cr-korona-2", critical: true },
  { id: "sch-k-4", projectId: "p-korona", zoneId: "z-korona-4", name: "Стилобат", startDate: "2026-11-01", endDate: "2027-02-28", progress: 0, dependsOn: ["sch-k-3"], crewId: null, critical: false },
  { id: "sch-m-1", projectId: "p-meridian", zoneId: "z-meridian-1", name: "Северный фасад", startDate: "2026-06-01", endDate: "2026-09-30", progress: 71, dependsOn: [], crewId: "cr-meridian-1", critical: true },
  { id: "sch-m-2", projectId: "p-meridian", zoneId: "z-meridian-2", name: "Южный фасад", startDate: "2026-09-01", endDate: "2026-12-20", progress: 29, dependsOn: ["sch-m-1"], crewId: "cr-meridian-1", critical: false },
  { id: "sch-p-1", projectId: "p-primorsky", zoneId: "z-primorsky-1", name: "Секция А", startDate: "2026-05-20", endDate: "2026-10-15", progress: 75, dependsOn: [], crewId: "cr-primorsky-1", critical: false },
  { id: "sch-p-2", projectId: "p-primorsky", zoneId: "z-primorsky-2", name: "Секция Б", startDate: "2026-08-01", endDate: "2027-01-30", progress: 31, dependsOn: ["sch-p-1"], crewId: "cr-primorsky-1", critical: true },
  { id: "sch-s-1", projectId: "p-school", zoneId: "z-school-1", name: "Дворовый фасад", startDate: "2026-04-10", endDate: "2026-08-20", progress: 92, dependsOn: [], crewId: "cr-school-1", critical: false },
  { id: "sch-s-2", projectId: "p-school", zoneId: "z-school-2", name: "Спортивный блок", startDate: "2026-07-01", endDate: "2026-10-10", progress: 54, dependsOn: [], crewId: "cr-school-1", critical: true },
  { id: "sch-g-1", projectId: "p-galaxy", zoneId: "z-galaxy-1", name: "Витражи входной группы", startDate: "2026-06-15", endDate: "2026-09-30", progress: 61, dependsOn: [], crewId: "cr-galaxy-1", critical: false },
  { id: "sch-g-2", projectId: "p-galaxy", zoneId: "z-galaxy-2", name: "Световой фонарь атриума", startDate: "2026-09-01", endDate: "2026-12-15", progress: 27, dependsOn: ["sch-g-1"], crewId: "cr-galaxy-1", critical: true },
];
