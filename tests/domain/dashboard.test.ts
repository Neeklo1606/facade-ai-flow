import { describe, expect, test } from "bun:test";
import type {
  Contract,
  ExtractionJob,
  Project,
  ProjectDocument,
  ProjectOverview,
  SupplyRequest,
  TimelineEvent,
  WorkZone,
} from "@/contracts";
import {
  attentionRows,
  dashboardInsight,
  dashboardMetrics,
  dashboardPeriodLabel,
  dashboardPeriodSuffix,
  liveFeed,
  mlnRub,
  mlnRubShort,
  periodStart,
  projectProgress,
  runningProjects,
  unclosedVolume,
  type DashboardMetric,
  type DashboardSource,
} from "@/domain/dashboard";

/* ---------- Фабрики ---------- */

type RegistryRow = DashboardSource["projects"][number];
type DocumentRow = DashboardSource["documents"][number];
type CardRow = DashboardSource["cards"][number];
type RequestRow = DashboardSource["requests"][number];
type PendingRow = DashboardSource["pending"][number];

/** «Сейчас» источника: 18.09.2026, полдень, локальное время без пояса, как в фикстурах */
const NOW = "2026-09-18T12:00:00";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "БЦ «Меридиан»",
    code: "МР-1",
    customerId: "c-1",
    customer: "Проект-Инвест",
    region: "Москва",
    stage: "Северный фасад",
    status: "active",
    manager: "e-1",
    startDate: "2026-06-01",
    endDate: "2026-12-20",
    contractId: null,
    contract: "",
    ...overrides,
  };
}

function overview(projectId: string, overrides: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    projectId,
    region: "Москва",
    stage: "Северный фасад",
    docVersion: "Рев. 1",
    specTotal: 0,
    specUnverified: 0,
    inRequests: 0,
    offersReceived: 0,
    ordered: 0,
    inTransit: 0,
    delivered: 0,
    activeRequests: 0,
    overdueRequests: 0,
    openChanges: 0,
    missingReports: 0,
    deliveriesToAccept: 0,
    openRemarks: 0,
    ...overrides,
  };
}

function registry(
  projectOverrides: Partial<Project> = {},
  overviewOverrides: Partial<ProjectOverview> = {},
): RegistryRow {
  const p = project(projectOverrides);
  return { project: p, overview: overview(p.id, overviewOverrides) };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "k-1",
    projectId: "p-1",
    customerId: "c-1",
    number: "Д-1",
    signedAt: "2026-05-01",
    startDate: "2026-06-01",
    endDate: "2026-12-20",
    amount: 0,
    advance: 0,
    retentionPct: 5,
    paymentTermDays: 30,
    status: "active",
    sourceId: null,
    ...overrides,
  };
}

function zone(overrides: Partial<WorkZone> = {}): WorkZone {
  return {
    id: "z-1",
    projectId: "p-1",
    parentId: null,
    level: "zone",
    name: "Захватка 1",
    axes: null,
    floors: null,
    planQty: 0,
    factQty: 0,
    unit: "м²",
    ...overrides,
  };
}

function card(
  projectOverrides: Partial<Project>,
  zones: WorkZone[],
  contractOverrides: Partial<Contract> | null = null,
): CardRow {
  const p = project(projectOverrides);
  return {
    project: p,
    contract: contractOverrides ? contract({ projectId: p.id, ...contractOverrides }) : null,
    zones,
  };
}

function document(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: "d-1",
    documentId: "doc-1",
    revision: 1,
    projectId: "p-1",
    title: "Спецификация",
    section: "КМ",
    version: "Рев. 1",
    fileName: "spec.pdf",
    fileType: "pdf",
    sizeKb: 100,
    uploadedAt: "2026-09-01T10:00:00",
    uploadedBy: "e-1",
    sheetCount: 1,
    status: "review",
    sourceId: null,
    positionsTotal: null,
    positionsVerified: null,
    ...overrides,
  };
}

function job(status: ExtractionJob["status"]): ExtractionJob {
  const finished = status === "review" || status === "failed";
  return {
    id: `j-${status}`,
    revisionId: "d-1",
    status,
    stage: 0,
    queuedAt: "2026-09-01T10:00:00",
    startedAt: null,
    finishedAt: finished ? "2026-09-01T11:00:00" : null,
    error: status === "failed" ? "файл не читается" : null,
  };
}

function documentRow(
  overrides: Partial<ProjectDocument>,
  counts: { extracted?: number; verified?: number; job?: ExtractionJob | null } = {},
): DocumentRow {
  return {
    document: document(overrides),
    extracted: counts.extracted ?? 0,
    verified: counts.verified ?? 0,
    job: counts.job ?? null,
  };
}

function request(overrides: Partial<SupplyRequest> = {}): SupplyRequest {
  return {
    id: "r-1",
    number: "З-2026/318",
    projectId: "p-1",
    zoneId: null,
    authorId: "e-1",
    createdAt: "2026-09-01T09:00:00",
    sentAt: "2026-09-01T10:00:00",
    replyDueAt: "2026-09-05T10:00:00",
    templateId: null,
    status: "sent",
    sourceId: null,
    items: [],
    sentTo: [],
    ...overrides,
  };
}

