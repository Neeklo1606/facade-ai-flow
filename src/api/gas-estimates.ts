/**
 * Слой данных смет, стоимости работ, графика и режимов проверки (ADR-053). Экраны берут
 * отсюда готовые строки и действия; правила — в домене, состояние — за портом.
 */
import { useCallback, useMemo } from "react";
import type { WorkObject } from "@/domain/gas-ops/model";
import {
  TOLERANCE_KOPECKS,
  TOTAL_LABEL,
  TOTAL_ORDER,
  type ParsedWorkbook,
} from "@/domain/gas-ops/estimate-labels";
import {
  applyRule,
  canConfirmVersion,
  fmtNormVsFact,
  latestConfirmed,
  normVsFact,
  ruleFor,
  ruleFormula,
  ruleHistory,
  workCostRub,
  type CostRule,
  type CostRuleTerm,
  type EstimateVersion,
  type NormVsFact,
} from "@/domain/gas-ops/work-cost";
import { brigadeStatus, type BrigadeWeekStatus, type ScheduleRow } from "@/domain/gas-ops/schedule";
import {
  accuracyOf,
  flaggedModeSuggestion,
  type ModeSuggestion,
  finalCheckList,
  modeAvailability,
  type Accuracy,
  type ModeAvailability,
  type ReviewMode,
  type ReviewSettings,
} from "@/domain/gas-ops/review-policy";
import { useGasAction, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";
import type { GasOpsPort, ReportIssue, WeekSchedule } from "@/ports/gas-ops";
import type { Estimate, TimeEntry } from "@/domain/gas-ops/model";

export interface WorkCostRow {
  object: WorkObject;
  estimate: Estimate | null;
  /** Последняя подтверждённая версия сметы */
  confirmed: EstimateVersion | null;
  /** Версии этого объекта, новые сверху */
  versions: EstimateVersion[];
  rule: CostRule;
  /** Стоимость по последней подтверждённой версии и действующему правилу */
  costRub: number | null;
  norm: NormVsFact;
}

/** Стоимость работ по объектам: смета, версии, правило, норма против факта */
export function useGasWorkCost(): {
  rows: WorkCostRow[];
  unlinked: EstimateVersion[];
  companyRule: CostRule;
  versions: EstimateVersion[];
  /** Последняя загруженная смета: на ней конструктор правила показывает пример (F2) */
  latestUploaded: EstimateVersion | null;
} {
  const s = useGasSnapshot();
  return useMemo(() => {
    const rows = s.objects.map((object) => {
      const versions = s.estimateVersions
        .filter((v) => v.objectId === object.id)
        .sort((a, b) => b.version - a.version);
      const confirmed = latestConfirmed(object.id, s.estimateVersions);
      const rule = ruleFor(object.id, s.costRules);
      return {
        object,
        estimate: s.estimates.find((e) => e.objectId === object.id) ?? null,
        confirmed,
        versions,
        rule,
        costRub: confirmed ? workCostRub(confirmed, rule) : null,
        norm: normVsFact(confirmed?.laborHours?.value ?? null, s.entries, object.id),
      };
    });
    return {
      rows,
      unlinked: s.estimateVersions.filter((v) => v.objectId === null),
      companyRule: ruleFor(
        "",
        s.costRules.filter((r) => r.objectId === null),
      ),
      versions: s.estimateVersions,
      latestUploaded:
        [...s.estimateVersions].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0] ?? null,
    };
  }, [s.objects, s.estimateVersions, s.costRules, s.estimates, s.entries]);
}

/** Редакция правила для истории: формула, кто и когда сохранил и подтвердил */
export interface RuleRevisionView {
  revision: number;
  formula: string;
  saved: string;
  confirmed: string | null;
  /** Сохранил и подтвердил один человек (ADR-062, решение владельца 1) */
  samePerson: boolean;
}

const stamp = (at: string) => `${at.slice(8, 10)}.${at.slice(5, 7)} в ${at.slice(11, 16)}`;

/** История редакций правила (F2), новые сверху */
export function useGasRuleHistory(rule: CostRule | null): RuleRevisionView[] {
  const s = useGasSnapshot();
  return useMemo(() => {
    if (!rule) return [];
    const name = (id: string) => s.users.find((u) => u.id === id)?.name ?? id;
    return ruleHistory(rule)
      .map((r) => ({
        revision: r.revision,
        formula: ruleFormula(r.terms),
        saved:
          r.savedBy && r.savedAt
            ? `${name(r.savedBy)}, ${stamp(r.savedAt)}`
            : "Исходное правило системы",
        confirmed:
          r.confirmedBy && r.confirmedAt ? `${name(r.confirmedBy)}, ${stamp(r.confirmedAt)}` : null,
        samePerson: !!r.savedBy && r.savedBy === r.confirmedBy,
      }))
      .reverse();
  }, [rule, s.users]);
}

