/**
 * Стартовый набор газового направления из недельного отчёта плюс демо-сценарии (ADR-043, ADR-047).
 *
 * Один и тот же построитель для набора заказчика (`gas-ops-seed.ts`, личный контур, тесты)
 * и для публичного набора «Демо-подрядчик» (`public/seed.ts`). Данных модуль не содержит:
 * отчёт и населённые пункты демо-объектов приходят параметрами.
 *
 * Правило честности: у каждой записи есть поле `source`. `fact-report` перенесено из недельного
 * отчёта (в личном контуре это настоящий отчёт заказчика, в публичном вымышленный той же формы).
 * `mock` придумано для показа сценариев: черновик, очередь проверки, отклонение, пересечение,
 * дубль, объект без подтверждённой стоимости. В интерфейсе это различимо.
 *
 * «Сегодня» направления: последний день недели отчёта. Так подтверждение записи в очереди видно
 * в том же недельном отчёте, который открыт на экране, и сквозной сценарий проверяется целиком.
 */
import type { FactReport, ShiftFrame } from "./fact-report-types";
import type { ScenarioPlaces } from "./public/places";
import type {
  Assignment,
  AuditLog,
  Brigade,
  Employee,
  Estimate,
  Group,
  Review,
  TimeEntry,
  User,
  WorkObject,
} from "@/domain/gas-ops/model";
import type { CrewMember } from "@/domain/gas-ops/crew";

/** Последний день недели отчёта: он же «сегодня» в демонстрации */
export function todayOf(report: FactReport): string {
  return report.meta.days[report.meta.days.length - 1]!;
}

/** Предыдущий день: нужен сценарию «ввод за вчера» (OPEN-QUESTION 5) */
export function yesterdayOf(report: FactReport): string {
  return report.meta.days[report.meta.days.length - 2]!;
}

export interface GasOpsSeed {
  today: string;
  week: { from: string; to: string; days: string[] };
  groups: Group[];
  brigades: Brigade[];
  employees: Employee[];
  objects: WorkObject[];
  estimates: Estimate[];
  entries: TimeEntry[];
  reviews: Review[];
  audit: AuditLog[];
  frames: ShiftFrame[];
  assignments: Assignment[];
  users: User[];
  crew: CrewMember[];
}

const MANAGER = "u-manager";

function numberOf(index: number): string {
  return `ГЗ-${String(index + 1).padStart(5, "0")}`;
}

