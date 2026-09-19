import { projectStatusLabel, type Project, type ProjectOverview } from "@/contracts";

/** Реестр объектов: фильтр, порядок и колонки выгрузки (P3-5). Одни и те же для экрана и файла. */

export interface RegistryFilter {
  region?: string | undefined;
  managerId?: string | undefined;
  status?: Project["status"] | undefined;
  /** Только объекты с непроверенными позициями */
  unverified?: boolean | undefined;
}

export interface RegistryItem {
  project: Project;
  overview: ProjectOverview;
}

/** Отфильтровать и упорядочить: сначала просроченные ответы, затем непроверенные строки */
export function registryRows<T extends RegistryItem>(items: T[], filter: RegistryFilter) {
  return (
    items
      .filter((item) => !filter.region || item.overview.region === filter.region)
      .filter((item) => !filter.managerId || item.project.manager === filter.managerId)
      .filter((item) => !filter.status || item.project.status === filter.status)
      .filter((item) => !filter.unverified || item.overview.specUnverified > 0)
      // Два ключа, а не общий вес: просроченный ответ важнее любого числа непроверенных строк
      .sort(
        (a, b) =>
          b.overview.overdueRequests - a.overview.overdueRequests ||
          b.overview.specUnverified - a.overview.specUnverified,
      )
  );
}

export interface ExportColumn<T> {
  header: string;
  width: number;
  value: (row: T) => string | number;
}

/** Колонки выгрузки реестра в Excel */
export function registryColumns(
  employeeName: (id: string) => string,
): ExportColumn<RegistryItem>[] {
  return [
    { header: "Объект", width: 38, value: (row) => row.project.name },
    { header: "Код", width: 10, value: (row) => row.project.code },
    { header: "Регион", width: 18, value: (row) => row.overview.region },
    { header: "Заказчик", width: 22, value: (row) => row.project.customer },
    { header: "Ответственный", width: 18, value: (row) => employeeName(row.project.manager) },
    { header: "Версия документации", width: 12, value: (row) => row.overview.docVersion },
    { header: "Позиций материалов", width: 12, value: (row) => row.overview.specTotal },
    { header: "Непроверенных строк", width: 12, value: (row) => row.overview.specUnverified },
    { header: "Активных запросов", width: 12, value: (row) => row.overview.activeRequests },
    { header: "Просроченных ответов", width: 12, value: (row) => row.overview.overdueRequests },
    { header: "Открытых изменений", width: 12, value: (row) => row.overview.openChanges },
    { header: "Статус", width: 14, value: (row) => projectStatusLabel[row.project.status] },
  ];
}