/** Норма против факта по одному объекту: для карточки объекта и отчёта */
export function useGasNorm(objectId: string): NormVsFact {
  const s = useGasSnapshot();
  return useMemo(() => {
    const confirmed = latestConfirmed(objectId, s.estimateVersions);
    return normVsFact(confirmed?.laborHours?.value ?? null, s.entries, objectId);
  }, [objectId, s.estimateVersions, s.entries]);
}

export interface ReviewPolicyData {
  settings: ReviewSettings;
  accuracy: Accuracy;
  availability: Record<ReviewMode, ModeAvailability>;
  /** Записи недели без ручного подтверждения, ждущие итоговой проверки */
  finalList: TimeEntry[];
  reports: ReportIssue[];
  lastCheck: { at: string; by: string; count: number } | null;
  /** Предложение перейти на «только с замечаниями»; null — предлагать рано или нечего */
  suggestion: ModeSuggestion | null;
}

export function useGasReviewPolicy(): ReviewPolicyData {
  const s = useGasSnapshot();
  return useMemo(() => {
    const accuracy = accuracyOf(s.reviews);
    const threshold = s.reviewSettings.thresholdPercent;
    const last = s.finalChecks[0];
    return {
      settings: s.reviewSettings,
      accuracy,
      availability: {
        all: modeAvailability("all", accuracy, threshold),
        flagged: modeAvailability("flagged", accuracy, threshold),
        none: modeAvailability("none", accuracy, threshold),
      },
      finalList: finalCheckList(s.entries, s.finalChecks, s.week.days),
      reports: s.reportIssues,
      lastCheck: last
        ? {
            at: last.at,
            by: s.users.find((u) => u.id === last.by)?.name ?? last.by,
            count: last.entryIds.length,
          }
        : null,
      suggestion: flaggedModeSuggestion({
        settings: s.reviewSettings,
        accuracy,
        reviews: s.reviews,
        now: `${s.today}T23:59:00`,
      }),
    };
  }, [
    s.reviews,
    s.reviewSettings,
    s.finalChecks,
    s.entries,
    s.week.days,
    s.reportIssues,
    s.users,
    s.today,
  ]);
}

/** График недели и отметки бригад */
export function useGasSchedule(): {
  schedule: WeekSchedule | null;
  weekFrom: string;
  brigades: { id: string; name: string; code: string; status: BrigadeWeekStatus }[];
} {
  const s = useGasSnapshot();
  return useMemo(
    () => ({
      schedule: s.schedule,
      weekFrom: s.week.from,
      brigades: s.brigades.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        status: brigadeStatus(b.id, s.week.from, s.brigadeAvailability),
      })),
    }),
    [s.schedule, s.week.from, s.brigades, s.brigadeAvailability],
  );
}

export function useGasEstimateActions() {
  const run = useGasAction();
  return {
    addVersion: useCallback(
      (input: { parsed: ParsedWorkbook; fileName: string; objectId: string | null }) =>
        run((port) => port.addEstimateVersion(input)),
      [run],
    ),
    /** Отмена импорта: неподтверждённая версия удаляется (ADR-061, 12) */
    discard: useCallback((id: string) => run((port) => port.discardEstimateVersion(id)), [run]),
    link: useCallback(
      (input: { id: string; objectId: string }) => run((port) => port.linkEstimateVersion(input)),
      [run],
    ),
    reviewIssues: useCallback((id: string) => run((port) => port.reviewEstimateIssues(id)), [run]),
    /** Правка значения разбора до подтверждения с основанием (ADR-066) */
    correct: useCallback(
      (input: Parameters<GasOpsPort["correctEstimateValue"]>[0]) =>
        run((port) => port.correctEstimateValue(input)),
      [run],
    ),
    confirm: useCallback((id: string) => run((port) => port.confirmEstimateVersion(id)), [run]),
    confirmRule: useCallback(
      (input: { objectId: string | null; terms: CostRuleTerm[] }) =>
        run((port) => port.confirmCostRule(input)),
      [run],
    ),
    /** Новая редакция из конструктора (F2) */
    saveRule: useCallback(
      (input: { objectId: string | null; terms: CostRuleTerm[] }) =>
        run((port) => port.saveCostRule(input)),
      [run],
    ),
    undoRule: useCallback(
      (input: { objectId: string | null; revision: number }) =>
        run((port) => port.undoCostRule(input)),
      [run],
    ),
    /** «Вернуть правило компании» у объекта (решение владельца 2) */
    resetObjectRule: useCallback(
      (objectId: string) => run((port) => port.resetObjectRule({ objectId })),
      [run],
    ),
    applySchedule: useCallback(
      (input: { rows: ScheduleRow[]; fileName: string }) =>
        run((port) => port.applySchedule(input)),
      [run],
    ),
    restoreSchedule: useCallback(
      (previous: WeekSchedule | null) => run((port) => port.restoreSchedule(previous)),
      [run],
    ),
    setBrigadeWeek: useCallback(
      (input: { brigadeId: string; weekFrom: string; status: BrigadeWeekStatus }) =>
        run((port) => port.setBrigadeWeek(input)),
      [run],
    ),
    setReviewSettings: useCallback(
      (input: { mode: ReviewMode; thresholdPercent: number; secondRuleApprover?: boolean }) =>
        run((port) => port.setReviewSettings(input)),
      [run],
    ),
    finalCheck: useCallback(() => run((port) => port.finalCheck()), [run]),
    issueReport: useCallback(() => run((port) => port.issueReport()), [run]),
  };
}

