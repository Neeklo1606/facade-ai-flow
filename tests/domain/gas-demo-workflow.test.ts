import { beforeEach, expect, test } from "bun:test";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import { editedDemoObject } from "@/api/gas-demo-workflow";
import { withManualAssignment } from "@/domain/gas-ops/manual-schedule";
import { brigadeCards, dayObjects, objectCards } from "@/domain/gas-ops/view";

beforeEach(() => resetState());
test("ручной график сохраняет прежние назначения и не дублирует повтор", () => {
  const s = getSnapshot();
  const object = { ...s.objects[0]!, id: "new-object", code: "ОБ-NEW", label: "Новый объект" };
  const brigade = s.brigades[0]!;
  const day = s.week.days[0]!;
  const data = {
    ...s,
    actorId: "u-manager",
    objects: [...s.objects, object],
    brigadeAvailability: [],
  };
  const rows = withManualAssignment(data, { objectId: object.id, brigadeId: brigade.id, day });
  expect(rows.some((r) => r.code === object.code)).toBe(true);
  const scheduled = { ...data, schedule: { rows } };
  expect(
    withManualAssignment(scheduled, { objectId: object.id, brigadeId: brigade.id, day }),
  ).toHaveLength(rows.length);
  expect(dayObjects(scheduled, brigade.id, day).some((o) => o.id === object.id)).toBe(true);
  expect(
    brigadeCards(scheduled)
      .find((c) => c.brigade.id === brigade.id)
      ?.objects.some((o) => o.id === object.id),
  ).toBe(true);
  expect(
    objectCards(scheduled)
      .find((c) => c.object.id === object.id)
      ?.brigades.some((b) => b.id === brigade.id),
  ).toBe(true);
  for (const assignment of s.assignments) {
    const lead = s.brigades.find((b) => b.id === assignment.brigadeId);
    if (lead)
      for (const id of assignment.objectIds) {
        const o = s.objects.find((o) => o.id === id);
        if (o)
          expect(
            rows.some(
              (r) => r.code === o.code && r.brigade === lead.code && r.day === assignment.day,
            ),
          ).toBe(true);
      }
  }
  expect(() =>
    withManualAssignment(data, { objectId: object.id, brigadeId: brigade.id, day: "2040-01-01" }),
  ).toThrow();
});
test("редактирование demo сохраняет связи графика, записи и журнал; чужая роль запрещена", () => {
  const s = { ...getSnapshot(), actorId: "u-manager" };
  const o = s.objects[0]!;
  const scheduled = {
    ...s,
    schedule: {
      rows: [
        {
          key: "k",
          objectLabel: o.label,
          code: o.code,
          brigade: s.brigades[0]!.code,
          day: s.today,
          row: 0,
        },
      ],
      fileName: "График",
      appliedAt: s.today,
      appliedBy: s.actorId,
    },
  };
  const input = {
    label: "Новый адрес",
    code: "NEW-1",
    workType: "Монтаж",
    demoStatus: "paused" as const,
  };
  const after = editedDemoObject(scheduled, o.id, input);
  expect(after.schedule?.rows[0]).toMatchObject({ code: "NEW-1", objectLabel: "Новый адрес" });
  expect(after.entries).toBe(s.entries);
  expect(after.objects.find((x) => x.id === o.id)?.demoStatus).toBe("paused");
  expect(after.audit[0]?.action).toBe("object.demo-edit");
  expect(() => editedDemoObject({ ...s, actorId: "u-foreman-1" }, o.id, input)).toThrow();
  expect(() => editedDemoObject(s, o.id, { ...input, code: s.objects[1]!.code })).toThrow();
});
