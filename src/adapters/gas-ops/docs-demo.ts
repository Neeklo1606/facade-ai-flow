/**
 * Демо-адаптер исполнительной документации (ADR-058) поверх общего состояния вкладки.
 * Права, комплектность и переходы проверяются здесь, как их будет проверять сервер.
 */
import {
  completenessOf,
  docTitle,
  editableKey,
  canEditDoc,
  FILE_KIND_LABEL,
  journalDrafts,
  moveCheck,
  movedDoc,
  nextDocNumber,
  registryCheck,
  registryRowOf,
  type DocFile,
  type DocsContext,
  type DocsState,
  type ExecDoc,
  type JournalEntry,
  type RegistryVersion,
} from "@/domain/gas-ops/exec-docs";
import type { AuditLog, Role, User } from "@/domain/gas-ops/model";
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import { DocsError, type GasDocsPort } from "@/ports/gas-docs";
import { demoStore, type GasStore } from "./store";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowOf(snapshot: GasOpsSnapshot): string {
  const device = new Date();
  const time = `${String(device.getHours()).padStart(2, "0")}:${String(device.getMinutes()).padStart(2, "0")}`;
  return `${snapshot.today}T${time}:00`;
}

function must(snapshot: GasOpsSnapshot, roles: readonly Role[], message: string): User {
  const user = snapshot.users.find((u) => u.id === snapshot.actorId);
  if (!user) throw new DocsError("not-allowed", "Войдите под своей ролью.");
  if (!roles.includes(user.role)) throw new DocsError("not-allowed", message);
  return user;
}

function mustObject(snapshot: GasOpsSnapshot, user: User, objectId: string): void {
  if (!snapshot.objects.some((o) => o.id === objectId)) {
    throw new DocsError("no-object", "Объект не выбран или больше не доступен.");
  }
  if (user.allowedObjectIds !== "all" && !user.allowedObjectIds.includes(objectId)) {
    throw new DocsError("not-allowed", "Этот объект не закреплён за вами.");
  }
}

function mustDoc(snapshot: GasOpsSnapshot, id: string): ExecDoc {
  const doc = snapshot.docs.docs.find((d) => d.id === id);
  if (!doc) throw new DocsError("not-found", "Документ не найден. Обновите экран.");
  return doc;
}

function ctxOf(snapshot: GasOpsSnapshot): DocsContext {
  return { docs: snapshot.docs, supply: snapshot.supply, objects: snapshot.objects };
}

function audit(
  snapshot: GasOpsSnapshot,
  user: User,
  action: string,
  entityId: string,
  detail: string,
): AuditLog {
  return { id: newId("aud"), at: nowOf(snapshot), actor: user.name, action, entityId, detail };
}

async function commit(
  store: GasStore,
  base: GasOpsSnapshot,
  change: (docs: DocsState) => DocsState,
  log: AuditLog,
): Promise<void> {
  await store.update((s) => ({ ...s, docs: change(s.docs), audit: [log, ...s.audit] }), base);
}

function replaceDoc(docs: DocsState, doc: ExecDoc): DocsState {
  return { ...docs, docs: docs.docs.map((d) => (d.id === doc.id ? doc : d)) };
}

/** Документы ведёт ПТО; файлы оснований добавляют и прораб, и снабжение */
const EDITORS: readonly Role[] = ["pto", "admin"];
const UPLOADERS: readonly Role[] = ["pto", "admin", "prorab", "supply"];

