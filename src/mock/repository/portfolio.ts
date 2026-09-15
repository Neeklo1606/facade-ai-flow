import type { ActivityItem, DocVersionRecord, ProjectOverview } from "./types";
import { approvals, auditLog, extractions, fieldReports, sources } from "./field";
import { milestones } from "./projects";
import { supplyRequests } from "./supply";
import { documents, risks, tasks } from "./operations";
import { volumeEntries } from "./work";

/**
 * Сводные показатели объекта: регион, стадия, состояние спецификации и закупок.
 * Эти цифры показываются в реестре объектов и в карточке объекта — источник один.
 */
export const projectOverviews: ProjectOverview[] = [
  {
    projectId: "p-korona",
    region: "Москва",
    stage: "Монтаж фасада, этап 1",
    docVersion: "Рев. 3",
    specTotal: 847,
    specUnverified: 535,
    inRequests: 214,
    offersReceived: 128,
    ordered: 96,
    inTransit: 22,
    delivered: 74,
    activeRequests: 6,
    overdueRequests: 2,
    openChanges: 3,
    missingReports: 1,
  },
  {
    projectId: "p-meridian",
    region: "Москва",
    stage: "Северный фасад",
    docVersion: "Рев. 2",
    specTotal: 612,
    specUnverified: 0,
    inRequests: 190,
    offersReceived: 142,
    ordered: 120,
    inTransit: 16,
    delivered: 104,
    activeRequests: 3,
    overdueRequests: 0,
    openChanges: 1,
    missingReports: 0,
  },
  {
    projectId: "p-primorsky",
    region: "Санкт-Петербург",
    stage: "Подконструкция, секции 1–3",
    docVersion: "Рев. 1",
    specTotal: 734,
    specUnverified: 126,
    inRequests: 210,
    offersReceived: 96,
    ordered: 78,
    inTransit: 23,
    delivered: 55,
    activeRequests: 4,
    overdueRequests: 1,
    openChanges: 2,
    missingReports: 2,
  },
  {
    projectId: "p-school",
    region: "Москва",
    stage: "Сдача заказчику",
    docVersion: "Рев. 2",
    specTotal: 268,
    specUnverified: 0,
    inRequests: 90,
    offersReceived: 84,
    ordered: 80,
    inTransit: 4,
    delivered: 76,
    activeRequests: 1,
    overdueRequests: 1,
    openChanges: 0,
    missingReports: 0,
  },
  {
    projectId: "p-galaxy",
    region: "Казань",
    stage: "Витражи входной группы",
    docVersion: "Рев. 1",
    specTotal: 421,
    specUnverified: 64,
    inRequests: 120,
    offersReceived: 60,
    ordered: 44,
    inTransit: 14,
    delivered: 30,
    activeRequests: 2,
    overdueRequests: 0,
    openChanges: 1,
    missingReports: 1,
  },
];

export function overviewOf(projectId: string) {
  return projectOverviews.find((item) => item.projectId === projectId) ?? null;
}

/** Версии проектной документации: что загрузили, сколько листов и позиций извлекли. */
export const docVersions: DocVersionRecord[] = [
  {
    id: "dv-korona-3",
    projectId: "p-korona",
    version: "Рев. 3",
    uploadedAt: "2026-08-27T10:05:00",
    uploadedBy: "e-volkova",
    sheets: 12,
    extracted: 847,
    verified: 312,
    sourceId: "src-pd-korona-ar",
    documentId: "doc-10",
  },
  {
    id: "dv-korona-2",
    projectId: "p-korona",
    version: "Рев. 2",
    uploadedAt: "2026-06-11T09:40:00",
    uploadedBy: "e-volkova",
    sheets: 11,
    extracted: 792,
    verified: 792,
    sourceId: null,
    documentId: null,
  },
  {
    id: "dv-korona-1",
    projectId: "p-korona",
    version: "Рев. 1",
    uploadedAt: "2026-05-14T12:15:00",
    uploadedBy: "e-volkova",
    sheets: 10,
    extracted: 731,
    verified: 731,
    sourceId: null,
    documentId: null,
  },
  {
    id: "dv-meridian-2",
    projectId: "p-meridian",
    version: "Рев. 2",
    uploadedAt: "2026-07-22T11:00:00",
    uploadedBy: "e-volkova",
    sheets: 36,
    extracted: 612,
    verified: 612,
    sourceId: "src-pd-meridian-spec",
    documentId: "doc-11",
  },
  {
    id: "dv-primorsky-1",
    projectId: "p-primorsky",
    version: "Рев. 1",
    uploadedAt: "2026-06-02T15:30:00",
    uploadedBy: "e-volkova",
    sheets: 52,
    extracted: 734,
    verified: 608,
    sourceId: "src-pd-primorsky-spec",
    documentId: "doc-12",
  },
  {
    id: "dv-school-2",
    projectId: "p-school",
    version: "Рев. 2",
    uploadedAt: "2026-05-19T10:10:00",
    uploadedBy: "e-volkova",
    sheets: 21,
    extracted: 268,
    verified: 268,
    sourceId: "src-pd-school-spec",
    documentId: "doc-13",
  },
  {
    id: "dv-galaxy-1",
    projectId: "p-galaxy",
    version: "Рев. 1",
    uploadedAt: "2026-06-24T14:45:00",
    uploadedBy: "e-volkova",
    sheets: 29,
    extracted: 421,
    verified: 357,
    sourceId: "src-pd-galaxy-spec",
    documentId: "doc-14",
  },
];

