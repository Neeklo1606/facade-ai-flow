import { projects } from "./projects";
import { portfolioTotals, projectFinance, projectVolumes, zoneVolumes } from "./selectors";
import { volumeEntries, workZones } from "./work";

export interface ConsistencyIssue {
  scope: string;
  field: string;
  expected: number;
  actual: number;
}

/**
 * Проверка согласованности: одна цифра обязана совпадать на дашборде,
 * в карточке объекта, в аналитике и в графике.
 */
export function checkConsistency(): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const compare = (scope: string, field: string, expected: number, actual: number) => {
    if (Math.abs(expected - actual) > 0.5) issues.push({ scope, field, expected, actual });
  };

  for (const project of projects) {
    const finance = projectFinance(project.id);
    compare(project.id, "performedAmount", finance.performedAmount, project.performedAmount);
    compare(project.id, "approvedAmount", finance.approvedAmount, project.approvedAmount);
    compare(project.id, "closedAmount", finance.closedAmount, project.closedAmount);
    compare(project.id, "unclosedAmount", finance.unclosedAmount, project.unclosedAmount);
    compare(project.id, "unclosedValue", finance.unclosedValue, project.unclosedValue);
    compare(project.id, "actualProgress", finance.actualProgress, project.actualProgress);

    // Факт по захваткам обязан совпадать с суммой записей объёмов
    const volumes = projectVolumes(project.id);
    const entriesQty = volumeEntries
      .filter((item) => item.projectId === project.id)
      .reduce((acc, item) => acc + item.qty, 0);
    compare(project.id, "factQty", entriesQty, volumes.factQty);

    // Закрытое плюс незакрытое равно выполненному
    compare(project.id, "closed+unclosed", finance.performedAmount, finance.closedAmount + finance.unclosedValue);

    // Оплачено не может превышать закрытое
    if (project.paidAmount > finance.closedAmount) {
      issues.push({ scope: project.id, field: "paidAmount>closedAmount", expected: finance.closedAmount, actual: project.paidAmount });
    }
  }

  for (const zone of workZones) {
    const zoneData = zoneVolumes(zone.id);
    compare(zone.id, "factQty", zoneData.closedQty + zoneData.unclosedQty, zone.factQty);
    if (zone.factQty > zone.planQty) {
      issues.push({ scope: zone.id, field: "factQty>planQty", expected: zone.planQty, actual: zone.factQty });
    }
  }

  const totals = portfolioTotals();
  const performedSum = projects.reduce((acc, project) => acc + project.performedAmount, 0);
  compare("portfolio", "performedAmount", performedSum, totals.performedAmount);

  return issues;
}

/** Контрольные значения сквозного сценария — их нельзя менять локально в экранах. */
export const referenceFigures = {
  projectId: "p-korona",
  contractNumber: "ДСК-2026/008",
  contractAmount: 95_400_000,
  zoneId: "z-korona-2",
  zonePlanQty: 2400,
  zoneFactQty: 1846,
  unclosedQty: 554,
  unclosedValue: 2_400_000,
} as const;
