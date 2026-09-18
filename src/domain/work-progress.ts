import {
  milestoneStatusLabel,
  type Contract,
  type FieldReport,
  type Milestone,
  type Project,
  type WorkZone,
} from "@/contracts";
import { fmtNum } from "@/shared/number-format";

/**
 * Ход работ и команда объекта (TASK-A2, ADR-008). Формулы считаются здесь, экран получает готовое.
 *
 * Величин, которых нет в модели (прогноз завершения, отклонение в днях, допуски), здесь нет:
 * вместо них честные аналоги, у каждого — формула для подсказки «как получено». Замена аналога
 * на полную величину меняет только источник значения, раскладка экрана остаётся прежней.
 */

/* ---------- Захватки ---------- */

export interface ZoneRow {
  id: string;
  name: string;
  axes: string | null;
  floors: string | null;
  /** Вид работ по отчётам с этой захватки; null — отчётов ещё не было */
  workType: string | null;
  planQty: number;
  factQty: number;
  unit: string;
  donePct: number;
  /** Доля прошедшего срока договора, % — риска плана на полосе */
  planPct: number | null;
  /** Отклонение в процентных пунктах: доля объёма минус доля срока */
  deviationPp: number | null;
  /** Последний принятый отчёт по захватке */
  lastFact: { reportId: string; sourceId: string | null; at: string; qty: number } | null;
}

function elapsedShare(project: Project, now: string) {
  const start = new Date(project.startDate).getTime();
  const end = new Date(project.endDate).getTime();
  const today = new Date(now).getTime();
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (today - start) / (end - start)));
}

export function zoneRows(
  zones: WorkZone[],
  reports: FieldReport[],
  project: Project,
  now: string,
): ZoneRow[] {
  const elapsed = elapsedShare(project, now);
  return zones.map((zone) => {
    const zoneReports = reports
      .filter((report) => report.zoneId === zone.id)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const accepted = zoneReports.find((report) => report.status === "accepted");
    const donePct = zone.planQty ? Math.round((zone.factQty / zone.planQty) * 100) : 0;
    const planPct = elapsed === null ? null : Math.round(elapsed * 100);
    return {
      id: zone.id,
      name: zone.name,
      axes: zone.axes,
      floors: zone.floors,
      workType: zoneReports[0]?.workType ?? null,
      planQty: zone.planQty,
      factQty: zone.factQty,
      unit: zone.unit,
      donePct,
      planPct,
      deviationPp: planPct === null ? null : donePct - planPct,
      lastFact: accepted
        ? {
            reportId: accepted.id,
            sourceId: accepted.sourceId,
            at: accepted.sentAt,
            qty: accepted.acceptedQty ?? accepted.declaredQty,
          }
        : null,
    };
  });
}

/* ---------- Контрольные точки ---------- */

export interface MilestonePoint {
  id: string;
  name: string;
  dueDate: string;
  requirement: string;
  status: Milestone["status"];
  statusLabel: string;
  /** Срок прошёл */
  past: boolean;
  /** Положение на линии времени договора, 0…1 */
  offset: number;
  sourceId: string | null;
  location: string | null;
}

export interface MilestoneTimeline {
  points: MilestonePoint[];
  /** Положение «сегодня» на той же линии, 0…1; null — сроки договора неизвестны */
  todayOffset: number | null;
  from: string;
  to: string;
}

export function milestoneTimeline(
  milestones: Milestone[],
  project: Project,
  now: string,
): MilestoneTimeline {
  const sorted = [...milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const from = sorted[0]?.dueDate ?? project.startDate;
  const to = sorted[sorted.length - 1]?.dueDate ?? project.endDate;
  const span = new Date(to).getTime() - new Date(from).getTime();
  const at = (date: string) =>
    span > 0
      ? Math.min(1, Math.max(0, (new Date(date).getTime() - new Date(from).getTime()) / span))
      : 0;
  const today = now.slice(0, 10);
  return {
    points: sorted.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      dueDate: milestone.dueDate,
      requirement: milestone.requirement,
      status: milestone.status,
      statusLabel: milestoneStatusLabel[milestone.status],
      past: milestone.dueDate < today,
      offset: at(milestone.dueDate),
      sourceId: milestone.sourceId,
      location: milestone.location,
    })),
    todayOffset: span > 0 ? at(today) : null,
    from,
    to,
  };
}

