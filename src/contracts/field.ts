import { z } from "zod";
import { col, idSchema, pgEnum, table } from "./db";

/* ---------- Происхождение данных ---------- */

export const sourceKind = pgEnum(
  "source_kind",
  ["telegram", "email", "upload", "call", "manual"],
  "Откуда пришёл первоисточник",
);

export const sources = table(
  {
    name: "sources",
    comment: "Первоисточник: сообщение, письмо, файл, звонок, ручной ввод",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [
      {
        columns: ["projectId", "receivedAt desc"],
        purpose: "источники объекта, панель «Источник»",
      },
      {
        columns: ["captureKey"],
        unique: true,
        where: "capture_key is not null",
        purpose: "повтор отправки находит свой источник и не создаёт дубль (ADR-036)",
      },
    ],
  },
  {
    id: col.id(),
    kind: col.enum(sourceKind),
    title: col.name(),
    author: col.name({ comment: "кто или что породило источник: ФИО, адрес письма" }),
    receivedAt: col.timestamp(),
    projectId: col.ref("projects", "restrict", { nullable: true }),
    location: col.text({ comment: "место внутри источника: страница, таймкод, абзац" }),
    excerpt: col.text(),
    /*
     * Ключ отправки (ADR-036, п. 4): его создаёт клиент и хранит рядом с черновиком.
     * Повтор отправки с тем же ключом возвращает этот же источник, а не создаёт второй,
     * поэтому обрыв сети на отправке не оставляет дублей.
     */
    captureKey: col.text({ nullable: true, comment: "ключ идемпотентности отправки" }),
  },
);

export const extractions = table(
  {
    name: "extractions",
    comment: "Поле, распознанное в источнике, с уверенностью и цитатой",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [
      { columns: ["sourceId"], purpose: "распознанные поля в панели источника и в отчёте" },
      {
        columns: ["appliedEntity", "appliedId"],
        where: "applied_id is not null",
        purpose: "откуда взялось значение сущности",
      },
    ],
    checks: ["(applied_entity is null) = (applied_id is null)"],
  },
  {
    id: col.id(),
    sourceId: col.ref("sources", "cascade"),
    label: col.name(),
    value: col.name(),
    confidence: col.ratio(),
    quote: col.text(),
    location: col.text(),
    appliedEntity: col.text({
      nullable: true,
      comment: "таблица, куда легло значение после подтверждения",
    }),
    appliedId: col.text({
      nullable: true,
      comment: "id строки в applied_entity",
      holdsIds: true,
    }),
  },
);

/* ---------- Отчёты с площадки ---------- */

export const reportKind = pgEnum("report_kind", ["voice", "text", "photo"], "Как прислан отчёт");

/** Переходы статуса отчёта: одна таблица для схемы БД и для проверки в адаптере */
export const reportTransitions = {
  review: ["accepted", "returned"],
  returned: ["review", "accepted"],
  accepted: ["review"],
} as const;

export const reportStatus = pgEnum(
  "report_status",
  ["review", "accepted", "returned"],
  "Проверка отчёта руководителем или ПТО",
  reportTransitions,
);

export const fieldReports = table(
  {
    name: "field_reports",
    comment: "Отчёт прораба из Telegram: объём по захватке, фото, проблемы",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["projectId", "reportDate desc"], purpose: "лента отчётов объекта по дням" },
      { columns: ["projectId", "status"], purpose: "фильтр «На проверке», счётчики" },
      { columns: ["zoneId", "status"], purpose: "фильтр по захватке, факт захватки по принятым" },
      { columns: ["crewId", "reportDate desc"], purpose: "отсутствующие отчёты бригад" },
    ],
    checks: [
      "(status = 'accepted') = (accepted_qty is not null)",
      "declared_qty >= 0",
      "headcount >= 0",
    ],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict"),
    zoneId: col.ref("work_zones", "restrict"),
    authorId: col.ref("employees", "restrict"),
    crewId: col.ref("crews", "set null", { nullable: true }),
    reportDate: col.date(),
    sentAt: col.timestamp(),
    kind: col.enum(reportKind),
    workType: col.name(),
    status: col.enum(reportStatus),
    summary: col.text(),
    declaredQty: col.qty(),
    unit: col.name(),
    acceptedQty: col.qty({ nullable: true }),
    headcount: col.smallint(),
    sourceId: col.ref("sources", "restrict"),
  },
);

export const issueSeverity = pgEnum("issue_severity", ["blocker", "warning"], "Важность проблемы");

export const fieldReportIssues = table(
  {
    name: "field_report_issues",
    comment: "Проблема, найденная в отчёте",
    primaryKey: ["id"],
    indexes: [{ columns: ["reportId"], purpose: "проблемы в карточке отчёта" }],
  },
  {
    id: col.id(),
    reportId: col.ref("field_reports", "cascade"),
    text: col.name(),
    severity: col.enum(issueSeverity),
  },
);

