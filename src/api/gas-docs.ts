/**
 * Слой данных исполнительной документации (ADR-058). Экраны берут отсюда готовые строки,
 * подписи и действия: комплектность, поля акта и реестр считаются в domain, порт — ниже.
 */
import { useCallback, useMemo } from "react";
import {
  ACT_SHORT,
  DOC_STATUS_LABEL,
  DOC_TYPE_LABEL,
  FILE_KIND_LABEL,
  FORM_CHECK_NOTE,
  JOURNAL_CHECK_NOTE,
  REGISTRY_HEADERS,
  SIDE_LABEL,
  actPrint,
  actSections,
  canEditDoc,
  docsMetrics,
  docView,
  editableKey,
  isDraftMark,
  journalDrafts,
  participantsOf,
  proposePackage,
  readinessByObject,
  registryFileName,
  registryRowOf,
  registrySheetRows,
  registryVersions,
  ruDate,
  siteNeeds,
  workDates,
  zonesOf,
  type ActSection,
  type DocStatus,
  type DocView,
  type DocsContext,
  type DocsMetrics,
  type Issue,
  type JournalDraft,
  type JournalEntry,
  type ObjectReadiness,
  type PackageFilter,
  type Participant,
  type Proposal,
  type RegistryRow,
  type RegistryVersion,
} from "@/domain/gas-ops/exec-docs";
import type { WorkObject } from "@/domain/gas-ops/model";
import { actorOf } from "@/domain/gas-ops/view";
import { saveFile } from "@/lib/download";
import { fileNameFromDisposition } from "@/lib/gas-ops/export";
import { useGasDocsPort, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";
import type { AddFileInput, GasDocsPort } from "@/ports/gas-docs";
import type { ActionResult } from "./gas-ops";

export {
  ACT_SHORT,
  DOC_STATUS_LABEL,
  DOC_TYPE_LABEL,
  FILE_KIND_LABEL,
  FORM_CHECK_NOTE,
  JOURNAL_CHECK_NOTE,
  SIDE_LABEL,
  ruDate,
  workDates,
};
export type {
  ActSection,
  DocStatus,
  DocView,
  DocsMetrics,
  Issue,
  JournalDraft,
  JournalEntry,
  ObjectReadiness,
  Participant,
  Proposal,
  RegistryRow,
  RegistryVersion,
};

function visibleObjects(snapshot: ReturnType<typeof useGasSnapshot>): WorkObject[] {
  const user = actorOf(snapshot);
  if (!user || user.allowedObjectIds === "all") return snapshot.objects;
  const ids = new Set(user.allowedObjectIds);
  return snapshot.objects.filter((o) => ids.has(o.id));
}

export interface DocsBase {
  today: string;
  ctx: DocsContext;
  /** Объекты, по которым есть записи работ: остальным документам взяться неоткуда */
  objects: WorkObject[];
  objectLabel: (id: string) => string;
}

export function useDocsBase(): DocsBase {
  const snapshot = useGasSnapshot();
  return useMemo(() => {
    const withWorks = new Set(snapshot.docs.works.map((w) => w.objectId));
    return {
      today: snapshot.today,
      ctx: { docs: snapshot.docs, supply: snapshot.supply, objects: snapshot.objects },
      objects: visibleObjects(snapshot).filter((o) => withWorks.has(o.id)),
      objectLabel: (id) => {
        const o = snapshot.objects.find((x) => x.id === id);
        return o ? `${o.code} · ${o.label}` : "Объект не найден";
      },
    };
  }, [snapshot]);
}

export function useDocList(objectId: string | null): { views: DocView[]; metrics: DocsMetrics } {
  const base = useDocsBase();
  return useMemo(() => {
    const ids = new Set(base.objects.map((o) => o.id));
    const views = base.ctx.docs.docs
      .filter((d) => ids.has(d.objectId) && (!objectId || d.objectId === objectId))
      .map((d) => docView(base.ctx, d))
      .sort(
        (a, b) =>
          a.doc.objectId.localeCompare(b.doc.objectId) ||
          a.doc.type.localeCompare(b.doc.type) ||
          a.doc.number - b.doc.number,
      );
    return { views, metrics: docsMetrics(views, base.today) };
  }, [base, objectId]);
}

export function usePackage(filter: PackageFilter | null): {
  proposals: Proposal[];
  zones: string[];
} {
  const base = useDocsBase();
  return useMemo(
    () =>
      filter
        ? {
            proposals: proposePackage(base.ctx, filter),
            zones: zonesOf(base.ctx.docs, filter.objectId),
          }
        : { proposals: [], zones: [] },
    [base, filter],
  );
}

export interface DocDetail {
  view: DocView;
  sections: ActSection[];
  participants: Participant[];
  editable: boolean;
  draftMark: boolean;
  canEditKey: (key: string) => boolean;
}

export function useDocDetail(docId: string): DocDetail | null {
  const base = useDocsBase();
  return useMemo(() => {
    const doc = base.ctx.docs.docs.find((d) => d.id === docId);
    if (!doc || !base.objects.some((o) => o.id === doc.objectId)) return null;
    return {
      view: docView(base.ctx, doc),
      sections: actSections(base.ctx, doc),
      participants: participantsOf(base.ctx, doc.objectId),
      editable: canEditDoc(doc.status),
      draftMark: isDraftMark(doc.status),
      canEditKey: editableKey,
    };
  }, [base, docId]);
}

export interface RegistryData {
  /** Подписанные документы объекта: строки следующей версии */
  current: RegistryRow[];
  pendingNew: number;
  versions: RegistryVersion[];
  statusOf: (docId: string) => string;
}

export function useRegistry(objectId: string | null): RegistryData {
  const base = useDocsBase();
  return useMemo(() => {
    if (!objectId) return { current: [], pendingNew: 0, versions: [], statusOf: () => "" };
    const docs = base.ctx.docs.docs.filter(
      (d) => d.objectId === objectId && (d.status === "signed" || d.status === "registry"),
    );
    return {
      current: docs.map((d) => registryRowOf(base.ctx, d)),
      pendingNew: docs.filter((d) => d.status === "signed").length,
      versions: registryVersions(base.ctx.docs, objectId),
      statusOf: (id) => {
        const d = base.ctx.docs.docs.find((x) => x.id === id);
        return d ? DOC_STATUS_LABEL[d.status] : "";
      },
    };
  }, [base, objectId]);
}

export function useJournal(objectId: string | null): {
  drafts: JournalDraft[];
  accepted: JournalEntry[];
} {
  const base = useDocsBase();
  return useMemo(
    () =>
      objectId
        ? {
            drafts: journalDrafts(base.ctx, objectId),
            accepted: base.ctx.docs.journal.filter((j) => j.objectId === objectId),
          }
        : { drafts: [], accepted: [] },
    [base, objectId],
  );
}

export function useReadiness(): ObjectReadiness[] {
  const base = useDocsBase();
  return useMemo(() => readinessByObject(base.ctx, new Set(base.objects.map((o) => o.id))), [base]);
}

export function useSiteNeeds() {
  const base = useDocsBase();
  return useMemo(() => siteNeeds(base.ctx, new Set(base.objects.map((o) => o.id))), [base]);
}

export interface DocsActor {
  canEdit: boolean;
  canUpload: boolean;
  /** Документ о представительстве добавляет только ПТО */
  canAddAuthority: boolean;
}

export function useDocsActor(): DocsActor {
  const snapshot = useGasSnapshot();
  const role = actorOf(snapshot)?.role ?? "manager";
  const editor = role === "pto" || role === "admin";
  return {
    canEdit: editor,
    canUpload: editor || role === "prorab" || role === "supply",
    canAddAuthority: editor,
  };
}

function useRun(): <T>(run: (port: GasDocsPort) => Promise<T>) => Promise<ActionResult<T>> {
  const port = useGasDocsPort();
  return useCallback(
    async (run) => {
      try {
        return { ok: true, value: await run(port) };
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
        const message =
          error instanceof Error ? error.message : "Действие не выполнено. Повторите.";
        return { ok: false, code, message };
      }
    },
    [port],
  );
}

export function useDocsActions() {
  const run = useRun();
  return useMemo(
    () => ({
      createDocs: (input: { objectId: string; workIds: string[] }) =>
        run((p) => p.createDocs(input)),
      editField: (input: { docId: string; key: string; value: string }) =>
        run((p) => p.editField(input)),
      moveDoc: (input: {
        docId: string;
        to: Exclude<DocStatus, "registry">;
        reason?: string | null;
        scan?: string | null;
      }) => run((p) => p.moveDoc(input)),
      addFile: (input: AddFileInput) => run((p) => p.addFile(input)),
      confirmVolume: (input: { workId: string }) => run((p) => p.confirmVolume(input)),
      closeRegistry: (input: { objectId: string }) => run((p) => p.closeRegistry(input)),
      acceptJournal: (input: {
        objectId: string;
        workId: string;
        text: string;
        conditions: string;
      }) => run((p) => p.acceptJournal(input)),
    }),
    [run],
  );
}

async function post(body: unknown, fallback: string): Promise<string> {
  const response = await fetch("/api/gas/exec-docs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Сервер ответил ${response.status}`);
  const name = fileNameFromDisposition(response.headers.get("content-disposition")) ?? fallback;
  saveFile(await response.blob(), name);
  return name;
}

/** Файлы собираются на сервере, как отчёт недели и запрос цены */
export function useExecDownloads() {
  const base = useDocsBase();
  return useMemo(() => {
    const registryPayload = (objectId: string, version: RegistryVersion | null) => {
      const object = base.ctx.objects.find((o) => o.id === objectId);
      const rows =
        version?.rows ??
        base.ctx.docs.docs
          .filter(
            (d) => d.objectId === objectId && (d.status === "signed" || d.status === "registry"),
          )
          .map((d) => registryRowOf(base.ctx, d));
      const names = registryFileName(object?.code ?? "объект", version?.version ?? null);
      return {
        objectLabel: base.objectLabel(objectId),
        version: version?.version ?? null,
        headers: [...REGISTRY_HEADERS],
        rows: registrySheetRows(base.ctx, rows, (id) => {
          const d = base.ctx.docs.docs.find((x) => x.id === id);
          return d ? DOC_STATUS_LABEL[d.status] : "";
        }),
        fileName: names.name,
        fileNameAscii: names.ascii,
      };
    };
    return {
      act: (docId: string) => {
        const doc = base.ctx.docs.docs.find((d) => d.id === docId)!;
        const act = actPrint(base.ctx, doc);
        return post({ kind: "act", act }, act.fileName);
      },
      registry: (objectId: string, version: RegistryVersion | null) => {
        const registry = registryPayload(objectId, version);
        return post({ kind: "registry", registry }, registry.fileName);
      },
      package: (objectId: string) => {
        const object = base.ctx.objects.find((o) => o.id === objectId);
        const code = object?.code ?? "объект";
        const acts = base.ctx.docs.docs
          .filter((d) => d.objectId === objectId)
          .map((d) => actPrint(base.ctx, d));
        const fileName = `Пакет_ИД_${code}.zip`;
        return post(
          {
            kind: "package",
            acts,
            registry: registryPayload(
              objectId,
              registryVersions(base.ctx.docs, objectId)[0] ?? null,
            ),
            fileName,
            fileNameAscii: "ID_package.zip",
          },
          fileName,
        );
      },
    };
  }, [base]);
}