/* ---------- Метрики «Хода работ» ---------- */

export interface ProgressMetric {
  key: string;
  label: string;
  value: string;
  /** Честная подпись: что именно показывает величина, если это аналог */
  note?: string | undefined;
  explain: {
    title: string;
    formula: string;
    sources: { label: string; hint?: string | undefined; sourceId?: string | null | undefined }[];
  };
  /** Какие захватки показать по нажатию: all — все, behind — отстающие, null — метрика не фильтрует */
  filter: "all" | "behind" | null;
  /** Контрольная точка, которую открывает метрика */
  milestoneId?: string | undefined;
}

export function progressMetrics(input: {
  zones: ZoneRow[];
  timeline: MilestoneTimeline;
  contract: Contract | null;
  now: string;
}): ProgressMetric[] {
  const { zones, timeline, contract, now } = input;
  const plan = zones.reduce((sum, zone) => sum + zone.planQty, 0);
  const fact = zones.reduce((sum, zone) => sum + zone.factQty, 0);
  const unit = zones[0]?.unit ?? "ед.";
  const donePct = plan ? Math.round((fact / plan) * 100) : 0;
  const planPct = zones.find((zone) => zone.planPct !== null)?.planPct ?? null;
  const behind = zones.filter((zone) => (zone.deviationPp ?? 0) < 0);
  const next = timeline.points.find((point) => !point.past) ?? null;
  const days = next
    ? Math.round(
        (new Date(next.dueDate).getTime() - new Date(now.slice(0, 10)).getTime()) / 86_400_000,
      )
    : null;
  const contractSource = contract?.sourceId ?? null;

  return [
    {
      key: "done",
      label: "Выполнено объёмов",
      value: `${donePct}%`,
      note: `${fmtNum(fact)} из ${fmtNum(plan)} ${unit}`,
      filter: "all",
      explain: {
        title: "Выполнено объёмов",
        formula: "Сумма факта по захваткам ÷ сумма плана по захваткам",
        sources: [
          {
            label: `Захватки объекта: ${fmtNum(zones.length)}`,
            hint: "план и факт заведены по каждой",
          },
        ],
      },
    },
    {
      key: "deviation",
      label: "Отклонение план-факт",
      value:
        planPct === null
          ? "—"
          : `${donePct - planPct > 0 ? "+" : donePct - planPct < 0 ? "−" : ""}${Math.abs(donePct - planPct)} п. п.`,
      note: "Сроков у захваток в модели нет: сравниваем долю объёма с долей срока договора",
      filter: "behind",
      explain: {
        title: "Отклонение план-факт",
        formula: "Доля выполненного объёма − доля прошедшего срока договора",
        sources: [
          {
            label: contract ? `Договор ${contract.number}` : "Договор объекта",
            hint: contract ? `сроки ${contract.startDate} — ${contract.endDate}` : undefined,
            sourceId: contractSource,
          },
        ],
      },
    },
    {
      key: "next",
      label: "Ближайшая контрольная точка",
      value: next ? next.dueDate.split("-").reverse().join(".") : "нет",
      note: next?.name,
      filter: null,
      ...(next ? { milestoneId: next.id } : {}),
      explain: {
        title: "Ближайшая контрольная точка",
        formula: "Первая контрольная точка договора, срок которой ещё не прошёл",
        sources: next
          ? [{ label: next.name, hint: next.location ?? undefined, sourceId: next.sourceId }]
          : [{ label: "Контрольные точки договора не извлечены" }],
      },
    },
    {
      key: "days",
      label: "Дней до контрольной точки",
      value: days === null ? "—" : fmtNum(days),
      note: "Прогноз завершения появится, когда накопится история темпа по отчётам",
      filter: null,
      ...(next ? { milestoneId: next.id } : {}),
      explain: {
        title: "Дней до контрольной точки",
        formula: "Дата ближайшей контрольной точки − сегодня",
        sources: next
          ? [{ label: next.name, hint: next.requirement, sourceId: next.sourceId }]
          : [{ label: "Контрольных точек нет" }],
      },
    },
  ];
}

/* ---------- Команда ---------- */