export const evidenceKind = pgEnum(
  "evidence_kind",
  ["photo", "audio", "file"],
  "Вид материала отчёта",
);

export const evidence = table(
  {
    name: "evidence",
    comment: "Фото, аудио или файл: приходит с источником, позже привязывается к отчёту",
    primaryKey: ["id"],
    indexes: [
      { columns: ["reportId", "takenAt"], purpose: "галерея отчёта по времени съёмки" },
      { columns: ["sourceId", "takenAt"], purpose: "материалы записи до того, как есть отчёт" },
    ],
    /*
     * Материал висит либо на отчёте, либо на источнике (ADR-036, п. 1): фото во время записи
     * приходит раньше, чем появляется отчёт, а отчёт появляется только после подтверждения.
     */
    checks: ["(report_id is null) <> (source_id is null)"],
  },
  {
    id: col.id(),
    reportId: col.ref("field_reports", "cascade", { nullable: true }),
    sourceId: col.ref("sources", "cascade", { nullable: true }),
    kind: col.enum(evidenceKind),
    caption: col.text(),
    takenAt: col.timestamp(),
    location: col.text({ comment: "таймкод, номер фото" }),
  },
);

/* ---------- Представления ---------- */

export const fieldReport = fieldReports.omit({ reportDate: true }).extend({
  date: fieldReports.shape.reportDate,
  issues: z.array(fieldReportIssues.omit({ reportId: true })),
  evidenceIds: z.array(idSchema),
});

export type Source = z.infer<typeof sources>;
export type SourceKind = z.infer<typeof sourceKind.schema>;
export type Extraction = z.infer<typeof extractions>;
export type FieldReportRow = z.infer<typeof fieldReports>;
export type FieldReportIssue = z.infer<typeof fieldReportIssues>;
export type FieldReport = z.infer<typeof fieldReport>;
export type Evidence = z.infer<typeof evidence>;

/* ---------- Словари ---------- */

export const sourceKindLabel: Record<SourceKind, string> = {
  telegram: "Сообщение с площадки",
  email: "Письмо",
  upload: "Загруженный документ",
  call: "Звонок",
  manual: "Введено вручную",
};

export const reportStatusLabel: Record<FieldReport["status"], string> = {
  review: "На проверке",
  accepted: "Принят",
  returned: "Возвращён",
};

export const reportKindLabel: Record<FieldReport["kind"], string> = {
  voice: "Голос",
  text: "Текст",
  photo: "Только фото",
};

/* ---------- Заявка на материал (ADR-037, сценарий 3) ---------- */

/**
 * Движение заявки: снабжение принимает её в работу, заказывает и закрывает. Отказ — тоже
 * решение и требует причины. Ничего не заказывается автоматически: статус меняет человек.
 */
export const materialRequestTransitions = {
  new: ["accepted", "declined"],
  accepted: ["ordered", "declined"],
  ordered: ["closed"],
  closed: [],
  declined: [],
} as const;

export const materialRequestStatus = pgEnum(
  "material_request_status",
  ["new", "accepted", "ordered", "closed", "declined"],
  "Заявка на материал: от площадки к снабжению",
  materialRequestTransitions,
);

export const materialRequests = table(
  {
    name: "material_requests",
    comment: "Заявка на материал с площадки: что, сколько, к какому сроку (ADR-037)",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["projectId", "neededBy"], purpose: "заявки объекта по сроку" },
      { columns: ["status", "neededBy"], purpose: "очередь снабжения" },
      { columns: ["authorId", "requestedAt desc"], purpose: "мои заявки на «Сегодня»" },
    ],
    checks: [
      "qty > 0",
      // Решение приходит вместе с автором и временем: иначе непонятно, кто ответил
      "(decided_by is null) = (decided_at is null)",
    ],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict"),
    /** Источник, из которого выросла заявка: голосовое или текст с площадки */
    sourceId: col.ref("sources", "set null", { nullable: true }),
    name: col.name({ comment: "что нужно: наименование материала словами площадки" }),
    qty: col.qty(),
    unit: col.name(),
    neededBy: col.date({ comment: "к какой дате материал нужен на объекте" }),
    status: col.enum(materialRequestStatus),
    note: col.text({ comment: "зачем и что встанет без него" }),
    authorId: col.ref("employees", "restrict"),
    requestedAt: col.timestamp({ comment: "когда заявка пришла с площадки" }),
    decidedBy: col.ref("employees", "set null", { nullable: true }),
    decidedAt: col.timestamp({ nullable: true }),
    decision: col.text({ nullable: true, comment: "что решило снабжение и почему" }),
  },
);

export type MaterialRequest = z.infer<typeof materialRequests>;
export type MaterialRequestStatus = z.infer<typeof materialRequestStatus.schema>;

export const materialRequestStatusLabel: Record<MaterialRequestStatus, string> = {
  new: "Новая",
  accepted: "Принята",
  ordered: "Заказана",
  closed: "Закрыта",
  declined: "Отклонена",
};
