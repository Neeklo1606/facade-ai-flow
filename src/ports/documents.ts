import { z } from "zod";
import {
  changeStatus,
  documentSheet,
  fileType,
  projectDocument,
  revisionChanges,
  type DocumentSheet,
  type ProjectDocument,
  type RevisionChange,
} from "@/contracts";
import type { Actor } from "./common";

export const documentCard = z.object({ document: projectDocument, sheets: z.array(documentSheet) });

export const uploadRevisionInput = z.object({
  projectId: z.string().min(1),
  /** Новая ревизия существующего документа; null — новый документ */
  documentId: z.string().min(1).nullable(),
  fileName: z.string().min(1),
  fileType: fileType.schema,
  sizeKb: z.number().int().positive(),
  /** Ключ загруженного файла в хранилище объектов */
  storageKey: z.string().min(1),
});

export const listChangesInput = z.object({
  projectId: z.string().min(1),
  status: changeStatus.schema.optional(),
});

export const revisionChangeView = revisionChanges;

export type UploadRevisionInput = z.infer<typeof uploadRevisionInput>;
export type ListChangesInput = z.infer<typeof listChangesInput>;
export interface DocumentCard {
  document: ProjectDocument;
  sheets: DocumentSheet[];
}

/** Документы, ревизии, листы и изменения между ревизиями. */
export interface DocumentsPort {
  /** Ревизии документов объекта, последние загруженные сверху */
  list(projectId: string): Promise<ProjectDocument[]>;
  card(revisionId: string): Promise<DocumentCard | null>;
  /** Создаёт ревизию в статусе `uploaded` и ставит задачу распознавания (P3-4) */
  upload(input: UploadRevisionInput, actor: Actor): Promise<ProjectDocument>;
  changes(input: ListChangesInput): Promise<RevisionChange[]>;
  resolveChange(changeId: string, actor: Actor): Promise<RevisionChange>;
}
