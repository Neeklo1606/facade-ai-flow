import {
  projectStatusLabel,
  type Contract,
  type ExtractionJob,
  type Project,
  type ProjectDocument,
  type ProjectOverview,
  type RfqStatus,
  type SupplyRequest,
  type TimelineEvent,
  type WorkZone,
} from "@/contracts";
import { fmtNum } from "@/shared/number-format";
import { isActiveJob } from "./extraction";

/**
 * Дашборд: сводка по всем объектам (ADR-007). Здесь только формулы — экран получает готовые числа.
 * Каждая величина определена в docs/domain/glossary.md, §3; дельты считаются по отметкам времени
 * в данных, а не по снимкам состояния, поэтому «за период» всегда означает «попало в период».
 */

/* ---------- Период ---------- */

export type DashboardPeriod = "shift" | "week" | "month";

export const dashboardPeriodLabel: Record<DashboardPeriod, string> = {
  shift: "Смена",
  week: "7 дней",
  month: "30 дней",
};

/** Подпись периода в родительном падеже: «за смену», «за 7 дней» */
export const dashboardPeriodSuffix: Record<DashboardPeriod, string> = {
  shift: "за смену",
  week: "за 7 дней",
  month: "за 30 дней",
};

const periodHours: Record<DashboardPeriod, number> = { shift: 12, week: 24 * 7, month: 24 * 30 };

/** Начало периода от времени источника данных. Строки сравниваются как ISO-отметки */
export function periodStart(now: string, period: DashboardPeriod) {
  const from = new Date(new Date(now).getTime() - periodHours[period] * 3_600_000);
  return from.toISOString().slice(0, 19);
}

/** Попала ли отметка времени в период [начало; сейчас] */
function inPeriod(at: string | null | undefined, from: string, now: string) {
  return !!at && at >= from && at <= now;
}

/**
 * То же для полей без времени (дата начала объекта, дата подписания договора).
 * В периоде «смена» такие поля считаются только за сегодня: отбрасывать время у границы
 * значило бы растянуть двенадцать часов до полутора суток (находка ревью MEDIUM).
 */
function inPeriodByDate(
  date: string | null | undefined,
  from: string,
  now: string,
  period: DashboardPeriod,
) {
  if (!date) return false;
  const today = now.slice(0, 10);
  if (period === "shift") return date === today;
  return date >= from.slice(0, 10) && date <= today;
}

/* ---------- Вход ---------- */

/** Строки реестра: объект и его сводка */
interface RegistryRow {
  project: Project;
  overview: ProjectOverview;
}

/** Действующая ревизия в списке документов */
interface DocumentRow {
  document: ProjectDocument;
  extracted: number;
  verified: number;
  job: ExtractionJob | null;
}

/** Карточка объекта: нужны договор и захватки */
interface CardRow {
  project: Project;
  contract: Contract | null;
  zones: WorkZone[];
}

/** Запрос поставщикам в списке */
interface RequestRow {
  request: SupplyRequest;
  answered: number;
  status: RfqStatus;
  replyDue: { hours: number; overdue: boolean } | null;
  decisionId: string | null;
}

/** Пункт «ждёт решения» с объектом, к которому относится */
interface PendingRow {
  projectId: string;
  id: string;
  kind: "request" | "replacement";
  title: string;
  details: string;
  link: string;
}

export interface DashboardSource {
  /** Время источника данных: в демо — часы демо, в рабочем режиме — время сервера */
  now: string;
  period: DashboardPeriod;
  projects: RegistryRow[];
  documents: DocumentRow[];
  cards: CardRow[];
  requests: RequestRow[];
  pending: PendingRow[];
  events: TimelineEvent[];
}

/* ---------- Метрики ---------- */

/** Направление изменения и его смысл: цвет капсулы задаёт смысл, стрелка — направление */
export interface DashboardDelta {
  text: string;
  direction: "up" | "down" | "flat";
  effect: "better" | "worse" | "neutral";
}

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  delta: DashboardDelta;
  /** Куда ведёт ячейка: реестр с применённым фильтром */
  to: string;
  search: Record<string, string | boolean>;
}

/**
 * Капсула показывает прирост самой величины за период и ничего больше.
 *
 * «Без прироста» вместо «без изменений» — потому что снижения система считать не умеет:
 * событий, уменьшающих метрику, в модели нет. Утверждать «без изменений» при упавшем
 * на глазах числе было бы неправдой (находка ревью MEDIUM).
 */
function worseOnGrowth(count: number, text: string): DashboardDelta {
  return count > 0
    ? { text, direction: "up", effect: "worse" }
    : { text: "без прироста", direction: "flat", effect: "neutral" };
}