export type FileParseResult =
  { ok: true; parsed: ParsedWorkbook; suggestion: string | null } | { ok: false; message: string };

/**
 * Разобрать файл сметы в браузере: адаптер чтения и SheetJS грузятся отдельным куском только
 * здесь. Файл не уходит на сервер. Подсказка объекта — по словам имени файла, её подтверждает
 * человек.
 */
export async function parseEstimateFile(
  file: File,
  objects: { id: string; label: string; code: string }[],
): Promise<FileParseResult> {
  const [{ readEstimateFile, EstimateFileError }, { parseEstimateWorkbook }, { suggestObject }] =
    await Promise.all([
      import("@/adapters/gas-ops/estimate-file"),
      import("@/domain/gas-ops/estimate-parse"),
      import("@/domain/gas-ops/work-cost"),
    ]);
  try {
    const sheets = await readEstimateFile(file);
    return {
      ok: true,
      parsed: parseEstimateWorkbook(sheets),
      suggestion: suggestObject(file.name, objects),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof EstimateFileError
          ? error.message
          : "Файл не прочитался. Проверьте, что это смета Excel, и загрузите снова.",
    };
  }
}

/** Прочитать файл графика как сетку первого листа: то же чтение, что у смет */
export async function readScheduleFile(
  file: File,
): Promise<
  | { ok: true; grid: import("@/domain/gas-ops/estimate-labels").Grid }
  | { ok: false; message: string }
> {
  const { readEstimateFile, EstimateFileError } = await import("@/adapters/gas-ops/estimate-file");
  try {
    const sheets = await readEstimateFile(file);
    const first = sheets.find((s) => s.grid.some((row) => row.some((c) => c !== null && c !== "")));
    if (!first) return { ok: false, message: "В файле нет заполненных листов." };
    return { ok: true, grid: first.grid };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof EstimateFileError ? error.message : "Файл графика не прочитался.",
    };
  }
}

/* ---------------------------------------------------------------- Готовый вид для экранов */

export { ESTIMATE_FORMAT_LABEL, PARSE_STATUS_LABEL } from "@/domain/gas-ops/estimate-labels";
export type { TotalKey } from "@/domain/gas-ops/estimate-labels";
export { correctionOf } from "@/domain/gas-ops/work-cost";
export type { CorrectionTarget, EstimateCorrection } from "@/domain/gas-ops/work-cost";
export {
  RULE_STATUS_LABEL,
  recalcNote,
  ruleExample,
  sameTerms,
  termChoices,
  termLabel,
  validateTerms,
} from "@/domain/gas-ops/work-cost";
export type {
  CostRule,
  CostRuleTerm,
  EstimateVersion,
  RuleExample,
  TermKey,
} from "@/domain/gas-ops/work-cost";
export type { CostRuleChange } from "@/ports/gas-ops";

