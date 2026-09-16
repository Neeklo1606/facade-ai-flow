import { z } from "zod";
import { col, idSchema, pgEnum, table, timestampSchema } from "./db";
import { actorKind } from "./positions";

export const eventType = pgEnum(
  "event_type",
  [
    "version_uploaded",
    "spec_extracted",
    "qty_corrected",
    "request_created",
    "offer_received",
    "replacement_proposed",
    "replacement_agreed",
    "material_ordered",
    "delivery_received",
    "report_added",
  ],
  "Тип события в истории объекта. Решения живут в project_decisions и в ленту добавляются при чтении",
);

export const projectEvents = table(
  {
    name: "project_events",
    comment: "Журнал истории объекта. Пишется действиями и обработкой, не редактируется",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [
      { columns: ["projectId", "occurredAt desc"], purpose: "лента «История и решения», сводка" },
      {
        columns: ["projectId", "type", "occurredAt desc"],
        purpose: "фильтр ленты по типу события",
      },
    ],
    checks: ["(actor_kind = 'user') = (actor_id is not null)"],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict"),
    occurredAt: col.timestamp(),
    type: col.enum(eventType),
    title: col.name(),
    details: col.text({ nullable: true }),
    actorKind: col.enum(actorKind),
    actorId: col.ref("employees", "restrict", { nullable: true }),
    sourceId: col.ref("sources", "set null", { nullable: true }),
    requestId: col.ref("supply_requests", "restrict", { nullable: true }),
    revisionId: col.ref("document_revisions", "restrict", { nullable: true }),
    positionId: col.ref("positions", "restrict", { nullable: true }),
    reportId: col.ref("field_reports", "restrict", { nullable: true }),
  },
);

/** Событие ленты: событие или решение, ссылка на раздел построена из ссылок на сущности. */
export const timelineEvent = z.object({
  id: idSchema,
  projectId: idSchema,
  at: timestampSchema,
  type: z.enum([...eventType.values, "decision"]),
  title: z.string().min(1),
  details: z.string().nullable(),
  /** Сотрудник или null, если событие записала обработка */
  actorId: idSchema.nullable(),
  sourceId: idSchema.nullable(),
  link: z.object({ to: z.string(), label: z.string() }).nullable(),
});

export type ProjectEvent = z.infer<typeof projectEvents>;
export type TimelineEvent = z.infer<typeof timelineEvent>;
export type TimelineEventType = TimelineEvent["type"];

export const timelineTypeLabel: Record<TimelineEventType, string> = {
  version_uploaded: "Загружена версия документа",
  spec_extracted: "Извлечена спецификация",
  qty_corrected: "Исправлено количество",
  request_created: "Создан запрос",
  offer_received: "Получено предложение",
  replacement_proposed: "Предложена замена",
  replacement_agreed: "Замена согласована",
  material_ordered: "Материал заказан",
  delivery_received: "Поставка получена",
  report_added: "Добавлен отчёт с площадки",
  decision: "Зафиксировано решение",
};
