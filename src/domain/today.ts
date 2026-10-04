import type { Delivery, FieldReport, WorkZone } from "@/contracts";

/**
 * «Сегодня» — рабочий экран прораба (ADR-028, п. 2). Здесь только формулы: экран получает
 * готовые строки и не считает ничего сам (ADR-001, п. 5).
 *
 * Экран показывает факт, а не план: плана работ в модели нет, и обещать его нечем.
 * Поэтому первый блок называется «Зафиксировано сегодня», а не «План на сегодня».
 */

export interface TodaySource {
  /** «Сейчас» источника данных: в демонстрации это часы демо */
  now: string;
  /** Нужны только имя и ключ: формулам незачем знать остальную карточку объекта */
  projects: { id: string; name: string }[];
  zones: WorkZone[];
  reports: FieldReport[];
  deliveries: Delivery[];
}

export interface TodayWork {
  id: string;
  projectId: string;
  projectName: string;
  zoneName: string;
  workType: string;
  qty: number;
  unit: string;
  status: FieldReport["status"];
}

export interface TodayDelivery {
  id: string;
  projectId: string;
  projectName: string;
  supplierId: string;
  expectedAt: string;
  status: Delivery["status"];
  /** Срок прибытия прошёл, а поставка не приехала */
  overdue: boolean;
  items: number;
}

export interface TodayReturn {
  id: string;
  projectId: string;
  projectName: string;
  zoneName: string;
  workType: string;
  summary: string;
  date: string;
}

/** Дата источника без времени: «2026-09-05» */
export function todayOf(source: Pick<TodaySource, "now">) {
  return source.now.slice(0, 10);
}

const nameOf = (source: TodaySource, projectId: string) =>
  source.projects.find((item) => item.id === projectId)?.name ?? "Объект";

/**
 * Подпись захватки: имя плюс оси, если их в имени ещё нет. В фикстурах и у заведённых с экрана
 * захваток оси часто входят в имя, и слепое «имя, оси …» давало «Захватка 2, оси Г–К, оси Г–К».
 */
export function zoneLabel(zone: Pick<WorkZone, "name" | "axes"> | undefined) {
  if (!zone) return "Захватка";
  if (!zone.axes || zone.name.includes(zone.axes)) return zone.name;
  return `${zone.name}, оси ${zone.axes}`;
}

const zoneOf = (source: TodaySource, zoneId: string) =>
  zoneLabel(source.zones.find((item) => item.id === zoneId));

/** Что зафиксировано сегодняшней сменой: отчёты с датой «сегодня», свежие сверху */
export function todayWorks(source: TodaySource): TodayWork[] {
  const today = todayOf(source);
  return source.reports
    .filter((report) => report.date === today)
    .map((report) => ({
      id: report.id,
      projectId: report.projectId,
      projectName: nameOf(source, report.projectId),
      zoneName: zoneOf(source, report.zoneId),
      workType: report.workType,
      // Пока отчёт не принят, объём остаётся заявленным — так и показываем
      qty: report.acceptedQty ?? report.declaredQty,
      unit: report.unit,
      status: report.status,
    }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Статусы поставки, которая ещё едет: принятая и отклонённая сегодня уже не ждут */
const COMING: Delivery["status"][] = ["expected", "shipped", "in_transit"];

/** Сколько поставок в пути всего: счётчик блока показывает это, а не длину срезки */
export function comingCount(source: TodaySource) {
  return source.deliveries.filter((delivery) => COMING.includes(delivery.status)).length;
}

/** Чего ждать на площадке: ближайшие поставки по дате прибытия, просроченные первыми */
export function comingDeliveries(source: TodaySource, limit = 6): TodayDelivery[] {
  const today = todayOf(source);
  return source.deliveries
    .filter((delivery) => COMING.includes(delivery.status))
    .map((delivery) => ({
      id: delivery.id,
      projectId: delivery.projectId,
      projectName: nameOf(source, delivery.projectId),
      supplierId: delivery.supplierId,
      expectedAt: delivery.expectedAt,
      status: delivery.status,
      overdue: delivery.expectedAt < today,
      items: delivery.items.length,
    }))
    .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt))
    .slice(0, limit);
}

/** Что вернули на уточнение: отчёты, по которым ждут ответа прораба */
export function returnedReports(source: TodaySource): TodayReturn[] {
  return source.reports
    .filter((report) => report.status === "returned")
    .map((report) => ({
      id: report.id,
      projectId: report.projectId,
      projectName: nameOf(source, report.projectId),
      zoneName: zoneOf(source, report.zoneId),
      workType: report.workType,
      summary: report.summary,
      date: report.date,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
