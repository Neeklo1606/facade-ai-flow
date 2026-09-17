import { z } from "zod";
import { col, idSchema, pgEnum, table } from "./db";

/* ---------- Документ и ревизии ---------- */

export const documents = table(
  {
    name: "documents",
    comment: "Документ проекта независимо от ревизии",
    primaryKey: ["id"],
    audited: true,
    indexes: [{ columns: ["projectId", "section"], purpose: "документация объекта по разделам" }],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict"),
    section: col.name({ comment: "раздел проекта: НВФ, АР, КМ" }),
    title: col.name(),
  },
);

export const fileType = pgEnum("file_type", ["pdf", "docx", "xlsx"], "Формат загруженного файла");

export const processingStatus = pgEnum(
  "processing_status",
  ["uploaded", "recognizing", "extracted", "review", "verified"],
  "Обработка ревизии: распознавание, извлечение позиций, проверка человеком",
  {
    uploaded: ["recognizing"],
    recognizing: ["extracted"],
    extracted: ["review"],
    review: ["verified"],
  },
);

export const documentRevisions = table(
  {
    name: "document_revisions",
    comment: "Загруженная ревизия документа. На экранах «документ» — это ревизия",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      {
        columns: ["documentId", "revision"],
        unique: true,
        purpose: "ревизия уникальна в документе",
      },
      {
        columns: ["documentId", "uploadedAt desc"],
        purpose: "список документации, последние сверху",
      },
      {
        columns: ["status"],
        where: "status <> 'verified'",
        purpose: "очередь обработки и проверки",
      },
    ],
    checks: ["revision > 0", "positions_verified is null or positions_verified <= positions_total"],
  },
  {
    id: col.id(),
    documentId: col.ref("documents", "restrict"),
    revision: col.smallint(),
    label: col.name({ comment: "как ревизию называют в документе: «Рев. 3»" }),
    fileName: col.name(),
    fileType: col.enum(fileType),
    sizeKb: col.int(),
    uploadedAt: col.timestamp(),
    uploadedBy: col.ref("employees", "restrict"),
    sheetCount: col.smallint(),
    status: col.enum(processingStatus),
    sourceId: col.ref("sources", "set null", { nullable: true }),
    positionsTotal: col.int({
      nullable: true,
      comment:
        "счётчик, пока позиции ревизии не загружены в систему (R20); null — считать по positions",
    }),
    positionsVerified: col.int({ nullable: true }),
  },
);

/* ---------- Задачи извлечения ---------- */

export const extractionJobStatus = pgEnum(
  "extraction_job_status",
  ["queued", "recognizing", "extracted", "review", "failed"],
  "Задача распознавания ревизии: очередь, распознавание, извлечение позиций, готово к проверке, ошибка",
  {
    queued: ["recognizing", "failed"],
    recognizing: ["extracted", "failed"],
    extracted: ["review", "failed"],
  },
);

export const extractionJobs = table(
  {
    name: "extraction_jobs",
    comment:
      "Задача распознавания и извлечения позиций ревизии. Выполняет обработчик на сервере, интерфейс опрашивает статус (P3-4)",
    primaryKey: ["id"],
    indexes: [
      { columns: ["revisionId", "queuedAt desc"], purpose: "последняя задача ревизии" },
      {
        columns: ["status", "queuedAt"],
        where: "status in ('queued', 'recognizing', 'extracted')",
        purpose: "очередь обработчика",
      },
    ],
    checks: [
      "stage between 0 and 4",
      "(status in ('review', 'failed')) = (finished_at is not null)",
      "(status = 'failed') = (error is not null)",
    ],
  },
  {
    id: col.id(),
    revisionId: col.ref("document_revisions", "cascade"),
    status: col.enum(extractionJobStatus),
    stage: col.smallint({
      comment:
        "пройденная стадия: 0 загружен, 1 распознан текст, 2 найдены таблицы, 3 извлечены позиции, 4 готов к проверке",
    }),
    queuedAt: col.timestamp(),
    startedAt: col.timestamp({ nullable: true }),
    finishedAt: col.timestamp({ nullable: true }),
    error: col.text({ nullable: true, comment: "почему не удалось обработать файл" }),
  },
);