export function createGasDocsDemo(store: GasStore = demoStore): GasDocsPort {
  return {
    async createDocs(input) {
      const snapshot = await store.read();
      const user = must(snapshot, EDITORS, "Пакет актов формирует ПТО.");
      mustObject(snapshot, user, input.objectId);
      if (input.workIds.length === 0)
        throw new DocsError("bad-input", "Отметьте хотя бы одну работу.");
      const at = nowOf(snapshot);
      const created: ExecDoc[] = [];
      let all = [...snapshot.docs.docs];
      for (const workId of input.workIds) {
        const work = snapshot.docs.works.find(
          (w) => w.id === workId && w.objectId === input.objectId,
        );
        if (!work) throw new DocsError("not-found", "Работа не найдена на этом объекте.");
        if (all.some((d) => d.workId === workId)) continue;
        const kind = snapshot.docs.kinds.find((k) => k.id === work.kindId);
        const type = kind?.act ?? "aosr";
        const doc: ExecDoc = {
          id: newId("ed"),
          objectId: input.objectId,
          type,
          number: nextDocNumber(all, input.objectId, type),
          workId,
          version: 1,
          status: "draft",
          overrides: {},
          remarks: [],
          history: [{ at, actor: user.name, status: "draft", note: `По записи ${work.number}` }],
          scan: null,
          signedAt: null,
          createdAt: at,
        };
        all = [...all, doc];
        created.push(doc);
      }
      if (created.length) {
        await commit(
          store,
          snapshot,
          (docs) => ({ ...docs, docs: all }),
          audit(
            snapshot,
            user,
            "Сформировал пакет",
            input.objectId,
            created.map(docTitle).join(", "),
          ),
        );
      }
      return created;
    },

    async editField(input) {
      const snapshot = await store.read();
      const user = must(snapshot, EDITORS, "Акт правит ПТО.");
      const doc = mustDoc(snapshot, input.docId);
      mustObject(snapshot, user, doc.objectId);
      if (!canEditDoc(doc.status)) {
        throw new DocsError("locked", "Акт на подписи: верните его с замечанием, чтобы исправить.");
      }
      if (!editableKey(input.key))
        throw new DocsError("bad-input", "Это поле берётся из справочника объектов.");
      const next: ExecDoc = {
        ...doc,
        overrides: {
          ...doc.overrides,
          [input.key]: { value: input.value.trim(), by: user.name, at: nowOf(snapshot) },
        },
      };
      await commit(
        store,
        snapshot,
        (docs) => replaceDoc(docs, next),
        audit(snapshot, user, "Исправил поле акта", doc.id, `${docTitle(doc)}: ${input.key}`),
      );
      return next;
    },

    async moveDoc(input) {
      const snapshot = await store.read();
      const user = must(snapshot, EDITORS, "Статус акта меняет ПТО.");
      const doc = mustDoc(snapshot, input.docId);
      mustObject(snapshot, user, doc.objectId);
      const ctx = ctxOf(snapshot);
      const work = snapshot.docs.works.find((w) => w.id === doc.workId);
      if (!work) throw new DocsError("not-found", "Запись работы для акта не найдена.");
      const check = moveCheck(doc, input.to, completenessOf(ctx, work), input);
      if (!check.ok) throw new DocsError(check.code, check.message);
      const next = movedDoc(doc, input.to, nowOf(snapshot), user.name, input);
      await commit(
        store,
        snapshot,
        (docs) => ({
          ...replaceDoc(docs, next),
          files:
            input.to === "signed"
              ? [
                  ...docs.files,
                  {
                    id: newId("df"),
                    objectId: doc.objectId,
                    kind: "scan",
                    fileName: next.scan!,
                    workId: doc.workId,
                    itemId: null,
                    participantId: null,
                    docId: doc.id,
                    by: user.name,
                    at: nowOf(snapshot),
                  },
                ]
              : docs.files,
        }),
        audit(snapshot, user, "Сменил статус акта", doc.id, `${docTitle(doc)}: ${input.to}`),
      );
      return next;
    },

    async addFile(input) {
      const snapshot = await store.read();
      const user = must(snapshot, UPLOADERS, "Файлы основания добавляют ПТО, прораб и снабжение.");
      mustObject(snapshot, user, input.objectId);
      const name = input.fileName.trim();
      if (!name) throw new DocsError("bad-input", "Выберите файл.");
      if (
        (input.kind === "scheme" || input.kind === "tests") &&
        !snapshot.docs.works.some((w) => w.id === input.workId && w.objectId === input.objectId)
      ) {
        throw new DocsError("not-found", "Работа для файла не найдена на этом объекте.");
      }
      if (input.kind === "authority") {
        if (user.role === "prorab" || user.role === "supply") {
          throw new DocsError("not-allowed", "Документ о представительстве добавляет ПТО.");
        }
        if (
          !snapshot.docs.participants.some(
            (p) => p.id === input.participantId && p.objectId === input.objectId,
          )
        ) {
          throw new DocsError("not-found", "Участник не найден на этом объекте.");
        }
      }
      if (
        input.kind === "certificate" &&
        !snapshot.supply.items.some((i) => i.id === input.itemId)
      ) {
        throw new DocsError("not-found", "Позиция номенклатуры не найдена.");
      }
      const file: DocFile = {
        id: newId("df"),
        objectId: input.objectId,
        kind: input.kind,
        fileName: name,
        workId: input.workId ?? null,
        itemId: input.itemId ?? null,
        participantId: input.participantId ?? null,
        docId: null,
        by: user.name,
        at: nowOf(snapshot),
      };
      await commit(
        store,
        snapshot,
        (docs) => ({ ...docs, files: [...docs.files, file] }),
        audit(
          snapshot,
          user,
          "Добавил файл основания",
          input.objectId,
          `${FILE_KIND_LABEL[input.kind]}: ${name}`,
        ),
      );
      return file;
    },

    async confirmVolume(input) {
      const snapshot = await store.read();
      const user = must(snapshot, ["prorab", "admin"], "Объём подтверждает прораб объекта.");
      const work = snapshot.docs.works.find((w) => w.id === input.workId);
      if (!work) throw new DocsError("not-found", "Запись объёма не найдена.");
      mustObject(snapshot, user, work.objectId);
      if (work.volumeConfirmedBy) return work;
      const next = { ...work, volumeConfirmedBy: user.name, volumeConfirmedAt: nowOf(snapshot) };
      await commit(
        store,
        snapshot,
        (docs) => ({ ...docs, works: docs.works.map((w) => (w.id === work.id ? next : w)) }),
        audit(snapshot, user, "Подтвердил объём", work.id, work.number),
      );
      return next;
    },

    async closeRegistry(input) {
      const snapshot = await store.read();
      const user = must(snapshot, EDITORS, "Реестр закрывает ПТО.");
      mustObject(snapshot, user, input.objectId);
      const check = registryCheck(snapshot.docs, input.objectId);
      if (!check.ok) throw new DocsError(check.code, check.message);
      const ctx = ctxOf(snapshot);
      const at = nowOf(snapshot);
      const registry: RegistryVersion = {
        id: newId("rg"),
        objectId: input.objectId,
        version: check.version,
        closedAt: at,
        closedBy: user.name,
        rows: check.docs.map((d) => registryRowOf(ctx, d)),
      };
      const included = new Set(check.docs.map((d) => d.id));
      await commit(
        store,
        snapshot,
        (docs) => ({
          ...docs,
          registries: [...docs.registries, registry],
          docs: docs.docs.map((d) =>
            included.has(d.id) && d.status === "signed"
              ? {
                  ...d,
                  status: "registry",
                  history: [
                    ...d.history,
                    { at, actor: user.name, status: "registry", note: `Реестр v${check.version}` },
                  ],
                }
              : d,
          ),
        }),
        audit(snapshot, user, "Закрыл реестр ИД", input.objectId, `v${check.version}`),
      );
      return registry;
    },

    async acceptJournal(input) {
      const snapshot = await store.read();
      const user = must(snapshot, EDITORS, "Запись журнала принимает ПТО.");
      mustObject(snapshot, user, input.objectId);
      const same = snapshot.docs.journal.find((j) => j.workId === input.workId);
      if (same) return same;
      const draft = journalDrafts(ctxOf(snapshot), input.objectId).find(
        (d) => d.workId === input.workId,
      );
      if (!draft)
        throw new DocsError(
          "not-found",
          "Черновика записи по этой работе нет: объём не подтверждён.",
        );
      if (!input.text.trim()) throw new DocsError("bad-input", "Текст записи пуст.");
      const entry: JournalEntry = {
        id: newId("jr"),
        objectId: input.objectId,
        workId: input.workId,
        dates: draft.dates,
        conditions: input.conditions.trim(),
        text: input.text.trim(),
        representative: draft.representative,
        acceptedBy: user.name,
        acceptedAt: nowOf(snapshot),
      };
      await commit(
        store,
        snapshot,
        (docs) => ({ ...docs, journal: [...docs.journal, entry] }),
        audit(snapshot, user, "Принял запись журнала", input.objectId, draft.dates),
      );
      return entry;
    },
  };
}

export const gasDocs = createGasDocsDemo();
