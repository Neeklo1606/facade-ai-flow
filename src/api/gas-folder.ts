/**
 * Папка смет на экране «Стоимость работ» (ADR-072): список файлов с состоянием и «Забрать»,
 * которое прогоняет каждый новый файл через тот же разбор, что и загрузку руками. Каждый
 * забранный файл — версия сметы «ждёт подтверждения» с подсказкой объекта по имени файла.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEstimateFolderDemo } from "@/adapters/gas-ops/estimate-folder-demo";
import { estimateFolderServer } from "@/adapters/gas-ops/estimate-folder-server";
import { dataSource } from "@/api/config";
import { useGasDirectory, useGasWeekFrom } from "@/api/gas-ops";
import { parseEstimateFile, useGasEstimateActions, useGasWorkCost } from "@/api/gas-estimates";
import {
  folderRows,
  folderSummary,
  toFetch,
  type FolderFile,
  type FolderRow,
} from "@/domain/gas-ops/estimate-folder";
import type { EstimateFolderPort, FolderStatus } from "@/ports/estimate-folder";

export type { FolderRow } from "@/domain/gas-ops/estimate-folder";
export type { FolderStatus } from "@/ports/estimate-folder";

export interface FetchedFile {
  name: string;
  ok: boolean;
  /** Версия сметы, если файл загружен; иначе причина словами */
  versionId: string | null;
  suggestion: string | null;
  message: string;
}

export function useEstimateFolder(): {
  status: FolderStatus | null;
  rows: FolderRow[];
  summary: string;
  error: string | null;
  loading: boolean;
  busy: boolean;
  pending: number;
  refresh: () => Promise<void>;
  fetchNew: () => Promise<FetchedFile[]>;
} {
  const directory = useGasDirectory();
  const weekFrom = useGasWeekFrom();
  const { versions } = useGasWorkCost();
  const actions = useGasEstimateActions();
  const objectsRef = useRef(directory.objects);
  objectsRef.current = directory.objects;

  const port: EstimateFolderPort = useMemo(
    () =>
      dataSource === "server"
        ? estimateFolderServer
        : createEstimateFolderDemo(
            // Образцы называют первые объекты справочника: сработает подсказка объекта
            () => objectsRef.current,
            () => `${weekFrom}T08:00:00`,
          ),
    [weekFrom],
  );

  const [status, setStatus] = useState<FolderStatus | null>(null);
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const listed = await port.list();
    setStatus(listed.status);
    setFiles(listed.ok ? listed.files : []);
    setError(listed.ok ? null : listed.reason);
    setLoading(false);
  }, [port]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo(() => folderRows(files, versions), [files, versions]);

  const fetchNew = useCallback(async () => {
    setBusy(true);
    const done: FetchedFile[] = [];
    try {
      for (const row of toFetch(rows)) {
        const name = row.file.name;
        const file = await port.download(row.file.path);
        if (!file.ok) {
          done.push({ name, ok: false, versionId: null, suggestion: null, message: file.reason });
          continue;
        }
        const parsed = await parseEstimateFile(
          new File([file.data], name, { type: "application/octet-stream" }),
          objectsRef.current,
        );
        if (!parsed.ok) {
          done.push({
            name,
            ok: false,
            versionId: null,
            suggestion: null,
            message: parsed.message,
          });
          continue;
        }
        const added = await actions.addVersion({
          parsed: parsed.parsed,
          fileName: name,
          objectId: null,
        });
        done.push(
          added.ok
            ? {
                name,
                ok: true,
                versionId: added.value.id,
                suggestion: parsed.suggestion,
                message: `версия ${added.value.version}`,
              }
            : { name, ok: false, versionId: null, suggestion: null, message: added.message },
        );
      }
    } finally {
      setBusy(false);
    }
    return done;
  }, [rows, port, actions]);

  return {
    status,
    rows,
    summary: folderSummary(rows),
    error,
    loading,
    busy,
    pending: toFetch(rows).length,
    refresh,
    fetchNew,
  };
}