export const kop = (kopecks: number) =>
  `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

export interface EstimateVersionView {
  /** Итоги с подписью, суммой и строкой файла */
  totals: { key: string; label: string; value: string; row: number }[];
  sections: { title: string; value: string; row: number }[];
  /** Строки с суммой ниже «ВСЕГО по смете» (F4): можно взять в правило */
  extras: { label: string; value: string; row: number }[];
  /** «Сумма разделов 80 000,91 ₽, сходится с итогом без НДС»; null — нечего сверять */
  sectionsNote: string | null;
  labor: { value: string; row: number } | null;
  formula: string;
  /** Кандидат стоимости с копейками; null — в смете нет строк правила */
  cost: string | null;
  /** Целыми рублями, как пойдёт в запись */
  costRub: number | null;
  ready: { ok: true } | { ok: false; reason: string };
}

/** Вид разобранной версии сметы: всё посчитано здесь, экран только показывает */
export function estimateVersionView(version: EstimateVersion, rule: CostRule): EstimateVersionView {
  const sum = version.sections.reduce((a, s) => a + s.kopecks, 0);
  const withoutVat = version.totals.withoutVat?.kopecks ?? null;
  const cost = applyRule(version.totals, rule.terms, version.extras ?? []);
  return {
    totals: TOTAL_ORDER.filter((key) => version.totals[key]).map((key) => ({
      key,
      label:
        key === "vat" && version.vatRate !== null ? `НДС ${version.vatRate}%` : TOTAL_LABEL[key],
      value: kop(version.totals[key]!.kopecks),
      row: version.totals[key]!.row,
    })),
    sections: version.sections.map((s) => ({ title: s.title, value: kop(s.kopecks), row: s.row })),
    extras: (version.extras ?? []).map((e) => ({
      label: e.label,
      value: kop(e.kopecks),
      row: e.row,
    })),
    sectionsNote:
      withoutVat === null || version.sections.length === 0
        ? null
        : `Сумма разделов ${kop(sum)}${
            Math.abs(sum - withoutVat) <= TOLERANCE_KOPECKS
              ? ", сходится с итогом без НДС"
              : ", не сходится с итогом без НДС"
          }`,
    labor: version.laborHours
      ? {
          value: `${version.laborHours.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} чел.-ч`,
          row: version.laborHours.row,
        }
      : null,
    formula: ruleFormula(rule.terms),
    cost: cost.ok ? kop(cost.kopecks) : null,
    costRub: cost.ok ? Math.round(cost.kopecks / 100) : null,
    ready: canConfirmVersion(version),
  };
}

/** «норма 40,1 чел.-ч, факт 41,5 ч» или null, если нормы нет */
export function normText(norm: NormVsFact): string | null {
  return norm.normHours === null ? null : fmtNormVsFact(norm);
}

/** Формула правила словами */
export function formulaOf(rule: CostRule): string {
  return ruleFormula(rule.terms);
}

/* ---------------------------------------------------------------- График недели */

export { REQUIRED_FIELDS, SCHEDULE_FIELD_LABEL } from "@/domain/gas-ops/schedule";
export type { ColumnMap, ScheduleField, ScheduleRow } from "@/domain/gas-ops/schedule";

/** Разбор файла графика грузится только после выбора файла (ADR-053, кусок по требованию) */
/** Все листы книги Excel для мастера импорта (ADR-061, 12): файл читается в браузере */
export async function readExcelSheets(
  file: File,
): Promise<
  | { ok: true; sheets: import("@/domain/gas-ops/estimate-labels").SheetGrid[] }
  | { ok: false; message: string }
> {
  const { readEstimateFile, EstimateFileError } = await import("@/adapters/gas-ops/estimate-file");
  try {
    const sheets = await readEstimateFile(file);
    if (!sheets.length) return { ok: false, message: "В файле нет листов." };
    return { ok: true, sheets };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof EstimateFileError ? error.message : "Файл не прочитался.",
    };
  }
}

export { RECONCILE_REASON_LABEL } from "@/domain/gas-ops/reconcile-file";
export type { Discrepancy, FileReconciliation } from "@/domain/gas-ops/reconcile-file";

/**
 * Сверка недели с Excel заказчика (ADR-063, 1.8): файл читается в браузере, сравнивается
 * с принятыми записями этой вкладки. Разбор грузится только после выбора файла
 */
export function useFileReconcile(): (
  file: File,
) => Promise<
  | { ok: true; result: import("@/domain/gas-ops/reconcile-file").FileReconciliation }
  | { ok: false; message: string }
> {
  const s = useGasSnapshot();
  return useCallback(
    async (file: File) => {
      const read = await readExcelSheets(file);
      if (!read.ok) return read;
      const { readFileWeek, reconcileFile } = await import("@/domain/gas-ops/reconcile-file");
      for (const sheet of read.sheets) {
        const week = readFileWeek(sheet.grid, s.objects);
        if (!week) continue;
        if (!week.days.some((d) => s.week.days.includes(d)))
          return {
            ok: false,
            message: `В файле неделя ${week.days[0]} – ${week.days.at(-1)}, а открыта ${s.week.from} – ${s.week.to}.`,
          };
        return { ok: true, result: reconcileFile(week, s.entries, s.objects) };
      }
      return {
        ok: false,
        message: "Не нашли строку с датами дней: это не «Фактический отчёт» за неделю.",
      };
    },
    [s.objects, s.entries, s.week],
  );
}

/** Подсказка объекта сметы по имени файла: её подтверждает человек */
export async function suggestEstimateObject(
  fileName: string,
  objects: WorkObject[],
): Promise<string | null> {
  const { suggestObject } = await import("@/domain/gas-ops/work-cost");
  return suggestObject(fileName, objects);
}

/** «Скачать шаблон (.xlsx)» мастера импорта */
export async function downloadTemplate(
  rows: (string | number | null)[][],
  fileName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { writeTemplate } = await import("@/adapters/gas-ops/estimate-file");
  try {
    await writeTemplate(rows, fileName);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Шаблон не собрался." };
  }
}

/** Правила мастера импорта: грузятся вместе с чтением файла */
export function loadImportTools() {
  return Promise.all([
    import("@/domain/gas-ops/import-wizard"),
    import("@/domain/gas-ops/estimate-parse"),
    import("@/domain/gas-ops/schedule-import"),
    import("@/domain/gas-ops/directory-import"),
  ]).then(([wizard, estimate, schedule, directory]) => ({
    ...wizard,
    ...estimate,
    ...schedule,
    ...directory,
  }));
}

/* ---------------------------------------------------------------- Справочники из Excel (F3) */

export {
  DIRECTORY_FIELDS,
  DIRECTORY_FIELD_LABEL,
  DIRECTORY_KIND_LABEL,
  DIRECTORY_TEMPLATE,
} from "@/domain/gas-ops/directory-import";
export type {
  DirectoryField,
  DirectoryKind,
  DirectoryPlan,
  DirectoryState,
} from "@/domain/gas-ops/directory-import";
export type { DirectoryImportReport } from "@/ports/gas-ops";

/** Справочник для предпросмотра импорта и действия импорта и «Добавить объект» */
export function useGasDirectoryImport() {
  const s = useGasSnapshot();
  const run = useGasAction();
  const state = useMemo(
    () => ({
      brigades: s.brigades.map((b) => ({
        id: b.id,
        name: b.name,
        phone: b.phone ?? null,
        leadName: s.employees.find((e) => e.brigadeId === b.id && e.isLead)?.name ?? null,
      })),
      crew: s.crew,
      rates: s.rates,
    }),
    [s.brigades, s.employees, s.crew, s.rates],
  );
  return {
    state,
    importDirectory: useCallback(
      (input: Parameters<GasOpsPort["importDirectory"]>[0]) =>
        run((port) => port.importDirectory(input)),
      [run],
    ),
    undoDirectoryImport: useCallback(
      (id: string) => run((port) => port.undoDirectoryImport({ id })),
      [run],
    ),
    addObject: useCallback(
      (input: { label: string; code: string; workType: string | null }) =>
        run((port) => port.addObject(input)),
      [run],
    ),
    addBrigade: useCallback(
      (input: { name: string; groupId: string; phone: string | null }) =>
        run((port) => port.addBrigade(input)),
      [run],
    ),
    addCrewMember: useCallback(
      (input: { brigadeId: string; name: string; from: string }) =>
        run((port) => port.addCrewMember(input)),
      [run],
    ),
  };
}
export type ImportTools = Awaited<ReturnType<typeof loadImportTools>>;
export type { ImportCheck, ColumnOption } from "@/domain/gas-ops/import-wizard";
export type { SheetGrid } from "@/domain/gas-ops/estimate-labels";
export { ESTIMATE_TEMPLATE, SCHEDULE_TEMPLATE } from "@/domain/gas-ops/import-wizard";

export function loadScheduleTools() {
  return import("@/domain/gas-ops/schedule-import");
}
export type ScheduleTools = Awaited<ReturnType<typeof loadScheduleTools>>;
export type { Grid } from "@/domain/gas-ops/estimate-labels";
export {
  REVIEW_MODE_HINT,
  REVIEW_MODE_LABEL,
  type ReviewMode,
} from "@/domain/gas-ops/review-policy";