function requestRow(
  overrides: Partial<SupplyRequest>,
  row: Partial<Omit<RequestRow, "request">> = {},
): RequestRow {
  return {
    request: request(overrides),
    answered: 0,
    status: "collecting",
    replyDue: null,
    decisionId: null,
    ...row,
  };
}

function pending(projectId: string, id: string, kind: PendingRow["kind"]): PendingRow {
  return {
    projectId,
    id,
    kind,
    title: `Пункт ${id}`,
    details: `Детали ${id}`,
    link: `/projects/${projectId}/history`,
  };
}

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "ev-1",
    projectId: "p-1",
    at: "2026-09-18T10:00:00",
    type: "report_added",
    title: "Отчёт",
    details: null,
    actorId: null,
    sourceId: null,
    link: null,
    ...overrides,
  };
}

function source(overrides: Partial<DashboardSource> = {}): DashboardSource {
  return {
    now: NOW,
    period: "week",
    projects: [],
    documents: [],
    cards: [],
    requests: [],
    pending: [],
    events: [],
    ...overrides,
  };
}

function metric(list: DashboardMetric[], key: string): DashboardMetric {
  const found = list.find((item) => item.key === key);
  if (!found) throw new Error(`нет метрики ${key}`);
  return found;
}

const NO_GROWTH = { text: "без прироста", direction: "flat", effect: "neutral" } as const;

/** Выполнить в заданном часовом поясе машины и вернуть пояс обратно */
function inTimeZone(tz: string, run: () => void) {
  const original = process.env["TZ"];
  process.env["TZ"] = tz;
  try {
    run();
  } finally {
    process.env["TZ"] = original ?? "UTC";
  }
}

/* ---------- Период ---------- */

describe("подписи периодов", () => {
  test("подпись и родительный падеж для каждого периода", () => {
    expect(dashboardPeriodLabel).toEqual({ shift: "Смена", week: "7 дней", month: "30 дней" });
    expect(dashboardPeriodSuffix).toEqual({
      shift: "за смену",
      week: "за 7 дней",
      month: "за 30 дней",
    });
  });
});

