import { dataSource } from "@/api/config";
import { useGasAction, useGasOps, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";
import { update } from "@/adapters/gas-ops/state";
import { withManualAssignment } from "@/domain/gas-ops/manual-schedule";
import { isDayLocked } from "@/domain/gas-ops/week";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

export const demoWorkspaceEnabled = dataSource === "demo";
export type DemoObjectStatus = "active" | "paused" | "completed";
export type DemoObjectEdit = {
  label: string;
  code: string;
  workType: string;
  demoStatus: DemoObjectStatus;
};
export const DEMO_OBJECT_STATUS: Record<DemoObjectStatus, string> = {
  active: "В работе",
  paused: "Приостановлен",
  completed: "Завершён",
};

/** Только состояние демонстрации; серверный endpoint для редактирования не подделывается. */
export function editedDemoObject(
  s: GasOpsSnapshot,
  id: string,
  input: DemoObjectEdit,
): GasOpsSnapshot {
  const actor = s.users.find((u) => u.id === s.actorId);
  if (!actor || !["manager", "admin"].includes(actor.role))
    throw new Error("Объект редактирует менеджер или администратор");
  const before = s.objects.find((o) => o.id === id);
  if (!before) throw new Error("Объект не найден");
  const label = input.label.trim();
  const code = input.code.trim();
  if (!label || !code) throw new Error("Укажите адрес и номер объекта");
  if (s.objects.some((o) => o.id !== id && o.code.toLowerCase() === code.toLowerCase()))
    throw new Error("Номер уже занят другим объектом");
  if (!(input.demoStatus in DEMO_OBJECT_STATUS)) throw new Error("Выберите статус объекта");
  return {
    ...s,
    objects: s.objects.map((o) =>
      o.id === id
        ? {
            ...o,
            label,
            code,
            workType: input.workType.trim() || null,
            demoStatus: input.demoStatus,
          }
        : o,
    ),
    schedule: s.schedule
      ? {
          ...s.schedule,
          rows: s.schedule.rows.map((r) =>
            r.code === before.code || (!r.code && r.objectLabel === before.label)
              ? { ...r, code, objectLabel: label }
              : r,
          ),
        }
      : null,
    audit: [
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actor: s.actorId,
        action: "object.demo-edit",
        entityId: id,
        detail: `Объект ${before.code}: ${before.label} → ${code}, ${label}; ${DEMO_OBJECT_STATUS[input.demoStatus]} (демо)`,
      },
      ...s.audit,
    ],
  };
}

export function useDemoObjectEditor() {
  const s = useGasSnapshot();
  const run = useGasAction();
  return {
    objects: s.objects,
    save: (id: string, input: DemoObjectEdit) =>
      run(async () => {
        if (!demoWorkspaceEnabled)
          throw new Error("Редактирование макета доступно только в демонстрации");
        return update((current) => editedDemoObject(current, id, input));
      }),
  };
}

export function useManualAssignment() {
  const port = useGasOps();
  const run = useGasAction();
  const s = useGasSnapshot();
  return {
    days: s.week.days,
    brigades: s.brigades,
    objects: s.objects,
    assign: (input: { objectId: string; brigadeId: string; day: string }) =>
      run(async () => {
        const current = await port.snapshot();
        if (isDayLocked(current.periods, input.day))
          throw new Error("Неделя закрыта. Назначение изменить нельзя");
        return port.applySchedule({
          rows: withManualAssignment(current, input),
          fileName: current.schedule?.fileName ?? "Назначения вручную",
        });
      }),
  };
}
