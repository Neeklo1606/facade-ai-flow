import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CaptureInput,
  CreateMaterialRequestInput,
  CreateReportInput,
  DecideMaterialRequestInput,
} from "@/ports";
import type { ExtractionResult, FieldReport, WorkZone } from "@/contracts";
import {
  draftCards,
  reportFromRecord,
  reportableRecords,
  requestPrefill,
  workTypeMap,
  type DraftCard,
  type RequestPrefill,
} from "@/domain/draft";
import { shiftFileName, statementFileName } from "@/domain/shift";
import { saveFile } from "@/lib/download";
import { api } from "./client";
import { dataSource } from "./config";
import { keys } from "./keys";

/**
 * Отправка записи (ADR-036, п. 6). Сначала сохраняется факт, потом делается разбор: разбор
 * может не получиться, и это не повод потерять запись.
 *
 * Повтор отправки идёт с тем же ключом, поэтому дубля не возникает — это проверяет и порт,
 * и сквозной тест.
 */
export interface CaptureOutcome {
  sourceId: string;
  repeated: boolean;
  /** Разбор, если он получился; `null` — речи не было или модель не разобрала */
  draft: ExtractionResult | null;
  /** Почему разбора нет: показывается словами, без «что-то пошло не так» */
  refusal: string | null;
  by: { provider: string; model: string; demo: boolean } | null;
}

export function useCapture() {
  const client = useQueryClient();
  return useMutation<CaptureOutcome, Error, CaptureInput>({
    mutationFn: async (input) => {
      const saved = await api.capture.save(input);
      let draft: ExtractionResult | null = null;
      let refusal: string | null = null;
      let by: CaptureOutcome["by"] = null;
      const text = input.text.trim();
      if (text.length > 0) {
        const parsed = await api.capture.extract({
          projectId: input.projectId,
          message: text,
          sourceId: saved.source.id,
        });
        by = parsed.by;
        if (parsed.ok) draft = parsed.draft;
        else refusal = parsed.reason;
      }
      return { sourceId: saved.source.id, repeated: saved.repeated, draft, refusal, by };
    },
    onSuccess: (_outcome, input) => {
      // Источник появился в ленте объекта и в журнале обработок: обновляем то, что их читает
      void client.invalidateQueries({ queryKey: keys.reports.list(input.projectId) });
      void client.invalidateQueries({ queryKey: keys.projects.card(input.projectId) });
    },
  });
}

/** Заявки на материал: очередь снабжения и решения по ней (ADR-037, сценарий 3) */
export function useMaterialRequests(projectId: string | null) {
  return useQuery({
    queryKey: ["supply", "requests", projectId],
    queryFn: () => api.supply.requests(projectId),
  });
}

export function useCreateMaterialRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialRequestInput) => api.supply.create(input),
    onSettled: () => client.invalidateQueries({ queryKey: ["supply"] }),
  });
}

export function useDecideMaterialRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideMaterialRequestInput) => api.supply.decide(input),
    onSettled: () => client.invalidateQueries({ queryKey: ["supply"] }),
  });
}

/** Сводка смены объекта: та же, из которой собирается файл */
export function useShift(projectId: string | null, date: string, fallbackToLast = false) {
  return useQuery({
    queryKey: ["shift", projectId, date, fallbackToLast],
    queryFn: () => api.shift.summary({ projectId: projectId!, date, fallbackToLast }),
    enabled: !!projectId && !!date,
  });
}

/* ---------- Готовые данные для экрана ---------- */

/**
 * Черновик для экрана: карточки, готовые записи и заготовка заявки (ADR-001, п. 5).
 * Формулы считаются здесь, в слое данных, а экран получает готовое — он не знает домена.
 */
export interface PreparedDraft {
  cards: DraftCard[];
  reports: CreateReportInput[];
  prefill: RequestPrefill | null;
}

export function prepareDraft(
  draft: ExtractionResult,
  options: {
    projectId: string;
    date: string;
    summary: string;
    zones: WorkZone[];
    reports: FieldReport[];
  },
): PreparedDraft {
  const workTypes = workTypeMap(options.reports);
  return {
    cards: draftCards(draft, options.zones, workTypes),
    reports: reportableRecords(draft).map((record) =>
      reportFromRecord(record, {
        projectId: options.projectId,
        date: options.date,
        summary: options.summary,
        workTypes,
      }),
    ),
    prefill: requestPrefill(draft),
  };
}

/**
 * Скачать файл результата: сводку смены или черновик ведомости (ADR-037). Имя файла
 * собирается здесь же: экрану незачем знать правила именования.
 */
export async function saveShiftFile(
  input: { projectId: string; date: string; fallbackToLast?: boolean },
  kind: "shift" | "statement",
) {
  const summary = await api.shift.summary(input);
  const file =
    kind === "statement" ? await api.shift.statement(input) : await api.shift.excel(input);
  const name =
    kind === "statement"
      ? statementFileName(summary.projectName, summary.date)
      : shiftFileName(summary.projectName, summary.date);
  saveFile(file, name);
  return { name, rows: summary.rows.length };
}

/**
 * Подготовленные примеры показа (ADR-037, п. 3). Решение «есть ли они в этом контуре»
 * принимает слой данных, а не экран: экран, который сам смотрит на контур, однажды покажет
 * демонстрационный текст заказчику (проверка `contour-copy`).
 *
 * В рабочем контуре список пуст, и модуль примеров в бандл не попадает.
 */
export function useDemoExamples() {
  return useQuery({
    queryKey: ["demo", "examples"],
    queryFn: async () => {
      if (dataSource !== "demo") return [];
      const module = await import("@/ai/samples/demo-examples");
      return module.DEMO_EXAMPLES;
    },
    staleTime: Infinity,
  });
}
