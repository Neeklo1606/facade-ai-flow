import { useEffect, useState } from "react";
import { dataSource } from "@/api/config";
import { useGasContour } from "@/lib/gas-ops/contour";
import { saveFile } from "@/lib/download";
import {
  demoSectionAllocation,
  isDemoAllocationPlan,
  emptyDemoPlan,
  type DemoAllocationPlan,
} from "@/domain/gas-ops/demo-allocation";
import type { EstimateVersion } from "@/domain/gas-ops/work-cost";
export { demoSectionAllocation, emptyDemoPlan } from "@/domain/gas-ops/demo-allocation";
export type { DemoAllocationPlan, DemoAllocationRow } from "@/domain/gas-ops/demo-allocation";

export function useDemoAllocation(version: EstimateVersion) {
  const contour = useGasContour();
  const key = `gaika-demo-allocation-v1:${contour.kind}:${version.objectId}:${version.id}`;
  const [state, setState] = useState<{ key: string; plan: DemoAllocationPlan } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const plan = raw ? (JSON.parse(raw) as DemoAllocationPlan) : emptyDemoPlan();
      if (!isDemoAllocationPlan(plan)) throw new Error();
      setState({ key, plan });
      setError(null);
    } catch {
      setState({ key, plan: emptyDemoPlan() });
      setError("Сохранённый проект не прочитан. Проверьте данные перед сохранением");
    }
  }, [key]);
  const plan = state?.key === key ? state.plan : emptyDemoPlan();
  const save = (next: DemoAllocationPlan) => {
    setState({ key, plan: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setError(null);
    } catch {
      setError("Проект виден на экране, но не сохранён: браузер запретил запись");
    }
  };
  return { plan, save, error, ready: state?.key === key, enabled: dataSource === "demo" };
}

export async function exportDemoAllocation(
  version: EstimateVersion,
  plan: DemoAllocationPlan,
  brigades: { id: string; name: string }[],
) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const sheet: (string | number | null)[][] = [];
  sheet.push([
    "Демонстрационный проект. Не утверждённый отчёт. Формула по объёму требует согласования.",
  ]);
  sheet.push(["Смета", version.fileName, "Версия", version.version]);
  sheet.push([
    "Раздел",
    "Строка сметы",
    "Вид",
    "Бригада",
    "День",
    "Доля, %",
    "Проект суммы, ₽",
    "Остаток раздела, ₽",
  ]);
  for (const section of version.sections) {
    const result = demoSectionAllocation(section, plan);
    if (result.net === null && plan.rows.some((r) => r.sectionRow === section.row))
      throw new Error("Укажите материалы по всем распределённым разделам");
    for (const row of plan.rows.filter((r) => r.sectionRow === section.row))
      sheet.push([
        section.title,
        section.row,
        plan.kinds[String(section.row)] ?? "Не классифицирован",
        brigades.find((b) => b.id === row.brigadeId)?.name ?? row.brigadeId,
        row.day,
        row.percent,
        (result.amounts.get(row.id) ?? 0) / 100,
        result.remaining === null ? null : result.remaining / 100,
      ]);
  }
  const summary: (string | number | null)[][] = [];
  summary.push(["Демонстрационный проект. Не утверждённые начисления"]);
  summary.push([
    "Раздел",
    "Строка",
    "Вид работ",
    "Итог, ₽",
    "Материалы, ₽",
    "Без материалов, ₽",
    "Выполнено, %",
    "Распределено, ₽",
    "Остаток, ₽",
  ]);
  for (const section of version.sections) {
    const result = demoSectionAllocation(section, plan);
    summary.push([
      section.title,
      section.row,
      plan.kinds[String(section.row)] ?? "Не классифицирован",
      section.kopecks / 100,
      result.net === null ? null : (section.kopecks - result.net) / 100,
      result.net === null ? null : result.net / 100,
      result.percent,
      result.allocated === null ? null : result.allocated / 100,
      result.remaining === null ? null : result.remaining / 100,
    ]);
  }
  const sheetData = XLSX.utils.aoa_to_sheet(sheet);
  const summaryData = XLSX.utils.aoa_to_sheet(summary);
  sheetData["!cols"] = Array.from({ length: 8 }, () => ({ wch: 24 }));
  summaryData["!cols"] = Array.from({ length: 9 }, () => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(book, sheetData, "Проект начислений");
  XLSX.utils.book_append_sheet(book, summaryData, "Разделы и остатки");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  saveFile(
    new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `Проект_начислений_версия_${version.version}.xlsx`,
  );
}
