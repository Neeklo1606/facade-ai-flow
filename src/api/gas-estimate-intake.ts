/**
 * Папка смет на сервисе (ADR-077): слой данных экрана «Сметы». Экран берёт отсюда строки
 * файлов, карточку сметы и действия; правила — в домене, состояние — за портом.
 *
 * Рабочий контур: файлы уходят на сервер формой (`/api/gas/estimate-files`), там хранятся,
 * разбираются и записываются портом от имени сессии. Демо: файл разбирается во вкладке, хеш
 * считает браузер, байты живут в памяти страницы до перезагрузки (помечено на экране).
 */
import { useCallback, useMemo, useState } from "react";
import { dataSource } from "@/api/config";
import { useGasOps, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";
import {
  MAX_ESTIMATE_FILE_BYTES,
  changedSections,
  convergence,
  excelKind,
  matchObject,
  objectDraft,
  outcomeText,
  sectionView,
  type EstimateFile,
  type IntakeOutcome,
  type ObjectDraft,
  type ObjectMatch,
  type PressureMode,
  type SectionView,
} from "@/domain/gas-ops/estimate-intake";
import type { EstimateVersion } from "@/domain/gas-ops/work-cost";
import type { WorkObject } from "@/domain/gas-ops/model";
import { GasOpsError } from "@/ports/gas-ops";

import type { Cell } from "@/domain/gas-ops/estimate-labels";
export type { Cell, EstimateHeader, HeaderField } from "@/domain/gas-ops/estimate-labels";
export type {
  PressureMode,
  SectionView,
  ObjectDraft,
  ObjectMatch,
} from "@/domain/gas-ops/estimate-intake";

export interface UploadRow {
  name: string;
  ok: boolean;
  text: string;
  outcome: IntakeOutcome | null;
}

export interface FileRow {
  file: EstimateFile;
  version: EstimateVersion | null;
  object: WorkObject | null;
  /** Строка статуса: «Распознана», «Нужна проверка: …», «Не распознана: …» */
  status: string;
}

export interface EstimateCard {
  file: EstimateFile | null;
  version: EstimateVersion;
  object: WorkObject | null;
  match: ObjectMatch;
  matched: WorkObject | null;
  draft: ObjectDraft;
  sections: SectionView[];
  convergence: ReturnType<typeof convergence>;
  /** Разделы, изменившиеся против прошлой версии объекта */
  changed: string[] | null;
  previousVersion: number | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

const failed = (error: unknown): { ok: false; message: string } => ({
  ok: false,
  message:
    error instanceof GasOpsError || error instanceof Error
      ? error.message
      : "Не получилось. Проверьте связь и повторите.",
});

/** Байты загруженных в демо файлов: для «Разобрать заново» до перезагрузки страницы */
const demoBytes = new Map<string, File>();

async function sha256Of(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseInTab(file: File) {
  const [{ readEstimateFile, EstimateFileError }, { parseEstimateWorkbook }] = await Promise.all([
    import("@/adapters/gas-ops/estimate-file"),
    import("@/domain/gas-ops/estimate-parse"),
  ]);
  try {
    return { ok: true as const, parsed: parseEstimateWorkbook(await readEstimateFile(file)) };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof EstimateFileError ? error.message : "Файл не читается как Excel",
    };
  }
}

async function postFiles(form: FormData, query = ""): Promise<UploadRow[]> {
  const res = await fetch(`/api/gas/estimate-files${query}`, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { results?: UploadRow[]; reason?: string };
  if (!res.ok || !body.results) throw new Error(body.reason ?? "Сервер не принял файлы");
  return body.results;
}

export function useEstimateIntake() {
  const ops = useGasOps();
  const snapshot = useGasSnapshot();
  const [busy, setBusy] = useState(false);

  const files = useMemo<FileRow[]>(() => {
    return (snapshot.estimateFiles ?? []).map((file) => {
      const version = file.versionId
        ? (snapshot.estimateVersions.find((v) => v.id === file.versionId) ?? null)
        : null;
      const object = version?.objectId
        ? (snapshot.objects.find((o) => o.id === version.objectId) ?? null)
        : null;
      const head =
        file.status === "parsed"
          ? "Распознана"
          : file.status === "needs-review"
            ? "Нужна проверка"
            : "Не распознана";
      return {
        file,
        version,
        object,
        status: `${head}${file.reason ? `: ${file.reason}` : ""}${version ? ` · версия ${version.version}` : ""}`,
      };
    });
  }, [snapshot.estimateFiles, snapshot.estimateVersions, snapshot.objects]);

  const upload = useCallback(
    async (list: File[]): Promise<UploadRow[]> => {
      setBusy(true);
      try {
        if (dataSource === "server") {
          const form = new FormData();
          for (const f of list) form.append("files", f, f.name);
          const rows = await postFiles(form);
          await ops.snapshot();
          return rows;
        }
        const rows: UploadRow[] = [];
        for (const file of list) {
          if (file.size > MAX_ESTIMATE_FILE_BYTES) {
            rows.push({
              name: file.name,
              ok: false,
              text: "Не распознана: файл больше 20 МБ",
              outcome: null,
            });
            continue;
          }
          const buffer = await file.arrayBuffer();
          if (!excelKind(new Uint8Array(buffer.slice(0, 4)))) {
            rows.push({
              name: file.name,
              ok: false,
              text: "Не распознана: нужен файл Excel .xlsx или .xls",
              outcome: null,
            });
            continue;
          }
          const sha256 = await sha256Of(buffer);
          const known = (snapshot.estimateFiles ?? []).some((f) => f.sha256 === sha256);
          const parsed = known ? null : await parseInTab(file);
          try {
            const outcome = await ops.intakeEstimateFile({
              sha256,
              name: file.name,
              size: file.size,
              storagePath: null,
              parsed: parsed?.ok ? parsed.parsed : null,
              error: parsed && !parsed.ok ? parsed.message : null,
            });
            demoBytes.set(outcome.fileId, file);
            rows.push({ name: file.name, ok: true, text: outcomeText(outcome), outcome });
          } catch (error) {
            rows.push({ name: file.name, ok: false, text: failed(error).message, outcome: null });
          }
        }
        return rows;
      } catch (error) {
        return list.map((f) => ({
          name: f.name,
          ok: false,
          text: failed(error).message,
          outcome: null,
        }));
      } finally {
        setBusy(false);
      }
    },
    [ops, snapshot.estimateFiles],
  );

  const reparse = useCallback(
    async (fileId: string): Promise<Result<string>> => {
      try {
        if (dataSource === "server") {
          const rows = await postFiles(new FormData(), `?reparse=${encodeURIComponent(fileId)}`);
          await ops.snapshot();
          return { ok: true, value: rows[0]?.text ?? "Разобрана заново" };
        }
        const file = demoBytes.get(fileId);
        if (!file) {
          return {
            ok: false,
            message: "В демо файл хранится до перезагрузки страницы. Загрузите его снова.",
          };
        }
        const parsed = await parseInTab(file);
        const outcome = await ops.reparseEstimateFile({
          fileId,
          parsed: parsed.ok ? parsed.parsed : null,
          error: parsed.ok ? null : parsed.message,
        });
        return { ok: true, value: outcomeText(outcome) };
      } catch (error) {
        return failed(error);
      }
    },
    [ops],
  );

  const createObject = useCallback(
    async (
      versionId: string,
      draft: ObjectDraft,
      pressureMode: PressureMode,
    ): Promise<Result<WorkObject>> => {
      try {
        return {
          ok: true,
          value: await ops.createObjectFromEstimate({
            versionId,
            label: draft.label,
            code: draft.code,
            workType: draft.workType,
            address: draft.address,
            estimateNumber: draft.estimateNumber,
            pressureMode,
          }),
        };
      } catch (error) {
        return failed(error);
      }
    },
    [ops],
  );

  const attach = useCallback(
    async (
      versionId: string,
      objectId: string,
      pressureMode: PressureMode,
    ): Promise<Result<EstimateVersion>> => {
      try {
        return {
          ok: true,
          value: await ops.linkEstimateVersion({ id: versionId, objectId, pressureMode }),
        };
      } catch (error) {
        return failed(error);
      }
    },
    [ops],
  );

  const cardOf = useCallback(
    (versionId: string, mode: PressureMode): EstimateCard | null => {
      const version = snapshot.estimateVersions.find((v) => v.id === versionId);
      if (!version) return null;
      const file = (snapshot.estimateFiles ?? []).find((f) => f.versionId === version.id) ?? null;
      const object = version.objectId
        ? (snapshot.objects.find((o) => o.id === version.objectId) ?? null)
        : null;
      const match = matchObject(version.header, snapshot.objects);
      const matched =
        match.kind === "new"
          ? null
          : (snapshot.objects.find((o) => o.id === match.objectId) ?? null);
      const prevOf = object ?? (match.kind === "attach" ? matched : null);
      const previous = prevOf
        ? snapshot.estimateVersions.find((v) => v.objectId === prevOf.id && v.id !== version.id)
        : undefined;
      return {
        file,
        version,
        object,
        match,
        matched,
        draft: objectDraft(version.header, version.fileName.replace(/\.xlsx?$/i, "")),
        sections: version.sections.map((s) => sectionView(s, mode)),
        convergence: convergence(version),
        changed: previous ? changedSections(previous.sections, version.sections) : null,
        previousVersion: previous?.version ?? null,
      };
    },
    [snapshot.estimateFiles, snapshot.estimateVersions, snapshot.objects],
  );

  /** Ссылка на исходный файл: только на сервере, в демо байты не хранятся */
  const fileUrl = (file: EstimateFile): string | null =>
    dataSource === "server" && file.storagePath
      ? `/api/gas/estimate-files?file=${encodeURIComponent(file.id)}`
      : null;

  return {
    files,
    busy,
    upload,
    reparse,
    createObject,
    attach,
    cardOf,
    fileUrl,
    objects: snapshot.objects,
  };
}

/**
 * Лист исходного файла для «Сверить с файлом» (план 20.11, этап 2): в демо — байты, загруженные
 * в этой вкладке, на сервере — файл из хранилища по ссылке. null с причиной, когда файла нет
 */
export async function loadFileSheet(
  file: EstimateFile,
  sheet: string | null,
): Promise<{ ok: true; grid: Cell[][]; sheet: string } | { ok: false; message: string }> {
  try {
    let source: File | null = demoBytes.get(file.id) ?? null;
    if (!source && dataSource === "server" && file.storagePath) {
      const res = await fetch(`/api/gas/estimate-files?file=${encodeURIComponent(file.id)}`);
      if (!res.ok) return { ok: false, message: "Сервер не отдал файл сметы." };
      source = new File([await res.blob()], file.name);
    }
    if (!source)
      return {
        ok: false,
        message: "Файл этой сметы в демо хранится только до перезагрузки. Загрузите его ещё раз.",
      };
    const { readEstimateFile } = await import("@/adapters/gas-ops/estimate-file");
    const sheets = await readEstimateFile(source);
    const picked = sheets.find((s) => s.name === sheet) ?? sheets[0];
    if (!picked) return { ok: false, message: "В файле нет листов." };
    return { ok: true, grid: picked.grid, sheet: picked.name };
  } catch (error) {
    return failed(error);
  }
}