export const documentSheets = table(
  {
    name: "document_sheets",
    comment: "Лист ревизии в дереве структуры документа",
    primaryKey: ["id"],
    indexes: [
      { columns: ["revisionId", "number"], unique: true, purpose: "дерево листов по порядку" },
    ],
    checks: ["number > 0"],
  },
  {
    id: col.id(),
    revisionId: col.ref("document_revisions", "cascade"),
    number: col.smallint(),
    title: col.name(),
    groupName: col.name({ comment: "раздел спецификации: Подконструкция, Облицовка…" }),
  },
);

export const changeStatus = pgEnum(
  "change_status",
  ["open", "resolved"],
  "Разобрано ли изменение документации",
  { open: ["resolved"] },
);

export const revisionChanges = table(
  {
    name: "revision_changes",
    comment:
      "Расхождение в ревизии документа, которое нужно разобрать: с прошлой ревизией или с другим разделом",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      {
        columns: ["documentId", "status"],
        purpose: "открытые изменения в реестре и карточке объекта",
      },
    ],
    checks: [
      "from_revision_id is null or from_revision_id <> to_revision_id",
      "(status = 'resolved') = (resolved_at is not null)",
    ],
  },
  {
    id: col.id(),
    documentId: col.ref("documents", "cascade"),
    fromRevisionId: col.ref("document_revisions", "restrict", {
      nullable: true,
      comment: "null — расхождение с другим разделом, а не с прошлой ревизией",
    }),
    toRevisionId: col.ref("document_revisions", "restrict"),
    description: col.name(),
    status: col.enum(changeStatus),
    resolvedBy: col.ref("employees", "restrict", { nullable: true }),
    resolvedAt: col.timestamp({ nullable: true }),
  },
);

/* ---------- Представления ---------- */

/** Ревизия с атрибутами документа — то, что экраны называют документом. */
export const projectDocument = z.object({
  id: idSchema,
  documentId: idSchema,
  revision: z.number().int().positive(),
  projectId: idSchema,
  title: z.string().min(1),
  section: z.string().min(1),
  version: z.string().min(1),
  fileName: z.string().min(1),
  fileType: fileType.schema,
  sizeKb: z.number().int(),
  uploadedAt: documentRevisions.shape.uploadedAt,
  uploadedBy: idSchema,
  sheetCount: z.number().int(),
  status: processingStatus.schema,
  sourceId: idSchema.nullable(),
  positionsTotal: z.number().int().nullable(),
  positionsVerified: z.number().int().nullable(),
});

export const documentSheet = z.object({
  id: idSchema,
  /** Ревизия, к которой относится лист */
  documentId: idSchema,
  number: z.number().int(),
  title: z.string().min(1),
  group: z.string().min(1),
});

export type DocumentRow = z.infer<typeof documents>;
export type DocumentRevisionRow = z.infer<typeof documentRevisions>;
export type DocumentSheetRow = z.infer<typeof documentSheets>;
export type ExtractionJob = z.infer<typeof extractionJobs>;
export type ExtractionJobStatus = z.infer<typeof extractionJobStatus.schema>;
export type RevisionChange = z.infer<typeof revisionChanges>;
export type ProjectDocument = z.infer<typeof projectDocument>;
export type DocumentSheet = z.infer<typeof documentSheet>;
export type DocProcessingStatus = z.infer<typeof processingStatus.schema>;

/* ---------- Словари ---------- */

export const processingStatusLabel: Record<DocProcessingStatus, string> = {
  uploaded: "Загружен",
  recognizing: "Распознаётся",
  extracted: "Извлечено",
  review: "На проверке",
  verified: "Проверено",
};

/** Стадии обработки загруженного файла в порядке прохождения — для индикатора загрузки. */
export const processingStages = [
  "Загружен",
  "Распознан текст",
  "Найдены таблицы",
  "Извлечены позиции",
  "Готов к проверке",
] as const;
