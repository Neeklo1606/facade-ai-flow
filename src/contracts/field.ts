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
    appliedId: col.text({ nullable: true, comment: "id строки в applied_entity" }),
  },
);

/* ---------- Отчёты с площадки ---------- */

export const reportKind = pgEnum("report_kind", ["voice", "text", "photo"], "Как прислан отчёт");

export const reportStatus = pgEnum(
  "report_status",
  ["review", "accepted", "returned"],
  "Проверка отчёта руководителем или ПТО",
  { review: ["accepted", "returned"], returned: ["review", "accepted"], accepted: ["review"] },
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
    comment: "Фото, аудио или файл отчёта с площадки",
    primaryKey: ["id"],
    indexes: [{ columns: ["reportId", "takenAt"], purpose: "галерея отчёта по времени съёмки" }],
  },
  {
    id: col.id(),
    reportId: col.ref("field_reports", "cascade"),
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
  photo: "Фото",
};