export function docVersionsOf(projectId: string) {
  return docVersions
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Последние события объекта: загрузка, извлечение, правка, запрос, предложение, отчёт. */
export const activityItems: ActivityItem[] = [
  {
    id: "ac-1",
    projectId: "p-korona",
    at: "2026-09-05T09:12:00",
    kind: "request_sent",
    title: "Отправлен запрос З-2026/319 в «Фасад-Комплект»",
    actorId: "e-dorohov",
    sourceId: "src-tg-gareev",
  },
  {
    id: "ac-2",
    projectId: "p-korona",
    at: "2026-09-05T09:05:00",
    kind: "qty_corrected",
    title: "Исправлено количество по захватке 2: 370 → 554 м²",
    actorId: "e-volkova",
    sourceId: "src-tg-gareev",
  },
  {
    id: "ac-3",
    projectId: "p-korona",
    at: "2026-09-05T08:42:00",
    kind: "report_added",
    title: "Добавлен отчёт с площадки за 05.09, 184 м²",
    actorId: "e-gareev",
    sourceId: "src-tg-gareev",
  },
  {
    id: "ac-4",
    projectId: "p-korona",
    at: "2026-09-05T07:15:00",
    kind: "offer_received",
    title: "Получено предложение «Фасад-Комплект» по запросу З-2026/318",
    actorId: "e-dorohov",
    sourceId: "src-mail-fk",
  },
  {
    id: "ac-5",
    projectId: "p-korona",
    at: "2026-09-04T16:40:00",
    kind: "offer_received",
    title: "Получено предложение «МеталлПрофиль Групп» по запросу З-2026/318",
    actorId: "e-dorohov",
    sourceId: "src-mail-mp",
  },
  {
    id: "ac-6",
    projectId: "p-korona",
    at: "2026-08-28T13:20:00",
    kind: "replacement_agreed",
    title: "Согласована замена: нащельник угловой на аналог того же профиля",
    actorId: "e-sokolov",
    sourceId: "src-pd-korona-spec",
  },
  {
    id: "ac-7",
    projectId: "p-korona",
    at: "2026-08-27T11:33:00",
    kind: "spec_extracted",
    title: "Извлечена спецификация: 847 позиций, листы 84–95",
    actorId: "e-volkova",
    sourceId: "src-pd-korona-spec",
  },
  {
    id: "ac-8",
    projectId: "p-korona",
    at: "2026-08-27T10:05:00",
    kind: "version_uploaded",
    title: "Загружена документация, рев. 3",
    actorId: "e-volkova",
    sourceId: "src-pd-korona-ar",
  },
  {
    id: "ac-9",
    projectId: "p-meridian",
    at: "2026-09-04T10:22:00",
    kind: "offer_received",
    title: "Получено предложение «Керамика Трейд» по запросу З-2026/320",
    actorId: "e-dorohov",
    sourceId: "src-mail-kt",
  },
  {
    id: "ac-10",
    projectId: "p-meridian",
    at: "2026-09-03T18:20:00",
    kind: "report_added",
    title: "Добавлен отчёт с площадки: южный фасад, 205 м² принято",
    actorId: "e-kim",
    sourceId: "src-tg-kim",
  },
  {
    id: "ac-11",
    projectId: "p-primorsky",
    at: "2026-08-28T11:05:00",
    kind: "request_sent",
    title: "Отправлен запрос З-2026/321 в «СтройКрепёж»",
    actorId: "e-dorohov",
    sourceId: null,
  },
  {
    id: "ac-12",
    projectId: "p-school",
    at: "2026-08-20T09:30:00",
    kind: "version_uploaded",
    title: "Загружена документация, рев. 2",
    actorId: "e-volkova",
    sourceId: null,
  },
  {
    id: "ac-13",
    projectId: "p-galaxy",
    at: "2026-08-18T16:00:00",
    kind: "spec_extracted",
    title: "Извлечена спецификация: 421 позиция из 29 листов",
    actorId: "e-volkova",
    sourceId: null,
  },
];

export const activityKindLabel: Record<ActivityItem["kind"], string> = {
  version_uploaded: "Загружена версия",
  spec_extracted: "Извлечена спецификация",
  qty_corrected: "Исправлено количество",
  request_sent: "Отправлен запрос",
  offer_received: "Получено предложение",
  replacement_agreed: "Согласована замена",
  report_added: "Добавлен отчёт",
};

export function activityOf(projectId: string) {
  return activityItems
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------- Решения и история объекта ---------- */

/** К какому объекту относится запись журнала или подтверждения. */
export function projectOfEntity(entity: string, id: string): string | null {
  const lookup: Record<string, { id: string; projectId: string }[]> = {
    VolumeEntry: volumeEntries,
    SupplyRequest: supplyRequests,
    Milestone: milestones,
    FieldReport: fieldReports,
    Risk: risks,
    Task: tasks,
    Document: documents,
  };
  if (entity === "Project") return id;
  return lookup[entity]?.find((item) => item.id === id)?.projectId ?? null;
}

function projectOfSource(sourceId: string | null) {
  return sourceId ? (sources.find((item) => item.id === sourceId)?.projectId ?? null) : null;
}

/** Решения людей по объекту: что подтвердили, исправили или отклонили. */
export function decisionsOf(projectId: string) {
  return approvals
    .filter((item) => {
      const sourceId = extractions.find((ex) => ex.id === item.extractionId)?.sourceId ?? null;
      return (
        (projectOfEntity(item.entity, item.entityId) ?? projectOfSource(sourceId)) === projectId
      );
    })
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}

/** Журнал действий по объекту. */
export function historyOf(projectId: string) {
  return auditLog
    .filter(
      (item) =>
        (projectOfEntity(item.entity, item.entityId) ?? projectOfSource(item.sourceId)) ===
        projectId,
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}
