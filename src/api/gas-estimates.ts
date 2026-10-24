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
  workCostRub,
  type CostRule,
  type CostRuleTerm,
  type EstimateVersion,
  type NormVsFact,
} from "@/domain/gas-ops/work-cost";
import { brigadeStatus, type BrigadeWeekStatus, type ScheduleRow } from "@/domain/gas-ops/schedule";
import {
  accuracyOf,
  finalCheckList,
  modeAvailability,
  type Accuracy,
  type ModeAvailability,
  type ReviewMode,
  type ReviewSettings,
} from "@/domain/gas-ops/review-policy";
import { useGasAction, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";
import type { ReportIssue, WeekSchedule } from "@/ports/gas-ops";
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
    };
  }, [s.objects, s.estimateVersions, s.costRules, s.estimates, s.entries]);
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
    };
  }, [s.reviews, s.reviewSettings, s.finalChecks, s.entries, s.week.days, s.reportIssues, s.users]);
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
    link: useCallback(
      (input: { id: string; objectId: string }) => run((port) => port.linkEstimateVersion(input)),
      [run],
    ),
    reviewIssues: useCallback((id: string) => run((port) => port.reviewEstimateIssues(id)), [run]),
    confirm: useCallback((id: string) => run((port) => port.confirmEstimateVersion(id)), [run]),
    confirmRule: useCallback(
      (input: { objectId: string | null; terms: CostRuleTerm[] }) =>
        run((port) => port.confirmCostRule(input)),
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
      (input: { mode: ReviewMode; thresholdPercent: number }) =>
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
export { RULE_STATUS_LABEL } from "@/domain/gas-ops/work-cost";
export type { CostRule, EstimateVersion } from "@/domain/gas-ops/work-cost";

const kop = (kopecks: number) =>
  `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

export interface EstimateVersionView {
  /** Итоги с подписью, суммой и строкой файла */
  totals: { key: string; label: string; value: string; row: number }[];
  sections: { title: string; value: string; row: number }[];
  /** «Сумма разделов 142 174,91 ₽, сходится с итогом без НДС»; null — нечего сверять */
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
  const cost = applyRule(version.totals, rule.terms);
  return {
    totals: TOTAL_ORDER.filter((key) => version.totals[key]).map((key) => ({
      key,
      label:
        key === "vat" && version.vatRate !== null ? `НДС ${version.vatRate}%` : TOTAL_LABEL[key],
      value: kop(version.totals[key]!.kopecks),
      row: version.totals[key]!.row,
    })),
    sections: version.sections.map((s) => ({ title: s.title, value: kop(s.kopecks), row: s.row })),
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

/** «норма 57,6 чел.-ч, факт 41,5 ч» или null, если нормы нет */
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