describe("periodStart", () => {
  test("смена — ровно 12 часов назад", () => {
    expect(periodStart(NOW, "shift")).toBe("2026-09-18T00:00:00");
  });

  test("неделя — ровно 7 суток назад", () => {
    expect(periodStart(NOW, "week")).toBe("2026-09-11T12:00:00");
  });

  test("месяц — ровно 30 суток назад, через границу месяца", () => {
    // 18.09 − 30 суток: 18 дней до 31.08, ещё 12 — 19.08
    expect(periodStart(NOW, "month")).toBe("2026-08-19T12:00:00");
  });

  test("смена через полночь уходит во вчера", () => {
    expect(periodStart("2026-09-18T06:30:00", "shift")).toBe("2026-09-17T18:30:00");
  });

  test("формат отметки — локальное время без пояса и миллисекунд, как в данных", () => {
    expect(periodStart(NOW, "week")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  test("начало смены не зависит от часового пояса машины (UTC+8)", () => {
    // Отметки в данных — местное время без пояса: 12:00 − 12 ч = 00:00 того же дня
    inTimeZone("Asia/Makassar", () => {
      expect(periodStart(NOW, "shift")).toBe("2026-09-18T00:00:00");
    });
  });
});

/* ---------- Объекты в работе ---------- */

describe("runningProjects", () => {
  test("оставляет «В работе» и «Под риском» в исходном порядке", () => {
    const rows = [
      registry({ id: "a", status: "paused" }),
      registry({ id: "b", status: "at_risk" }),
      registry({ id: "c", status: "done" }),
      registry({ id: "d", status: "active" }),
    ];
    expect(runningProjects(rows).map((row) => row.project.id)).toEqual(["b", "d"]);
  });

  test("пустой список — пустой результат", () => {
    expect(runningProjects([])).toEqual([]);
  });
});

/* ---------- Метрики ---------- */

describe("dashboardMetrics", () => {
  test("пустой источник: нули и честное «без прироста» у всех шести метрик", () => {
    const list = dashboardMetrics(source());
    expect(list.map((item) => item.key)).toEqual([
      "active",
      "unverified",
      "silent",
      "overdue",
      "processing",
      "volume",
    ]);
    for (const item of list) expect(item.delta).toEqual(NO_GROWTH);
    expect(list.map((item) => item.value)).toEqual(["0", "0", "0", "0", "0", "0 млн ₽"]);
  });

  test("каждая метрика ведёт в реестр со своим фильтром", () => {
    const list = dashboardMetrics(source());
    expect(list.map((item) => [item.key, item.to, item.search])).toEqual([
      ["active", "/projects", { status: "active" }],
      ["unverified", "/projects", { unverified: true }],
      ["silent", "/projects", { section: "procurement", sectionStatus: "open" }],
      ["overdue", "/projects", { section: "procurement", sectionStatus: "overdue" }],
      ["processing", "/projects", { section: "documents" }],
      ["volume", "/projects", { view: "cards" }],
    ]);
  });

  test("активные — только статус active; прирост — объекты, начатые за 7 дней", () => {
    // Начало недели — 11.09 12:00; у дат без времени граница — сам день 11.09
    const list = dashboardMetrics(
      source({
        projects: [
          registry({ id: "a", status: "active", startDate: "2026-09-11" }),
          registry({ id: "b", status: "at_risk", startDate: "2026-09-18" }),
          registry({ id: "c", status: "active", startDate: "2026-09-10" }),
          registry({ id: "d", status: "paused", startDate: "2026-09-19" }),
        ],
      }),
    );
    const active = metric(list, "active");
    expect(active.value).toBe("2");
    expect(active.delta).toEqual({ text: "+2 за 7 дней", direction: "up", effect: "neutral" });
  });

  test("в смену дата начала считается только за сегодня, даже если смена началась вчера", () => {
    // 06:00 − 12 ч = вчера 18:00, но объект, начатый вчера, в смену не попадает
    const list = dashboardMetrics(
      source({
        now: "2026-09-18T06:00:00",
        period: "shift",
        projects: [
          registry({ id: "a", startDate: "2026-09-17" }),
          registry({ id: "b", startDate: "2026-09-18" }),
        ],
      }),
    );
    expect(metric(list, "active").delta.text).toBe("+1 за смену");
  });

  test("за 30 дней: дата начала в первый день периода считается, накануне — нет", () => {
    const list = dashboardMetrics(
      source({
        period: "month",
        projects: [
          registry({ id: "a", startDate: "2026-08-19" }),
          registry({ id: "b", startDate: "2026-08-18" }),
        ],
      }),
    );
    expect(metric(list, "active").delta.text).toBe("+1 за 30 дней");
  });

  test("непроверенные: значение из сводок, прирост — из ревизий, загруженных за период", () => {
    const list = dashboardMetrics(
      source({
        projects: [
          registry({ id: "a" }, { specUnverified: 5 }),
          registry({ id: "b" }, { specUnverified: 7 }),
        ],
        documents: [
          // ровно на начале периода — считается: 10 − 4 = 6
          documentRow(
            { id: "d1", uploadedAt: "2026-09-11T12:00:00" },
            { extracted: 10, verified: 4 },
          ),
          // на секунду раньше — нет
          documentRow({ id: "d2", uploadedAt: "2026-09-11T11:59:59" }, { extracted: 20 }),
          // ровно «сейчас» — считается: 3 − 1 = 2
          documentRow(
            { id: "d3", uploadedAt: "2026-09-18T12:00:00" },
            { extracted: 3, verified: 1 },
          ),
          // позже «сейчас» — нет
          documentRow({ id: "d4", uploadedAt: "2026-09-18T12:00:01" }, { extracted: 50 }),
          // проверено больше, чем извлечено — вклад 0, а не минус
          documentRow(
            { id: "d5", uploadedAt: "2026-09-15T10:00:00" },
            { extracted: 2, verified: 5 },
          ),
        ],
      }),
    );
    const unverified = metric(list, "unverified");
    expect(unverified.value).toBe("12"); // 5 + 7
    expect(unverified.delta).toEqual({ text: "+8 за 7 дней", direction: "up", effect: "worse" });
  });

  test("заявки без ответа: отправлены и ждут ответа, ни одного ответа, нет решения; прирост — отправленные за период", () => {
    const list = dashboardMetrics(
      source({
        requests: [
          requestRow({ id: "r1", sentAt: "2026-09-11T12:00:00" }),
          // за миллисекунду до начала периода — в значении есть, в приросте нет
          requestRow({ id: "r2", sentAt: "2026-09-11T11:59:59.999" }),
          requestRow({ id: "r3", sentAt: null, replyDueAt: null, status: "draft" }),
          requestRow({ id: "r4", sentAt: "2026-09-15T10:00:00" }, { answered: 1 }),
          requestRow({ id: "r5", sentAt: "2026-09-15T10:00:00" }, { decisionId: "dec-1" }),
          // Заказан без сравнения предложений: ответов нет, но запрос уже не ждёт ответа
          requestRow(
            { id: "r6", sentAt: "2026-09-15T10:00:00", status: "ordered" },
            { status: "ordered" },
          ),
        ],
      }),
    );
    const silent = metric(list, "silent");
    expect(silent.value).toBe("2");
    expect(silent.delta).toEqual({ text: "+1 за 7 дней", direction: "up", effect: "worse" });
  });

  test("просроченные: значение из сводок, прирост — запросы, у которых срок ответа прошёл за период", () => {
    const list = dashboardMetrics(
      source({
        projects: [
          registry({ id: "a" }, { overdueRequests: 2 }),
          registry({ id: "b" }, { overdueRequests: 1 }),
        ],
        requests: [
          requestRow(
            { id: "o1", replyDueAt: "2026-09-11T12:00:00" },
            { status: "overdue", answered: 1 },
          ),
          requestRow(
            { id: "o2", replyDueAt: "2026-09-11T11:59:59" },
            { status: "overdue", answered: 1 },
          ),
          requestRow(
            { id: "o3", replyDueAt: "2026-09-14T00:00:00" },
            { status: "collecting", answered: 1 },
          ),
          requestRow({ id: "o4", replyDueAt: null }, { status: "overdue", answered: 1 }),
        ],
      }),
    );
    const overdue = metric(list, "overdue");
    expect(overdue.value).toBe("3"); // 2 + 1
    expect(overdue.delta).toEqual({ text: "+1 за 7 дней", direction: "up", effect: "worse" });
  });

  test("в обработке: активная задача (очередь, распознавание, извлечение); прирост нейтральный", () => {
    const list = dashboardMetrics(
      source({
        documents: [
          documentRow({ id: "d1", uploadedAt: "2026-09-15T10:00:00" }, { job: job("queued") }),
          documentRow({ id: "d2", uploadedAt: "2026-09-01T10:00:00" }, { job: job("recognizing") }),
          documentRow({ id: "d3", uploadedAt: "2026-09-11T12:00:00" }, { job: job("extracted") }),
          documentRow({ id: "d4", uploadedAt: "2026-09-15T10:00:00" }, { job: job("review") }),
          documentRow({ id: "d5", uploadedAt: "2026-09-15T10:00:00" }, { job: job("failed") }),
          documentRow({ id: "d6", uploadedAt: "2026-09-15T10:00:00" }, { job: null }),
        ],
      }),
    );
    const processing = metric(list, "processing");
    expect(processing.value).toBe("3");
    expect(processing.delta).toEqual({ text: "+2 за 7 дней", direction: "up", effect: "neutral" });
  });

  test("незакрытый объём: рубли остатка и прирост по договору, подписанному за период", () => {
    // 1 200 000 000 коп. = 12 млн ₽; остаток 75 из 100 → 9 млн ₽
    const list = dashboardMetrics(
      source({
        cards: [
          card({ id: "a" }, [zone({ planQty: 100, factQty: 25 })], {
            amount: 1_200_000_000,
            signedAt: "2026-09-11",
          }),
        ],
      }),
    );
    const volume = metric(list, "volume");
    expect(volume.value).toBe("9 млн ₽");
    expect(volume.delta).toEqual({
      text: "+9 млн ₽ за 7 дней",
      direction: "up",
      effect: "worse",
    });
  });

  test("незакрытый объём: договор подписан до периода — «без прироста»", () => {
    const list = dashboardMetrics(
      source({
        cards: [
          card({ id: "a" }, [zone({ planQty: 100, factQty: 25 })], {
            amount: 1_200_000_000,
            signedAt: "2026-09-10",
          }),
        ],
      }),
    );
    expect(metric(list, "volume").value).toBe("9 млн ₽");
    expect(metric(list, "volume").delta).toEqual(NO_GROWTH);
  });

  test("незакрытый объём: приостановленный объект не входит ни в значение, ни в прирост", () => {
    const list = dashboardMetrics(
      source({
        cards: [
          card({ id: "a", status: "paused" }, [zone({ planQty: 100 })], {
            amount: 1_200_000_000,
            signedAt: "2026-09-15",
          }),
        ],
      }),
    );
    expect(metric(list, "volume").value).toBe("0 млн ₽");
    expect(metric(list, "volume").delta).toEqual(NO_GROWTH);
  });

  test("незакрытый объём: в смену считается договор, подписанный сегодня, но не вчера", () => {
    const cards = (signedAt: string) => [
      card({ id: "a" }, [zone({ planQty: 100 })], { amount: 1_000_000_000, signedAt }),
    ];
    const at = { now: "2026-09-18T06:00:00", period: "shift" } as const;
    expect(
      metric(dashboardMetrics(source({ ...at, cards: cards("2026-09-17") })), "volume").delta,
    ).toEqual(NO_GROWTH);
    // 1 000 000 000 коп. = 10 млн ₽, остаток весь
    expect(
      metric(dashboardMetrics(source({ ...at, cards: cards("2026-09-18") })), "volume").delta.text,
    ).toBe("+10 млн ₽ за смену");
  });

  test("незакрытый объём: значение коротко без дроби от 10 млн, прирост — с одной цифрой дроби", () => {
    // 1 234 567 800 коп. = 12 345 678 ₽, остаток весь: 12,3… млн
    const list = dashboardMetrics(
      source({
        cards: [
          card({ id: "a" }, [zone({ planQty: 100 })], {
            amount: 1_234_567_800,
            signedAt: "2026-09-15",
          }),
        ],
      }),
    );
    expect(metric(list, "volume").value).toBe("12 млн ₽");
    expect(metric(list, "volume").delta.text).toBe("+12,3 млн ₽ за 7 дней");
  });
});

/* ---------- Рубли ---------- */

describe("mlnRub", () => {
  test("одна цифра дроби с запятой", () => {
    expect(mlnRub(167_400_000)).toBe("167,4 млн ₽");
  });

  test("вторая цифра дроби отбрасывается округлением", () => {
    expect(mlnRub(167_440_000)).toBe("167,4 млн ₽"); // 167,44 → 167,4
    expect(mlnRub(1_250_000)).toBe("1,3 млн ₽"); // 1,25 → 1,3 (половина — вверх)
  });

  test("целые миллионы — без «,0»", () => {
    expect(mlnRub(12_000_000)).toBe("12 млн ₽");
  });

  test("ноль и доли миллиона", () => {
    expect(mlnRub(0)).toBe("0 млн ₽");
    expect(mlnRub(500_000)).toBe("0,5 млн ₽");
    expect(mlnRub(30_000)).toBe("0 млн ₽"); // 0,03 → 0
  });

  test("тысячи миллионов — с неразрывным пробелом между разрядами", () => {
    expect(mlnRub(12_345_600_000)).toBe("12 345,6 млн ₽");
  });
});

describe("mlnRubShort", () => {
  test("до 10 млн — одна цифра дроби", () => {
    expect(mlnRubShort(9_940_000)).toBe("9,9 млн ₽");
    expect(mlnRubShort(500_000)).toBe("0,5 млн ₽");
  });

  test("ровно 10 млн и выше — без дроби", () => {
    expect(mlnRubShort(10_000_000)).toBe("10 млн ₽");
    expect(mlnRubShort(10_400_000)).toBe("10 млн ₽");
    expect(mlnRubShort(10_500_000)).toBe("11 млн ₽"); // 10,5 → 11 (половина — вверх)
    expect(mlnRubShort(167_400_000)).toBe("167 млн ₽");
  });

  test("чуть меньше 10 млн округляется до 10 без дроби", () => {
    expect(mlnRubShort(9_960_000)).toBe("10 млн ₽"); // 9,96 → 10,0 → «10»
  });

  test("ноль", () => {
    expect(mlnRubShort(0)).toBe("0 млн ₽");
  });
});

/* ---------- Незакрытый объём ---------- */

describe("unclosedVolume", () => {
  test("пустой список карточек — нули, без лидера", () => {
    expect(unclosedVolume(source())).toEqual({
      rub: 0,
      qty: 0,
      unit: "ед.",
      projects: 0,
      stages: [],
      top: null,
    });
  });

  test("остаток и рубли по договорной цене единицы, факт ограничен планом", () => {
    // А: план 60 + 40 = 100, факт 30 + min(50, 40) = 70, остаток 30; 10 млн ₽ × 30 / 100 = 3 млн
    // Б: план 200, факт 50, остаток 150; 6 млн ₽ × 150 / 200 = 4,5 млн
    const result = unclosedVolume(
      source({
        cards: [
          card(
            { id: "a", name: "Объект А", stage: "Монтаж" },
            [
              zone({ id: "z1", planQty: 60, factQty: 30 }),
              zone({ id: "z2", planQty: 40, factQty: 50 }),
            ],
            { amount: 1_000_000_000 },
          ),
          card(
            { id: "b", name: "Объект Б", status: "at_risk", stage: "Подконструкция" },
            [zone({ id: "z3", planQty: 200, factQty: 50 })],
            { amount: 600_000_000 },
          ),
        ],
      }),
    );
    expect(result.rub).toBeCloseTo(7_500_000, 6);
    expect(result.qty).toBe(180);
    expect(result.unit).toBe("м²");
    expect(result.projects).toBe(2);
    expect(result.stages).toEqual(["Монтаж", "Подконструкция"]);
    expect(result.top?.name).toBe("Объект Б");
    expect(result.top?.rub).toBeCloseTo(4_500_000, 6);
  });

  test("приостановленные и завершённые объекты не входят", () => {
    const result = unclosedVolume(
      source({
        cards: [
          card({ id: "a", status: "paused" }, [zone({ planQty: 100 })], { amount: 100_000_000 }),
          card({ id: "b", status: "done" }, [zone({ planQty: 100 })], { amount: 100_000_000 }),
        ],
      }),
    );
    expect(result).toEqual({ rub: 0, qty: 0, unit: "ед.", projects: 0, stages: [], top: null });
  });

  test("нулевой план — объект пропускается без деления на ноль", () => {
    const result = unclosedVolume(
      source({
        cards: [
          card({ id: "a", stage: "Проект" }, [zone({ planQty: 0 })], { amount: 100_000_000 }),
        ],
      }),
    );
    expect(result.rub).toBe(0);
    expect(Number.isFinite(result.rub)).toBe(true);
    expect(result.projects).toBe(0);
    expect(result.stages).toEqual([]);
    expect(result.top).toBeNull();
  });

  test("без договора рубли не выдумываются, объём считается", () => {
    const result = unclosedVolume(
      source({ cards: [card({ id: "a" }, [zone({ planQty: 100, factQty: 40 })], null)] }),
    );
    expect(result.rub).toBe(0);
    expect(result.qty).toBe(60);
    expect(result.projects).toBe(1);
  });

  test("разные единицы захваток — «ед.»; стадии без повторов", () => {
    const result = unclosedVolume(
      source({
        cards: [
          card({ id: "a", stage: "Монтаж" }, [zone({ planQty: 10, unit: "м²" })]),
          card({ id: "b", stage: "Монтаж" }, [zone({ planQty: 10, unit: "м.п." })]),
        ],
      }),
    );
    expect(result.unit).toBe("ед.");
    expect(result.stages).toEqual(["Монтаж"]);
  });

  test("стадии — только объектов, вошедших в оценку: полностью выполненный не добавляет свою", () => {
    // «Сколько объектов вошло в оценку» = объекты с остатком; «стадии этих объектов»
    const result = unclosedVolume(
      source({
        cards: [
          card({ id: "a", stage: "Монтаж" }, [zone({ planQty: 100, factQty: 40 })]),
          card({ id: "b", stage: "Сдача заказчику" }, [zone({ planQty: 100, factQty: 100 })]),
        ],
      }),
    );
    expect(result.projects).toBe(1);
    expect(result.stages).toEqual(["Монтаж"]);
  });
});

/* ---------- Требует решения ---------- */

describe("attentionRows", () => {
  const projects = [registry({ id: "p-1", name: "Меридиан" })];

  test("просроченный запрос: красная строка, сколько поставщиков не ответили, ссылка на запрос", () => {
    const rows = attentionRows(
      source({
        projects,
        requests: [
          requestRow(
            { id: "r1", number: "З-2026/318", sentTo: ["s1", "s2", "s3"], sourceId: "src-1" },
            { status: "overdue", answered: 1, replyDue: { hours: -48, overdue: true } },
          ),
        ],
      }),
    );
    expect(rows).toEqual([
      {
        id: "overdue-r1",
        severity: "danger",
        title: "Ответы просрочены: запрос З-2026/318",
        reason: "Не ответили 2 из 3 поставщиков — сравнение неполное",
        projectId: "p-1",
        projectName: "Меридиан",
        due: "просрочено на 2 дн.",
        sourceId: "src-1",
        to: "/projects/p-1/procurement/r1",
      },
    ]);
  });

  test("все ответили, но срок вышел — причина про незафиксированное решение", () => {
    const [row] = attentionRows(
      source({
        requests: [
          requestRow({ id: "r1", sentTo: ["s1", "s2"] }, { status: "overdue", answered: 2 }),
        ],
      }),
    );
    expect(row?.reason).toBe("Срок ответа вышел, решение не зафиксировано");
  });

  test("неизвестный объект подписывается «Объект»; непросроченные запросы не попадают", () => {
    const rows = attentionRows(
      source({
        requests: [
          requestRow({ id: "r1", projectId: "p-x" }, { status: "overdue" }),
          requestRow({ id: "r2" }, { status: "collecting" }),
          requestRow({ id: "r3" }, { status: "ready" }),
        ],
      }),
    );
    expect(rows.map((row) => [row.id, row.projectName])).toEqual([["overdue-r1", "Объект"]]);
  });

  test("срок словами: часы до суток, дни от суток, минимум 1 ч, нет срока — null", () => {
    const due = (replyDue: RequestRow["replyDue"]) =>
      attentionRows(
        source({ requests: [requestRow({ id: "r1" }, { status: "overdue", replyDue })] }),
      )[0]?.due;
    expect(due({ hours: -5, overdue: true })).toBe("просрочено на 5 ч");
    expect(due({ hours: 0, overdue: true })).toBe("просрочено на 1 ч");
    expect(due({ hours: 23, overdue: false })).toBe("осталось 23 ч");
    expect(due({ hours: 24, overdue: false })).toBe("осталось 1 дн.");
    expect(due({ hours: 36, overdue: false })).toBe("осталось 2 дн."); // 1,5 → 2
    expect(due({ hours: -3, overdue: false })).toBe("просрочено на 3 ч");
    expect(due(null)).toBeNull();
  });

  test("ждёт решения: запрос, замечание, поставка — жёлтые, замена — информационная", () => {
    const rows = attentionRows(
      source({
        projects,
        pending: [
          pending("p-1", "x1", "replacement"),
          pending("p-1", "x2", "request"),
          pending("p-1", "x3", "remark"),
          pending("p-1", "x4", "delivery"),
        ],
      }),
    );
    expect(rows.map((row) => [row.id, row.severity])).toEqual([
      ["pending-x2", "warn"],
      ["pending-x3", "warn"],
      ["pending-x4", "warn"],
      ["pending-x1", "info"],
    ]);
    const replacement = rows.find((row) => row.id === "pending-x1");
    expect(replacement).toEqual({
      id: "pending-x1",
      severity: "info",
      title: "Пункт x1",
      reason: "Детали x1",
      projectId: "p-1",
      projectName: "Меридиан",
      due: null,
      sourceId: null,
      to: "/projects/p-1/history",
    });
  });

  test("пункт по запросу берёт срок и оригинал из самого запроса", () => {
    const rows = attentionRows(
      source({
        requests: [
          requestRow(
            { id: "r7", sourceId: "src-7" },
            { status: "ready", replyDue: { hours: 5, overdue: false } },
          ),
        ],
        pending: [pending("p-1", "r7", "request")],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.due).toBe("осталось 5 ч");
    expect(rows[0]?.sourceId).toBe("src-7");
  });

  test("порядок: просроченные, затем жёлтые, затем информационные; лимит обрезает хвост", () => {
    const input = source({
      requests: [requestRow({ id: "r1" }, { status: "overdue" })],
      pending: [pending("p-1", "i1", "replacement"), pending("p-1", "w1", "remark")],
    });
    expect(attentionRows(input).map((row) => row.id)).toEqual([
      "overdue-r1",
      "pending-w1",
      "pending-i1",
    ]);
    expect(attentionRows(input, 2).map((row) => row.id)).toEqual(["overdue-r1", "pending-w1"]);
  });

  test("по умолчанию не больше восьми строк", () => {
    const many = Array.from({ length: 10 }, (_, i) => pending("p-1", `w${i}`, "request"));
    expect(attentionRows(source({ pending: many }))).toHaveLength(8);
  });

  test("пустые данные — пустая очередь", () => {
    expect(attentionRows(source())).toEqual([]);
  });
});

/* ---------- Объекты ---------- */

describe("projectProgress", () => {
  // Договор 01.01–11.01 (10 суток), сегодня 06.01 00:00 — прошла ровно половина срока
  const dates = { startDate: "2026-01-01", endDate: "2026-01-11" };
  const at = { now: "2026-01-06T00:00:00" };

  test("готовность, отклонение, остаток; сортировка от самого отстающего, null — как 0", () => {
    const list = projectProgress(
      source({
        ...at,
        cards: [
          // факт 80 из 100 (50 ограничено 40): 80% − 50% = +30
          card({ id: "b", name: "Б", status: "at_risk", ...dates }, [
            zone({ planQty: 60, factQty: 40 }),
            zone({ planQty: 40, factQty: 50 }),
          ]),
          // 30% − 50% = −20
          card({ id: "a", name: "А", status: "active", ...dates }, [
            zone({ planQty: 100, factQty: 30 }),
          ]),
          card({ id: "c", name: "В", status: "paused", ...dates }, [zone({ planQty: 100 })]),
          // захваток нет: отклонение неизвестно
          card({ id: "d", name: "Г", status: "active", ...dates }, []),
        ],
      }),
    );
    expect(list).toEqual([
      {
        projectId: "a",
        name: "А",
        status: "active",
        statusLabel: "В работе",
        donePct: 30,
        deviationPp: -20,
        qtyLeft: 70,
        unit: "м²",
      },
      {
        projectId: "d",
        name: "Г",
        status: "active",
        statusLabel: "В работе",
        donePct: 0,
        deviationPp: null,
        qtyLeft: 0,
        unit: "ед.",
      },
      {
        projectId: "b",
        name: "Б",
        status: "at_risk",
        statusLabel: "Под риском",
        donePct: 80,
        deviationPp: 30,
        qtyLeft: 20,
        unit: "м²",
      },
    ]);
  });

  test("до начала договора доля срока 0, после окончания — 100%", () => {
    const one = (now: string) =>
      projectProgress(
        source({
          now,
          cards: [card({ id: "a", ...dates }, [zone({ planQty: 100, factQty: 30 })])],
        }),
      )[0]?.deviationPp;
    expect(one("2025-12-31T00:00:00")).toBe(30); // 30% − 0%
    expect(one("2026-02-01T00:00:00")).toBe(-70); // 30% − 100%
  });

  test("срок договора нулевой — отклонение неизвестно", () => {
    const [row] = projectProgress(
      source({
        ...at,
        cards: [
          card({ id: "a", startDate: "2026-01-06", endDate: "2026-01-06" }, [
            zone({ planQty: 100, factQty: 30 }),
          ]),
        ],
      }),
    );
    expect(row?.donePct).toBe(30);
    expect(row?.deviationPp).toBeNull();
  });

  test("округление: отклонение считается от точных долей", () => {
    // 01.01–04.01, сегодня 02.01: 1/3 срока; факт 2 из 3: 67%; (2/3 − 1/3) × 100 = 33,3 → 33
    const [row] = projectProgress(
      source({
        now: "2026-01-02T00:00:00",
        cards: [
          card({ id: "a", startDate: "2026-01-01", endDate: "2026-01-04" }, [
            zone({ planQty: 3, factQty: 2 }),
          ]),
        ],
      }),
    );
    expect(row?.donePct).toBe(67);
    expect(row?.deviationPp).toBe(33);
  });

  test("пустой список объектов — пустой результат", () => {
    expect(projectProgress(source())).toEqual([]);
  });

  test("отклонение не зависит от часового пояса машины (UTC+8)", () => {
    // Сегодня 06.01 00:00 местного времени — ровно середина срока 01.01–11.01: 30% − 50% = −20
    inTimeZone("Asia/Makassar", () => {
      const [row] = projectProgress(
        source({
          ...at,
          cards: [card({ id: "a", ...dates }, [zone({ planQty: 100, factQty: 30 })])],
        }),
      );
      expect(row?.deviationPp).toBe(-20);
    });
  });
});

/* ---------- Живой поток ---------- */

describe("liveFeed", () => {
  test("новые сверху, с названием объекта; неизвестный объект — «Объект»", () => {
    const feed = liveFeed(
      source({
        projects: [registry({ id: "p-1", name: "Меридиан" })],
        events: [
          event({ id: "e1", at: "2026-09-18T10:00:00" }),
          event({ id: "e2", at: "2026-09-18T11:00:00", projectId: "p-x" }),
          event({ id: "e3", at: "2026-09-17T09:00:00" }),
        ],
      }),
    );
    expect(feed.map((row) => [row.event.id, row.projectName])).toEqual([
      ["e2", "Объект"],
      ["e1", "Меридиан"],
      ["e3", "Меридиан"],
    ]);
  });

  test("по умолчанию восемь последних, лимит задаётся; исходный массив не меняется", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      event({ id: `e${i}`, at: `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00` }),
    );
    const input = source({ events });
    expect(liveFeed(input).map((row) => row.event.id)).toEqual([
      "e9",
      "e8",
      "e7",
      "e6",
      "e5",
      "e4",
      "e3",
      "e2",
    ]);
    expect(liveFeed(input, 2).map((row) => row.event.id)).toEqual(["e9", "e8"]);
    expect(input.events.map((item) => item.id)).toEqual(events.map((item) => item.id));
  });

  test("нет событий — пустая лента", () => {
    expect(liveFeed(source())).toEqual([]);
  });
});

/* ---------- Инсайт ---------- */

describe("dashboardInsight", () => {
  const projects = [
    registry({ id: "a", name: "Меридиан" }),
    registry({ id: "b", name: "Галактика" }),
  ];
  const overdue = (id: string, projectId: string) =>
    requestRow({ id, projectId }, { status: "overdue" });
  const TAIL = "Разбор этого объекта снимет основную часть очереди.";

  test("меньше трёх пунктов — вывода нет", () => {
    expect(
      dashboardInsight(
        source({
          projects,
          pending: [pending("a", "x1", "request"), pending("a", "x2", "request")],
        }),
      ),
    ).toBeNull();
  });

  test("все три пункта на одном объекте: просроченные и решения", () => {
    const insight = dashboardInsight(
      source({
        projects,
        requests: [overdue("r1", "a"), overdue("r2", "a")],
        pending: [pending("a", "x1", "replacement")],
      }),
    );
    expect(insight).toEqual({
      projectId: "a",
      title: "Больше половины открытых вопросов — на объекте «Меридиан»",
      text: `2 просроченных ответа, 1 решение ждёт из 3 по всем объектам. ${TAIL}`,
    });
  });

  test("ровно половина — вывода нет", () => {
    expect(
      dashboardInsight(
        source({
          projects,
          pending: [
            pending("a", "x1", "request"),
            pending("a", "x2", "request"),
            pending("b", "x3", "request"),
            pending("b", "x4", "request"),
          ],
        }),
      ),
    ).toBeNull();
  });

  test("три из пяти — больше половины", () => {
    const insight = dashboardInsight(
      source({
        projects,
        requests: [overdue("r1", "a")],
        pending: [
          pending("a", "x1", "request"),
          pending("a", "x2", "remark"),
          pending("b", "x3", "request"),
          pending("b", "x4", "request"),
        ],
      }),
    );
    expect(insight?.projectId).toBe("a");
    expect(insight?.text).toBe(
      `1 просроченный ответ, 2 решения ждёт из 5 по всем объектам. ${TAIL}`,
    );
  });

  test("только решения или только просроченные — вторая часть не выводится", () => {
    const decisions = dashboardInsight(
      source({
        projects,
        pending: Array.from({ length: 5 }, (_, i) => pending("a", `x${i}`, "request")),
      }),
    );
    expect(decisions?.text).toBe(`5 решений ждёт из 5 по всем объектам. ${TAIL}`);

    const late = dashboardInsight(
      source({ projects, requests: [overdue("r1", "a"), overdue("r2", "a"), overdue("r3", "a")] }),
    );
    expect(late?.text).toBe(`3 просроченных ответа из 3 по всем объектам. ${TAIL}`);
  });

  test("формы слова: 11, 21, 22", () => {
    const text = (n: number) =>
      dashboardInsight(
        source({
          projects,
          pending: Array.from({ length: n }, (_, i) => pending("a", `x${i}`, "request")),
        }),
      )?.text;
    expect(text(11)).toBe(`11 решений ждёт из 11 по всем объектам. ${TAIL}`);
    expect(text(21)).toBe(`21 решение ждёт из 21 по всем объектам. ${TAIL}`);
    expect(text(22)).toBe(`22 решения ждёт из 22 по всем объектам. ${TAIL}`);
  });

  test("считает все пункты очереди, а не первые восемь", () => {
    // Первые восемь: 4 у «Галактики» + 4 у «Меридиана» — половина; всего 6 из 10 у «Меридиана»
    const insight = dashboardInsight(
      source({
        projects,
        pending: [
          ...Array.from({ length: 4 }, (_, i) => pending("b", `b${i}`, "request")),
          ...Array.from({ length: 6 }, (_, i) => pending("a", `a${i}`, "request")),
        ],
      }),
    );
    expect(insight?.projectId).toBe("a");
    expect(insight?.text).toBe(`6 решений ждёт из 10 по всем объектам. ${TAIL}`);
  });

  test("пустые данные — вывода нет", () => {
    expect(dashboardInsight(source())).toBeNull();
  });
});
