import type { ListProjectsInput } from "@/ports";

/** Адрес серверной выгрузки реестра объектов (P3-5) */
export const REGISTRY_EXPORT_PATH = "/api/export/projects";

export function registryExportQuery(filter: ListProjectsInput) {
  const params = new URLSearchParams();
  if (filter.region) params.set("region", filter.region);
  if (filter.managerId) params.set("managerId", filter.managerId);
  if (filter.status) params.set("status", filter.status);
  if (filter.unverified) params.set("unverified", "true");
  return params.toString();
}

export function registryFileName(date = new Date()) {
  return `Объекты_${date.toISOString().slice(0, 10)}.xlsx`;
}