function neutralOnGrowth(count: number, text: string): DashboardDelta {
  return count > 0
    ? { text, direction: "up", effect: "neutral" }
    : { text: "без прироста", direction: "flat", effect: "neutral" };
}

/** Объекты, на которых идут работы: «В работе» и «Под риском» */
export function runningProjects<T extends { project: Project }>(rows: T[]) {
  return rows.filter((row) => row.project.status === "active" || row.project.status === "at_risk");
}

/** Отправленные запросы, на которые не ответил ни один поставщик */
function silentRequests(requests: RequestRow[]) {
  return requests.filter((row) => row.request.sentAt && row.answered === 0 && !row.decisionId);
}

/** Ревизии, по которым идёт распознавание */
function processingDocuments(documents: DocumentRow[]) {
  return documents.filter((row) => !!row.job && isActiveJob(row.job));
}

export function dashboardMetrics(source: DashboardSource): DashboardMetric[] {
  const { now, period, projects, documents, requests } = source;
  const from = periodStart(now, period);
  const suffix = dashboardPeriodSuffix[period];

  const active = projects.filter((row) => row.project.status === "active");
  const started = projects.filter((row) =>
    inPeriodByDate(row.project.startDate, from, now, period),
  );

  const unverified = projects.reduce((sum, row) => sum + row.overview.specUnverified, 0);
  const freshRevisions = documents.filter((row) => inPeriod(row.document.uploadedAt, from, now));
  const freshUnverified = freshRevisions.reduce(
    (sum, row) => sum + Math.max(0, row.extracted - row.verified),
    0,
  );

  const silent = silentRequests(requests);
  // Прирост именно «заявок без ответа»: отправленные за период и до сих пор без ответа
  const silentFresh = silent.filter((row) => inPeriod(row.request.sentAt, from, now));

  const overdue = projects.reduce((sum, row) => sum + row.overview.overdueRequests, 0);
  const wentOverdue = requests.filter(
    (row) => row.status === "overdue" && inPeriod(row.request.replyDueAt, from, now),
  );

  const processing = processingDocuments(documents);
  // Прирост «документов в обработке»: загруженные за период и всё ещё в обработке
  const processingFresh = processing.filter((row) => inPeriod(row.document.uploadedAt, from, now));

  const volume = unclosedVolume(source);
  const signed = unclosedVolumeSigned(source, from, period);

  return [
    {
      key: "active",
      label: "Активных объектов",
      value: fmtNum(active.length),
      delta: neutralOnGrowth(started.length, `+${started.length} ${suffix}`),
      to: "/projects",
      search: { status: "active" },
    },
    {
      key: "unverified",
      label: "Позиций ждёт проверки",
      value: fmtNum(unverified),
      delta: worseOnGrowth(freshUnverified, `+${fmtNum(freshUnverified)} ${suffix}`),
      to: "/projects",
      search: { unverified: true },
    },
    {
      key: "silent",
      label: "Заявок без ответа",
      value: fmtNum(silent.length),
      delta: worseOnGrowth(silentFresh.length, `+${silentFresh.length} ${suffix}`),
      to: "/projects",
      search: { section: "procurement", sectionStatus: "open" },
    },
    {
      key: "overdue",
      label: "Просроченных ответов",
      value: fmtNum(overdue),
      delta: worseOnGrowth(wentOverdue.length, `+${wentOverdue.length} ${suffix}`),
      to: "/projects",
      search: { section: "procurement", sectionStatus: "overdue" },
    },
    {
      key: "processing",
      label: "Документов в обработке",
      value: fmtNum(processing.length),
      delta: neutralOnGrowth(processingFresh.length, `+${processingFresh.length} ${suffix}`),
      to: "/projects",
      search: { section: "documents" },
    },
    {
      key: "volume",
      label: "Незакрытый объём",
      value: mlnRubShort(volume.rub),
      delta: worseOnGrowth(signed, `+${mlnRub(signed)} ${suffix}`),
      to: "/projects",
      search: { view: "cards" },
    },
  ];
}

/* ---------- Незакрытый объём ---------- */

