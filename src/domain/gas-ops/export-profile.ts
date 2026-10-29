/**
 * Профиль выгрузки Excel (ADR-056, 6): шаблон заказчика, обязательные столбцы и сверка итога
 * файла с экраном. Столбцы дня берутся из того же списка, по которому пишет адаптер выгрузки,
 * поэтому профиль проверяет настоящий файл, а не свою копию.
 */
import type { ReportRow } from "./report";

/** Три показателя под каждым днём, как в файле заказчика */
export const CUSTOMER_DAY_HEADERS = [
  "Сумма начислений",
  "Эффективное рабочее время (ч.)",
  "Доходность часа",
] as const;

export interface ExportProfile {
  name: string;
  sheet: string;
  required: readonly string[];
}

export const CUSTOMER_PROFILE: ExportProfile = {
  name: "Формат заказчика «Выработка»",
  sheet: "Отчёт",
  required: CUSTOMER_DAY_HEADERS,
};

export interface ProfileCheck {
  missing: string[];
  /** Итог файла: сумма строк групп, целые рубли */
  fileTotalRub: number;
  screenTotalRub: number;
  matches: boolean;
}

/** Сверка профиля: каких столбцов нет и сходится ли итог файла с итогом экрана до рубля */
export function profileCheck(input: {
  profile: ExportProfile;
  headers: readonly string[];
  rows: readonly ReportRow[];
  screenTotalRub: number;
}): ProfileCheck {
  const have = new Set(input.headers);
  const missing = input.profile.required.filter((h) => !have.has(h));
  const fileTotalRub = input.rows
    .filter((r) => r.kind === "group")
    .reduce((a, r) => a + (r.total.amountRub ?? 0), 0);
  return {
    missing,
    fileTotalRub,
    screenTotalRub: input.screenTotalRub,
    matches: missing.length === 0 && fileTotalRub === input.screenTotalRub,
  };
}
