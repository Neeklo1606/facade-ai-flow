import { describe, expect, test } from "bun:test";
import { lastEntryBefore, sameAsYesterday, type FieldEntry } from "@/domain/gas-ops/field";

/** «Как вчера» и значения по умолчанию из прошлой записи (финальный промт, 2.2; ADR-064) */
const entry = (over: Partial<FieldEntry>): FieldEntry => ({
  id: over.id ?? "e",
  number: "ГЗ-1",
  day: "2026-10-02",
  objectId: "o1",
  objectLabel: "ул. Демо, 1",
  startMinutes: 480,
  endMinutes: 1020,
  breakMinutes: 45,
  minutes: 495,
  headcount: 3,
  people: null,
  note: null,
  status: "pending",
  statusLabel: "ждёт проверки",
  question: null,
  channel: null,
  createdAt: "2026-10-02T18:00:00",
  clientKey: null,
  locked: false,
  ...over,
});

describe("как вчера", () => {
  const base = { yesterday: "2026-10-02", today: "2026-10-03", todayObjectIds: ["o1", "o2"] };

  test("вчерашняя запись на объект сегодняшнего графика", () => {
    const y = entry({ id: "y" });
    expect(sameAsYesterday({ ...base, entries: [y] })?.id).toBe("y");
  });

  test("нет кнопки: объект не по графику, уже внесено сегодня, отклонено, люди с разным временем", () => {
    expect(sameAsYesterday({ ...base, entries: [entry({ objectId: "o9" })] })).toBeNull();
    expect(
      sameAsYesterday({
        ...base,
        entries: [entry({ id: "y" }), entry({ id: "t", day: "2026-10-03" })],
      }),
    ).toBeNull();
    expect(sameAsYesterday({ ...base, entries: [entry({ status: "rejected" })] })).toBeNull();
    expect(
      sameAsYesterday({
        ...base,
        entries: [
          entry({
            people: [
              { employeeId: "x", start: 480, end: 900, breakMinutes: 0, minutes: 420 },
            ] as unknown as FieldEntry["people"],
          }),
        ],
      }),
    ).toBeNull();
  });

  test("прошлая запись до дня: последняя, без черновиков и отклонённых", () => {
    const list = [
      entry({ id: "a", day: "2026-09-30" }),
      entry({ id: "b", day: "2026-10-01" }),
      entry({ id: "c", day: "2026-10-02", status: "draft" }),
      entry({ id: "d", day: "2026-10-03" }),
    ];
    expect(lastEntryBefore(list, "2026-10-03")?.id).toBe("b");
    expect(lastEntryBefore([], "2026-10-03")).toBeNull();
    // Перерыв 0 из выгрузки — «не указан», образцом не служит
    expect(lastEntryBefore([entry({ breakMinutes: 0 })], "2026-10-03")).toBeNull();
  });
});
