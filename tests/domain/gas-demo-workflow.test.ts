import { beforeEach, expect, test } from "bun:test";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import { editedDemoObject } from "@/api/gas-demo-workflow";
import { withManualAssignment } from "@/domain/gas-ops/manual-schedule";
import { brigadeCards, dayObjects, objectCards } from "@/domain/gas-ops/view";
import { demoSectionAllocation, emptyDemoPlan, sectionNet } from "@/domain/gas-ops/demo-allocation";

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
test("проект раздела: материалы задаёт человек; 40+35 процентов оставляют 25 процентов", () => {
  const section = { row: 450, title: "Монтаж", kopecks: 15000000 };
  const plan = emptyDemoPlan();
  expect(sectionNet(section, undefined)).toBeNull();
  expect(sectionNet(section, "-1")).toBeNull();
  plan.materials["450"] = "30000";
  plan.rows = [
    { id: "1", sectionRow: 450, brigadeId: "b1", day: "2026-10-01", percent: 40 },
    { id: "2", sectionRow: 450, brigadeId: "b2", day: "2026-10-02", percent: 35 },
  ];
  const result = demoSectionAllocation(section, plan);
  expect(result.net).toBe(12000000);
  expect(result.allocated).toBe(9000000);
  expect(result.remaining).toBe(3000000);
  expect(result.amounts.get("1")).toBe(4800000);
  expect(() =>
    demoSectionAllocation(section, {
      ...plan,
      rows: [...plan.rows, { ...plan.rows[0]!, id: "3", percent: 30 }],
    }),
  ).toThrow();
});
test("копейки проекта не теряются и не начисляются сверх стоимости", () => {
  const section = { row: 1, title: "Испытания", kopecks: 5 };
  const plan = emptyDemoPlan();
  plan.materials["1"] = "0";
  plan.rows = [
    { id: "a", sectionRow: 1, brigadeId: "b", day: "2026-10-01", percent: 50 },
    { id: "b", sectionRow: 1, brigadeId: "b", day: "2026-10-02", percent: 50 },
  ];
  const result = demoSectionAllocation(section, plan);
  expect([...result.amounts.values()].reduce((a, b) => a + b, 0)).toBe(5);
  expect(result.remaining).toBe(0);
});

test("проект не округляет недопустимые 100,001 % до допустимых 100 %", () => {
  const section = { row: 1, title: "Раздел", kopecks: 100 };
  const plan = emptyDemoPlan();
  plan.materials["1"] = "0";
  plan.rows = [{ id: "x", sectionRow: 1, brigadeId: "b", day: "2026-10-03", percent: 100.001 }];
  expect(() => demoSectionAllocation(section, plan)).toThrow();
});