export function buildSeedFrom(factReport: FactReport, places: ScenarioPlaces): GasOpsSeed {
  const GAS_TODAY = todayOf(factReport);
  const GAS_YESTERDAY = yesterdayOf(factReport);
  const factDays = factReport.meta.days;
  const groups: Group[] = factReport.groups.map((g) => ({
    id: g.id,
    name: g.name,
    code: g.code,
    excelRow: g.excelRow,
  }));

  const brigades: Brigade[] = factReport.brigades.map((b) => ({
    id: b.id,
    groupId: b.groupId,
    name: b.name,
    code: b.code,
    excelRow: b.excelRow,
    source: "fact-report",
  }));

  const employees: Employee[] = factReport.employees.map((e, i) => ({
    id: e.id,
    brigadeId: e.brigadeId,
    name: e.name,
    isLead: e.isLead,
    // Канал MAX не подключён: идентификатор показывается как имитация рядом со значением
    maxId: `max-demo-${100 + i}`,
    excelRow: e.excelRow,
    source: "fact-report",
  }));

  /*
   * Состав бригад (ADR-056). В отчёте заказчика есть только бригадир, остальных людей нет.
   * Для показа ввода «Кто работал» состав дополнен демо-монтажниками (`source: "mock"`):
   * в Бригаде 1 их трое, в остальных по двое. Справочник подписывает их «Демо»
   */
  const crew: CrewMember[] = [
    ...employees.map((e) => ({
      id: `crw-${e.id}`,
      brigadeId: e.brigadeId,
      employeeId: e.id,
      name: e.name,
      role: e.isLead ? ("lead" as const) : ("worker" as const),
      from: null,
      to: null,
      source: e.source,
    })),
    ...brigades.flatMap((b) =>
      Array.from({ length: b.id === "brg-1" ? 3 : 2 }, (_, i) => ({
        id: `crw-demo-${b.id}-${i + 1}`,
        brigadeId: b.id,
        employeeId: `emp-demo-${b.id}-${i + 1}`,
        name: `Монтажник ${i + 1}`,
        role: "worker" as const,
        from: null,
        to: null,
        source: "mock" as const,
      })),
    ),
  ];
  const crewSize = (brigadeId: string) => crew.filter((m) => m.brigadeId === brigadeId).length;

  const objects: WorkObject[] = factReport.objects.map((o) => ({
    id: o.id,
    label: o.label,
    settlement: o.settlement,
    workType: o.workType,
    code: `ОБ-${String(o.demoNumber).padStart(3, "0")}`,
    source: "fact-report",
  }));

  // --- факт из отчёта: эти записи заказчик уже принял в свой недельный отчёт ---
  const entries: TimeEntry[] = factReport.entries.map((e, i) => ({
    id: e.id,
    number: numberOf(i),
    day: e.day,
    brigadeId: e.brigadeId,
    employeeId: e.employeeId,
    objectId: e.objectId,
    startMinutes: null,
    endMinutes: null,
    breakMinutes: 0,
    minutes: e.minutes ?? 0,
    amountRub: e.amount,
    status: "confirmed",
    createdBy: e.employeeId ?? e.brigadeId,
    createdAt: `${e.day}T18:30:00`,
    reviewedBy: MANAGER,
    reviewedAt: `${e.day}T19:10:00`,
    comment: null,
    source: "fact-report",
    revenueInFile: e.revenueInFile,
    excelRow: e.excelRow,
    // Состава в отчёте нет: человеко-часы по этим строкам не считаются
    headcount: null,
    channel: "import",
  }));

  // --- демо-сценарии: всё ниже помечено source: "mock" ---
  const mockObjects: WorkObject[] = [
    {
      id: "obj-m1",
      label: `${places.main}, ул. Демо, 101 - котел`,
      settlement: places.main,
      workType: "котел",
      code: "ОБ-101",
      source: "mock",
    },
    {
      id: "obj-m2",
      label: `${places.city}, ул. Демо, 102 - котел, насос`,
      settlement: places.city,
      workType: "котел, насос",
      code: "ОБ-102",
      source: "mock",
    },
    {
      id: "obj-m3",
      label: `${places.farm}, ул. Демо, 103 - ввод`,
      settlement: places.farm,
      workType: "ввод",
      code: "ОБ-103",
      source: "mock",
    },
    // Объект сценария показа (ADR-044, F3): стоимость подтверждена, записей по нему нет
    {
      id: "obj-m200",
      label: `${places.main}, ул. Демо, 200 - котел`,
      settlement: places.main,
      workType: "котел",
      code: "ОБ-200",
      source: "mock",
    },
  ];

  const estimates: Estimate[] = [
    {
      id: "est-m1",
      objectId: "obj-m1",
      version: 1,
      amountRub: 14_700,
      status: "manual-pending",
      origin: "manual",
      confirmedBy: null,
      confirmedAt: null,
      note: "Котёл без сметы: сумму вносит менеджер. Кто утверждает — OPEN-QUESTION 4.",
      source: "mock",
    },
    {
      id: "est-m2",
      objectId: "obj-m2",
      version: 2,
      amountRub: 19_950,
      status: "confirmed",
      origin: "estimate",
      confirmedBy: MANAGER,
      confirmedAt: `${GAS_YESTERDAY}T11:20:00`,
      note: "Стоимость работ без материалов. Какие статьи входят — OPEN-QUESTION 3.",
      source: "mock",
    },
    {
      id: "est-m3",
      objectId: "obj-m3",
      version: 1,
      amountRub: 0,
      status: "missing",
      origin: "none",
      confirmedBy: null,
      confirmedAt: null,
      note: "Ввод: стоимость работ не передана, время есть. Доходность не считается.",
      source: "mock",
    },
    {
      id: "est-m200",
      objectId: "obj-m200",
      version: 1,
      amountRub: 14_700,
      status: "confirmed",
      origin: "estimate",
      confirmedBy: MANAGER,
      confirmedAt: `${GAS_YESTERDAY}T16:00:00`,
      note: "Итог сметчика: стоимость работ без материалов.",
      source: "mock",
    },
  ];

  const mock = (
    index: number,
    data: Omit<TimeEntry, "id" | "number" | "source" | "breakMinutes"> &
      Partial<Pick<TimeEntry, "breakMinutes">>,
  ): TimeEntry => ({
    id: `mk-${index}`,
    number: numberOf(entries.length + index),
    breakMinutes: 0,
    source: "mock",
    // Демо-записи пришли из бота, работал весь состав бригады
    headcount: crewSize(data.brigadeId),
    channel: "bot",
    ...data,
  });

  const mockEntries: TimeEntry[] = [
    // 1. Черновик бригадира: ещё не отправлен на проверку
    mock(1, {
      day: GAS_TODAY,
      brigadeId: "brg-1",
      employeeId: "emp-1-1",
      objectId: "obj-m1",
      // Утро до 11:40: у Бригады 1 свободно 12:00–15:00 для сценария показа (ADR-044, F3)
      startMinutes: 8 * 60 + 10,
      endMinutes: 11 * 60 + 40,
      breakMinutes: 30,
      minutes: 180,
      amountRub: null,
      status: "draft",
      createdBy: "emp-1-1",
      createdAt: `${GAS_TODAY}T12:45:00`,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    }),
    // 2. Ожидает проверки: обычная запись в очереди
    mock(2, {
      day: GAS_TODAY,
      brigadeId: "brg-2",
      employeeId: "emp-2-1",
      objectId: "obj-m2",
      startMinutes: 8 * 60,
      endMinutes: 16 * 60 + 30,
      breakMinutes: 40,
      minutes: 470,
      amountRub: 19_950,
      status: "pending",
      createdBy: "emp-2-1",
      createdAt: `${GAS_TODAY}T16:40:00`,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    }),
    // 3 и 4. Пересечение времени внутри одной бригады за один день
    mock(3, {
      day: GAS_TODAY,
      brigadeId: "brg-3",
      employeeId: "emp-3-1",
      objectId: "obj-m1",
      startMinutes: 9 * 60,
      endMinutes: 13 * 60,
      breakMinutes: 0,
      minutes: 240,
      amountRub: 14_700,
      status: "pending",
      createdBy: "emp-3-1",
      createdAt: `${GAS_TODAY}T13:05:00`,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    }),
    mock(4, {
      day: GAS_TODAY,
      brigadeId: "brg-3",
      employeeId: "emp-3-1",
      objectId: "obj-m3",
      startMinutes: 12 * 60,
      endMinutes: 15 * 60,
      breakMinutes: 0,
      minutes: 180,
      amountRub: null,
      status: "pending",
      createdBy: "emp-3-1",
      createdAt: `${GAS_TODAY}T15:10:00`,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    }),
    // 5 и 6. Дубль: та же бригада, тот же объект, тот же день
    mock(5, {
      day: GAS_TODAY,
      brigadeId: "brg-4",
      employeeId: "emp-4-1",
      objectId: "obj-m2",
      startMinutes: 8 * 60 + 20,
      endMinutes: 14 * 60,
      breakMinutes: 30,
      minutes: 310,
      amountRub: 19_950,
      status: "pending",
      createdBy: "emp-4-1",
      createdAt: `${GAS_TODAY}T14:10:00`,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    }),
    mock(6, {
      day: GAS_TODAY,
      brigadeId: "brg-4",
      employeeId: "emp-4-1",
      objectId: "obj-m2",
      startMinutes: 14 * 60 + 30,
      endMinutes: 17 * 60,
      breakMinutes: 0,
      minutes: 150,
      amountRub: 19_950,
      // Людей больше, чем в составе: признак «Состав больше бригады» (ADR-056)
      headcount: crewSize("brg-4") + 2,
      status: "pending",
      createdBy: "emp-4-1",
      createdAt: `${GAS_TODAY}T17:05:00`,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    }),
    // 7. Отклонено с причиной
    mock(7, {
      day: GAS_YESTERDAY,
      brigadeId: "brg-5",
      employeeId: "emp-5-1",
      objectId: "obj-m1",
      startMinutes: 7 * 60 + 30,
      endMinutes: 7 * 60 + 45,
      breakMinutes: 0,
      minutes: 15,
      amountRub: null,
      status: "rejected",
      createdBy: "emp-5-1",
      createdAt: `${GAS_YESTERDAY}T07:50:00`,
      reviewedBy: MANAGER,
      reviewedAt: `${GAS_YESTERDAY}T09:00:00`,
      comment: "Заезд на объект, работы не начинались. Время не учитывается.",
    }),
    // 8. Требует уточнения: объект тот, время спорное
    mock(8, {
      day: GAS_YESTERDAY,
      brigadeId: "brg-7",
      employeeId: "emp-7-2",
      objectId: "obj-m3",
      startMinutes: 8 * 60,
      endMinutes: 17 * 60,
      breakMinutes: 60,
      minutes: 480,
      amountRub: null,
      status: "clarify",
      createdBy: "emp-7-2",
      createdAt: `${GAS_YESTERDAY}T17:20:00`,
      reviewedBy: MANAGER,
      reviewedAt: `${GAS_YESTERDAY}T18:00:00`,
      comment: "Уточните, был ли обед: в рамке смены 9 часов, перерыв указан один час.",
    }),
    // 9. Ввод за вчера бригадиром: правило согласуется (OPEN-QUESTION 5)
    mock(9, {
      day: GAS_YESTERDAY,
      brigadeId: "brg-1",
      employeeId: "emp-1-1",
      objectId: "obj-m2",
      startMinutes: 8 * 60 + 30,
      endMinutes: 11 * 60 + 40,
      breakMinutes: 0,
      minutes: 190,
      amountRub: 19_950,
      status: "pending",
      createdBy: "emp-1-1",
      createdAt: `${GAS_TODAY}T08:05:00`,
      reviewedBy: null,
      reviewedAt: null,
      comment: null,
    }),
  ];

  const reviews: Review[] = [
    {
      id: "rev-m1",
      entryId: "mk-7",
      action: "reject",
      actor: MANAGER,
      at: `${GAS_YESTERDAY}T09:00:00`,
      comment: "Заезд на объект, работы не начинались. Время не учитывается.",
      changes: [],
    },
    {
      id: "rev-m2",
      entryId: "mk-8",
      action: "clarify",
      actor: MANAGER,
      at: `${GAS_YESTERDAY}T18:00:00`,
      comment: "Уточните, был ли обед: в рамке смены 9 часов, перерыв указан один час.",
      changes: [],
    },
  ];

  const audit: AuditLog[] = [
    {
      id: "aud-m1",
      at: `${GAS_YESTERDAY}T09:00:00`,
      actor: MANAGER,
      action: "entry.reject",
      entityId: "mk-7",
      detail: "Запись отклонена: заезд на объект без работ",
    },
    {
      id: "aud-m2",
      at: `${GAS_YESTERDAY}T11:20:00`,
      actor: MANAGER,
      action: "estimate.confirm",
      entityId: "est-m2",
      detail: "Подтверждена стоимость работ 19 950 ₽ без материалов",
    },
  ];

  /*
   * Назначения «на сегодня» (ADR-044, F3–F4): у каждой бригады 2–5 объектов. В выгрузке
   * заказчика назначений нет, поэтому это демо-данные: объекты недели бригады плюс демо-объекты.
   */
  const assignments: Assignment[] = brigades.map((brigade, index) => {
    const own = [
      ...new Set(
        entries
          .filter((e) => e.brigadeId === brigade.id)
          .sort((a, b) => b.day.localeCompare(a.day))
          .map((e) => e.objectId),
      ),
    ];
    const extra =
      brigade.id === "brg-1" ? ["obj-m200", "obj-m1"] : index % 2 ? ["obj-m2"] : ["obj-m1"];
    const picked = [...extra, ...own.filter((id) => !extra.includes(id))].slice(0, 2 + (index % 4));
    return {
      brigadeId: brigade.id,
      day: GAS_TODAY,
      objectIds: picked.length >= 2 ? picked : [...picked, "obj-m3"],
      source: "mock",
    };
  });

  const brigadeOneObjects = [
    ...new Set(entries.filter((e) => e.brigadeId === "brg-1").map((e) => e.objectId)),
  ];

  const users: User[] = [
    {
      id: "u-admin",
      name: "Администратор",
      role: "admin",
      brigadeId: null,
      allowedObjectIds: "all",
    },
    {
      id: MANAGER,
      name: "Менеджер проверки",
      role: "manager",
      brigadeId: null,
      allowedObjectIds: "all",
    },
    {
      id: "u-foreman-1",
      name: "Бригадир 1",
      role: "foreman",
      brigadeId: "brg-1",
      // Бригадир вводит время только по разрешённым объектам (ТЗ, п. 5.3)
      allowedObjectIds: [...brigadeOneObjects, "obj-m1", "obj-m2"],
    },
    {
      id: "u-director",
      name: "Руководитель",
      role: "director",
      brigadeId: null,
      allowedObjectIds: "all",
    },
    // Модули 2 и 3 (ADR-057): прораб ведёт демо-объекты, снабженец и ПТО видят все
    {
      id: "u-prorab",
      name: "Прораб",
      role: "prorab",
      brigadeId: null,
      allowedObjectIds: mockObjects.map((o) => o.id),
    },
    {
      id: "u-supply",
      name: "Снабженец",
      role: "supply",
      brigadeId: null,
      allowedObjectIds: "all",
    },
    {
      id: "u-pto",
      name: "ПТО",
      role: "pto",
      brigadeId: null,
      allowedObjectIds: "all",
    },
  ];

  return {
    today: GAS_TODAY,
    week: { from: factReport.meta.week.from, to: factReport.meta.week.to, days: factDays },
    groups,
    brigades,
    employees,
    objects: [...objects, ...mockObjects],
    estimates,
    entries: [...entries, ...mockEntries],
    reviews,
    audit,
    frames: factReport.frames,
    assignments,
    users,
    crew,
  };
}
