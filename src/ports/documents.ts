import { z } from "zod";
import {
  changeStatus,
  documentSheet,
  fileType,
  projectDocument,
  revisionChanges,
  timestampSchema,
  type DocumentSheet,
  type ProjectDocument,
  type RevisionChange,
} from "@/contracts";
import type { Actor } from "./common";

/** Ревизия в списке: с числом позиций и стадией обработки, если она идёт */
export const documentListItem = z.object({
  document: projectDocument,
  extracted: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  /** false — позиции ревизии не загружены, числа взяты из счётчика ревизии (R20) */
  loaded: z.boolean(),
  /** Пройденная стадия обработки 0…4, пока файл обрабатывается; иначе null */
  stage: z.number().int().min(0).max(4).nullable(),
});

export const documentCard = z.object({
  document: projectDocument,
  sheets: z.array(documentSheet),
  /** Когда проверенные позиции ревизии последний раз передавали в закупку */
  handedOverAt: timestampSchema.nullable(),
  stage: z.number().int().min(0).max(4).nullable(),
});

export const listDocumentsInput = z.object({
  /** Без объекта — действующие ревизии всех объектов (поиск) */
  projectId: z.string().min(1).optional(),
});

export const uploadRevisionInput = z.object({
  projectId: z.string().min(1),
  /** Новая ревизия существующего документа; null — новый документ */
  documentId: z.string().min(1).nullable().default(null),
  fileName: z.string().min(1),
  /** До 500 МБ: от размера зависит число листов, которое адаптер создаёт */
  sizeKb: z.number().int().positive().max(512_000),
  /** Ключ файла в хранилище объектов; в демо файла нет */
  storageKey: z.string().min(1).nullable().default(null),
});

export const listChangesInput = z.object({
  projectId: z.string().min(1),
  status: changeStatus.schema.optional(),
});

export const revisionChangeView = revisionChanges;
export const fileTypeSchema = fileType.schema;

export type DocumentListItem = z.infer<typeof documentListItem>;
export type ListDocumentsInput = z.infer<typeof listDocumentsInput>;
export type UploadRevisionInput = z.input<typeof uploadRevisionInput>;
export type ListChangesInput = z.infer<typeof listChangesInput>;
export interface DocumentCard {
  document: ProjectDocument;
  sheets: DocumentSheet[];
  handedOverAt: string | null;
  stage: number | null;
}

/** Документы, ревизии, листы и изменения между ревизиями. */
export interface DocumentsPort {
  /** Действующие ревизии документов, последние загруженные сверху */
  list(input: ListDocumentsInput): Promise<DocumentListItem[]>;
  /** Все ревизии одного документа, новые сверху */
  revisions(documentId: string): Promise<DocumentListItem[]>;
  card(revisionId: string): Promise<DocumentCard | null>;
  /** Создаёт ревизию в статусе `uploaded` и ставит задачу распознавания (P3-4) */
  upload(input: UploadRevisionInput, actor: Actor): Promise<ProjectDocument>;
  changes(input: ListChangesInput): Promise<RevisionChange[]>;
}
