import { allocateByMinutes } from "./work-cost";
import type { EstimateSection } from "./estimate-labels";

export interface DemoAllocationRow {
  id: string;
  sectionRow: number;
  brigadeId: string;
  day: string;
  percent: number;
}
export interface DemoAllocationPlan {
  materials: Record<string, string>;
  kinds: Record<string, string>;
  rows: DemoAllocationRow[];
}
export const emptyDemoPlan = (): DemoAllocationPlan => ({ materials: {}, kinds: {}, rows: [] });
export function sectionNet(section: EstimateSection, materials: string | undefined): number | null {
  if (materials === undefined || !materials.trim()) return null;
  const value = Number(materials.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || Math.round(value * 100) > section.kopecks)
    return null;
  return section.kopecks - Math.round(value * 100);
}
/** Макет объёмного распределения. Не используется действующим расчётом табеля. */
export function demoSectionAllocation(section: EstimateSection, plan: DemoAllocationPlan) {
  const rows = plan.rows.filter((r) => r.sectionRow === section.row);
  const units = rows.map((r) => Math.round(r.percent * 100));
  const total = units.reduce((a, b) => a + b, 0);
  if (
    rows.some(
      (r, i) => !Number.isFinite(r.percent) || r.percent > 100 || r.percent <= 0 || units[i]! <= 0,
    ) ||
    total > 10000
  )
    throw new Error("Доли раздела должны быть больше нуля и в сумме не больше 100 %");
  const net = sectionNet(section, plan.materials[String(section.row)]);
  const allocated = net === null ? null : Math.round((net * total) / 10000);
  const amounts =
    allocated === null
      ? new Map<string, number>()
      : allocateByMinutes(
          allocated,
          rows.map((r, i) => ({ id: r.id, minutes: units[i]! })),
        );
  return {
    net,
    percent: total / 100,
    allocated,
    remaining: net === null || allocated === null ? null : net - allocated,
    amounts,
  };
}

/** Старый или повреждённый локальный проект не должен ломать страницу. */
export function isDemoAllocationPlan(value: unknown): value is DemoAllocationPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<DemoAllocationPlan>;
  if (
    !p.materials ||
    typeof p.materials !== "object" ||
    !p.kinds ||
    typeof p.kinds !== "object" ||
    !Array.isArray(p.rows)
  )
    return false;
  if (
    !Object.values(p.materials).every((v) => typeof v === "string") ||
    !Object.values(p.kinds).every((v) => typeof v === "string")
  )
    return false;
  const ids = new Set<string>();
  return p.rows.every((r) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      !Number.isFinite(r.sectionRow) ||
      typeof r.brigadeId !== "string" ||
      typeof r.day !== "string" ||
      !Number.isFinite(r.percent) ||
      r.percent <= 0 ||
      r.percent > 100
    )
      return false;
    ids.add(r.id);
    return true;
  });
}