export interface TeamPerson {
  id: string;
  name: string;
  position: string;
  role: string;
  phone: string;
  telegram: string | null;
  /** Бригада, в которой человек прораб; для остальных — null */
  crewName: string | null;
  /** Последний отчёт этого человека: когда и по какой захватке */
  lastReport: { at: string; zoneName: string; status: FieldReport["status"] } | null;
  projectCount: number;
}

export interface TeamCrew {
  id: string;
  name: string;
  foremanName: string;
  headcount: number;
  specialization: string;
  /** Захватка последнего отчёта бригады */
  lastZone: { id: string; name: string; at: string } | null;
}

export function teamRows(input: {
  people: {
    id: string;
    name: string;
    position: string;
    role: string;
    phone: string;
    telegram: string | null;
    projectIds: string[];
  }[];
  crews: {
    id: string;
    name: string;
    foremanId: string;
    headcount: number;
    specialization: string;
  }[];
  reports: FieldReport[];
  zones: WorkZone[];
}): { people: TeamPerson[]; crews: TeamCrew[] } {
  const { people, crews, reports, zones } = input;
  const zoneName = (id: string) => zones.find((zone) => zone.id === id)?.name ?? "—";
  const sorted = [...reports].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  return {
    people: people.map((person) => {
      const last = sorted.find((report) => report.authorId === person.id);
      return {
        id: person.id,
        name: person.name,
        position: person.position,
        role: person.role,
        phone: person.phone,
        telegram: person.telegram,
        crewName: crews.find((crew) => crew.foremanId === person.id)?.name ?? null,
        lastReport: last
          ? { at: last.sentAt, zoneName: zoneName(last.zoneId), status: last.status }
          : null,
        projectCount: person.projectIds.length,
      };
    }),
    crews: crews.map((crew) => {
      const last = sorted.find((report) => report.crewId === crew.id);
      return {
        id: crew.id,
        name: crew.name,
        foremanName: people.find((person) => person.id === crew.foremanId)?.name ?? "—",
        headcount: crew.headcount,
        specialization: crew.specialization,
        lastZone: last ? { id: last.zoneId, name: zoneName(last.zoneId), at: last.sentAt } : null,
      };
    }),
  };
}

export interface TeamMetric extends Omit<ProgressMetric, "filter" | "milestoneId"> {
  filter: "all" | "silent" | null;
}

/** Бригады без отчёта за последние дни — честный аналог метрики «допусков» */
export function silentCrews(crews: TeamCrew[], now: string, days = 7) {
  const edge = new Date(new Date(now).getTime() - days * 86_400_000).toISOString().slice(0, 19);
  return crews.filter((crew) => !crew.lastZone || crew.lastZone.at < edge);
}

export function teamMetrics(input: {
  people: TeamPerson[];
  crews: TeamCrew[];
  now: string;
}): TeamMetric[] {
  const { people, crews, now } = input;
  const silent = silentCrews(crews, now);
  const foremen = people.filter((person) => person.role === "foreman").length;
  return [
    {
      key: "people",
      label: "Человек на объекте",
      value: fmtNum(people.length),
      filter: "all",
      explain: {
        title: "Человек на объекте",
        formula: "Сотрудники, у которых объект указан в участии",
        sources: [
          { label: `Прорабов: ${fmtNum(foremen)}`, hint: "остальные — ПТО, снабжение, финансы" },
        ],
      },
    },
    {
      key: "crews",
      label: "Бригад",
      value: fmtNum(crews.length),
      filter: null,
      explain: {
        title: "Бригады объекта",
        formula: "Бригады, закреплённые за объектом",
        sources: [
          {
            label: `Людей в бригадах: ${fmtNum(crews.reduce((sum, crew) => sum + crew.headcount, 0))}`,
          },
        ],
      },
    },
    {
      key: "silent",
      label: "Бригад без отчёта",
      value: fmtNum(silent.length),
      note: "Допуски появятся после загрузки кадровых документов",
      filter: "silent",
      explain: {
        title: "Бригады без отчёта за 7 дней",
        formula: "Бригады, от которых нет отчёта за последние 7 дней",
        sources: silent.length
          ? silent.map((crew) => ({
              label: crew.name,
              hint: crew.lastZone
                ? `последний отчёт ${crew.lastZone.at.slice(0, 10)}`
                : "отчётов не было",
            }))
          : [{ label: "Все бригады отчитались" }],
      },
    },
  ];
}
