import type { ListPositionsInput } from "@/ports";

/**
 * Единая таблица ключей запросов (ADR-002, п. 1). Первый элемент — область: по нему мутации
 * инвалидируют всё, что зависит от изменённых данных.
 *
 * | Изменение                          | Затронутые области                                      |
 * |------------------------------------|---------------------------------------------------------|
 * | решение проверки позиции           | positions, documents, projects                          |
 * | передача в закупку                 | positions, documents, projects                          |
 * | загрузка документа                 | documents, positions, projects, timeline                |
 * | создание запроса                   | procurement, positions, projects, timeline              |
 * | предложение поставщика, напоминание| procurement, positions, projects, timeline              |
 * | решение по запросу                 | procurement, positions, projects, timeline              |
 * | приёмка отчёта                     | reports                                                 |
 * | проверка контакта поставщика       | procurement                                             |
 * | новый объект                       | projects, directory                                     |
 */
export const keys = {
  directory: {
    employees: () => ["directory", "employees"] as const,
    counterparties: () => ["directory", "counterparties"] as const,
  },
  projects: {
    list: () => ["projects", "list"] as const,
    card: (id: string) => ["projects", "card", id] as const,
  },
  documents: {
    list: (projectId?: string) => ["documents", "list", projectId ?? "all"] as const,
    revisions: (documentId: string) => ["documents", "revisions", documentId] as const,
    card: (revisionId: string) => ["documents", "card", revisionId] as const,
    changes: (projectId: string) => ["documents", "changes", projectId] as const,
  },
  positions: {
    list: (input: ListPositionsInput) => ["positions", "list", input] as const,
    history: (positionId: string) => ["positions", "history", positionId] as const,
    materials: () => ["positions", "materials"] as const,
    replacements: () => ["positions", "replacements"] as const,
  },
  procurement: {
    suppliers: () => ["procurement", "suppliers"] as const,
    templates: () => ["procurement", "templates"] as const,
    requests: (projectId: string) => ["procurement", "requests", projectId] as const,
    request: (requestId: string) => ["procurement", "request", requestId] as const,
    deliveries: (projectId: string) => ["procurement", "deliveries", projectId] as const,
  },
  reports: {
    list: (projectId: string) => ["reports", "list", projectId] as const,
    source: (sourceId: string) => ["reports", "source", sourceId] as const,
  },
  timeline: {
    list: (projectId: string) => ["timeline", "list", projectId] as const,
    decisions: (projectId: string) => ["timeline", "decisions", projectId] as const,
    pending: (projectId: string) => ["timeline", "pending", projectId] as const,
  },
};

export type Area =
  "directory" | "projects" | "documents" | "positions" | "procurement" | "reports" | "timeline";
