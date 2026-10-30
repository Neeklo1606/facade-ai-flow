/**
 * Порт исполнительной документации (ADR-058): тот же вид, каким станет HTTP-API. Состояние
 * общее с учётом времени и снабжением: объекты, роли и сброс показа одни на все модули.
 */
import type {
  DocFile,
  DocStatus,
  ExecDoc,
  FileKind,
  JournalEntry,
  RegistryVersion,
  WorkRecord,
} from "@/domain/gas-ops/exec-docs";

export interface AddFileInput {
  objectId: string;
  kind: Exclude<FileKind, "scan">;
  fileName: string;
  workId?: string | null;
  itemId?: string | null;
  participantId?: string | null;
}

export class DocsError extends Error {
  constructor(
    readonly code:
      | "not-allowed"
      | "not-found"
      | "no-object"
      | "bad-move"
      | "incomplete"
      | "reason-required"
      | "scan-required"
      | "locked"
      | "nothing-new"
      | "bad-input",
    message: string,
  ) {
    super(message);
    this.name = "DocsError";
  }
}

export interface GasDocsPort {
  /** Черновики актов по выбранным работам пакета; по работе с актом второй не создаётся */
  createDocs(input: { objectId: string; workIds: string[] }): Promise<ExecDoc[]>;
  /** Исправить поле акта: значение человека становится источником */
  editField(input: { docId: string; key: string; value: string }): Promise<ExecDoc>;
  moveDoc(input: {
    docId: string;
    to: Exclude<DocStatus, "registry">;
    reason?: string | null;
    scan?: string | null;
  }): Promise<ExecDoc>;
  addFile(input: AddFileInput): Promise<DocFile>;
  /** Прораб подтверждает объём своей записи */
  confirmVolume(input: { workId: string }): Promise<WorkRecord>;
  closeRegistry(input: { objectId: string }): Promise<RegistryVersion>;
  /** ПТО принимает черновик записи журнала, при необходимости исправив текст */
  acceptJournal(input: {
    objectId: string;
    workId: string;
    text: string;
    conditions: string;
  }): Promise<JournalEntry>;
}