/** Рубли крупно: «167,4 млн ₽». Дробная часть — одна цифра, иначе число не читается */
export function mlnRub(rub: number) {
  return `${(rub / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
}

/** Рубли в узкой ячейке полосы метрик: от десяти миллионов дробная часть только мешает */
export function mlnRubShort(rub: number) {
  const mln = rub / 1_000_000;
  return `${mln.toLocaleString("ru-RU", { maximumFractionDigits: mln >= 10 ? 0 : 1 })} млн ₽`;
}

/** Осталось выполнить по захваткам объекта, в единицах захваток */
function zoneRemainder(zones: WorkZone[]) {
  const plan = zones.reduce((sum, zone) => sum + zone.planQty, 0);
  const fact = zones.reduce((sum, zone) => sum + Math.min(zone.factQty, zone.planQty), 0);
  return { plan, fact, left: Math.max(0, plan - fact) };
}

export interface UnclosedVolume {
  /** Оценка в рублях: доля незакрытого объёма от суммы договора */
  rub: number;
  /** Незакрытый объём в единицах захваток (у всех объектов это м²) */
  qty: number;
  unit: string;
  /** Сколько объектов вошло в оценку */
  projects: number;
  /** Стадии работ этих объектов словами, без повторов */
  stages: string[];
  /** Объект с самым большим остатком */
  top: { name: string; rub: number } | null;
}

/**
 * Незакрытый объём: сколько работ по договорам ещё не выполнено.
 * Рубли — оценка по договорной цене единицы (сумма договора / плановый объём захваток),
 * поэтому на экране рядом всегда стоит эта оговорка.
 */
export function unclosedVolume(source: DashboardSource): UnclosedVolume {
  const rows = runningProjects(source.cards);
  let rub = 0;
  let qty = 0;
  let top: { name: string; rub: number } | null = null;
  const stages = new Set<string>();
  const units = new Set<string>();

  for (const row of rows) {
    const { plan, left } = zoneRemainder(row.zones);
    if (!plan) continue;
    const amount = row.contract ? row.contract.amount / 100 : 0;
    const share = (amount * left) / plan;
    rub += share;
    qty += left;
    if (row.project.stage) stages.add(row.project.stage);
    for (const zone of row.zones) units.add(zone.unit);
    if (left > 0 && (!top || share > top.rub)) top = { name: row.project.name, rub: share };
  }

  return {
    rub,
    qty,
    unit: units.size === 1 ? [...units][0]! : "ед.",
    projects: rows.filter((row) => zoneRemainder(row.zones).left > 0).length,
    stages: [...stages],
    top,
  };
}

/** Насколько незакрытый объём вырос за период: договоры, подписанные внутри периода */
function unclosedVolumeSigned(source: DashboardSource, from: string, period: DashboardPeriod) {
  return runningProjects(source.cards)
    .filter(
      (row) => row.contract && inPeriodByDate(row.contract.signedAt, from, source.now, period),
    )
    .reduce((sum, row) => {
      const { plan, left } = zoneRemainder(row.zones);
      if (!plan || !row.contract) return sum;
      return sum + ((row.contract.amount / 100) * left) / plan;
    }, 0);
}

/* ---------- Требует решения ---------- */

export interface AttentionRow {
  id: string;
  /** Чем выше, тем критичнее: определяет цвет полосы и порядок */
  severity: "danger" | "warn" | "info";
  title: string;
  /** Причина одной строкой */
  reason: string;
  projectId: string;
  projectName: string;
  /** Срок словами: «просрочено на 2 дн.», «осталось 5 ч» или null, когда срока нет */
  due: string | null;
  /** Оригинал, на котором держится пункт */
  sourceId: string | null;
  /** Адрес раздела, где пункт решается */
  to: string;
}

const severityRank: Record<AttentionRow["severity"], number> = { danger: 0, warn: 1, info: 2 };

/**
 * Что требует решения по всем объектам: просроченные ответы поставщиков, готовые сравнения
 * и предложенные замены. Источник — те же данные, что у экранов закупок и истории.
 */
export function attentionRows(source: DashboardSource, limit = 8): AttentionRow[] {
  const nameOf = (projectId: string) =>
    source.projects.find((row) => row.project.id === projectId)?.project.name ?? "Объект";
  const rows: AttentionRow[] = [];

  for (const row of source.requests) {
    if (row.status !== "overdue") continue;
    const left = row.request.sentTo.length - row.answered;
    rows.push({
      id: `overdue-${row.request.id}`,
      severity: "danger",
      title: `Ответы просрочены: запрос ${row.request.number}`,
      reason:
        left > 0
          ? `Не ответили ${fmtNum(left)} из ${fmtNum(row.request.sentTo.length)} поставщиков — сравнение неполное`
          : "Срок ответа вышел, решение не зафиксировано",
      projectId: row.request.projectId,
      projectName: nameOf(row.request.projectId),
      due: dueWords(row.replyDue),
      sourceId: row.request.sourceId,
      to: `/projects/${row.request.projectId}/procurement/${row.request.id}`,
    });
  }

  for (const row of source.pending) {
    const request = source.requests.find((item) => item.request.id === row.id);
    rows.push({
      id: `pending-${row.id}`,
      severity: row.kind === "request" ? "warn" : "info",
      title: row.title,
      reason: row.details,
      projectId: row.projectId,
      projectName: nameOf(row.projectId),
      due: request ? dueWords(request.replyDue) : null,
      sourceId: request?.request.sourceId ?? null,
      to: row.link,
    });
  }

  return rows.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).slice(0, limit);
}

function dueWords(due: { hours: number; overdue: boolean } | null) {
  if (!due) return null;
  const abs = Math.abs(due.hours);
  const amount = abs < 24 ? `${Math.max(1, abs)} ч` : `${Math.round(abs / 24)} дн.`;
  return due.overdue || due.hours < 0 ? `просрочено на ${amount}` : `осталось ${amount}`;
}

/* ---------- Объекты ---------- */

export interface ProjectProgress {
  projectId: string;
  name: string;
  status: Project["status"];
  statusLabel: string;
  /** Доля выполненного объёма захваток, % */
  donePct: number;
  /** Отклонение от графика: доля объёма минус доля прошедшего срока договора, п. п. */
  deviationPp: number | null;
  qtyLeft: number;
  unit: string;
}

/**
 * Готовность объектов и отклонение от графика.
 * Отклонение = доля выполненного объёма − доля прошедшего срока договора (глоссарий, §3).
 */
export function projectProgress(source: DashboardSource): ProjectProgress[] {
  return runningProjects(source.cards)
    .map((row) => {
      const { plan, fact, left } = zoneRemainder(row.zones);
      const donePct = plan ? Math.round((fact / plan) * 100) : 0;
      const start = new Date(row.project.startDate).getTime();
      const end = new Date(row.project.endDate).getTime();
      const now = new Date(source.now).getTime();
      const elapsed = end > start ? (now - start) / (end - start) : null;
      const deviationPp =
        elapsed === null || !plan
          ? null
          : Math.round((fact / plan - Math.min(1, Math.max(0, elapsed))) * 100);
      return {
        projectId: row.project.id,
        name: row.project.name,
        status: row.project.status,
        statusLabel: projectStatusLabel[row.project.status],
        donePct,
        deviationPp,
        qtyLeft: left,
        unit: row.zones[0]?.unit ?? "ед.",
      };
    })
    .sort((a, b) => (a.deviationPp ?? 0) - (b.deviationPp ?? 0));
}

/* ---------- Живой поток ---------- */

/** Последние события всех объектов одной лентой */
export function liveFeed(source: DashboardSource, limit = 8) {
  const nameOf = (projectId: string) =>
    source.projects.find((row) => row.project.id === projectId)?.project.name ?? "Объект";
  return [...source.events]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((event) => ({ event, projectName: nameOf(event.projectId) }));
}

/* ---------- Инсайт ---------- */

export interface DashboardInsight {
  title: string;
  text: string;
  projectId: string;
}

/**
 * Значимый вывод — только когда он есть: один объект держит больше половины пунктов внимания
 * и их не меньше трёх. В остальных случаях блок не показывается.
 */
export function dashboardInsight(source: DashboardSource): DashboardInsight | null {
  const rows = attentionRows(source, 100);
  if (rows.length < 3) return null;
  const byProject = new Map<string, AttentionRow[]>();
  for (const row of rows)
    byProject.set(row.projectId, [...(byProject.get(row.projectId) ?? []), row]);
  const [top] = [...byProject.entries()].sort((a, b) => b[1].length - a[1].length);
  if (!top || top[1].length * 2 <= rows.length) return null;

  const [projectId, items] = top;
  const name = items[0]!.projectName;
  const overdue = items.filter((item) => item.severity === "danger").length;
  const decisions = items.length - overdue;
  const parts = [
    overdue
      ? `${fmtNum(overdue)} ${plural(overdue, "просроченный ответ", "просроченных ответа", "просроченных ответов")}`
      : null,
    decisions
      ? `${fmtNum(decisions)} ${plural(decisions, "решение", "решения", "решений")} ждёт`
      : null,
  ].filter(Boolean);

  return {
    projectId,
    title: `Больше половины открытых вопросов — на объекте «${name}»`,
    text: `${parts.join(", ")} из ${fmtNum(rows.length)} по всем объектам. Разбор этого объекта снимет основную часть очереди.`,
  };
}

/** Форма слова по числу; дубль из lib/format, чтобы домен не зависел от интерфейса */
function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
