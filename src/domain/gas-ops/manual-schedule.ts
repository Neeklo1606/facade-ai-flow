import type { GasData } from "./view";
import type { ScheduleRow } from "./schedule";
import { brigadeStatus } from "./schedule";

/** Ручное назначение дополняет график; при первом действии сохраняются исходные назначения. */
export function withManualAssignment(
  data: GasData,
  input: { objectId: string; brigadeId: string; day: string },
): ScheduleRow[] {
  const object = data.objects.find((o) => o.id === input.objectId);
  const brigade = data.brigades.find((b) => b.id === input.brigadeId);
  if (!object || !brigade) throw new Error("Выберите объект и бригаду из справочника");
  if (!data.week.days.includes(input.day)) throw new Error("Выберите день текущей недели");
  if (brigadeStatus(brigade.id, data.week.from, data.brigadeAvailability ?? []) === "vacation")
    throw new Error("Бригада в отпуске. Измените доступность перед назначением");
  const rows: ScheduleRow[] = data.schedule
    ? [...data.schedule.rows]
    : data.assignments.flatMap((a) =>
        a.objectIds.flatMap((id) => {
          const o = data.objects.find((x) => x.id === id);
          const b = data.brigades.find((x) => x.id === a.brigadeId);
          return o && b
            ? [
                {
                  key: `${o.id}|${b.id}|${a.day}`,
                  objectLabel: o.label,
                  code: o.code,
                  brigade: b.code,
                  day: a.day,
                  row: 0,
                },
              ]
            : [];
        }),
      );
  const exists = rows.some(
    (r) =>
      r.day === input.day &&
      (r.code === object.code || r.objectLabel === object.label) &&
      (r.brigade === brigade.code || r.brigade === brigade.name),
  );
  if (!exists)
    rows.push({
      key: `${object.id}|${brigade.id}|${input.day}`,
      objectLabel: object.label,
      code: object.code,
      brigade: brigade.code,
      day: input.day,
      row: 0,
    });
  return rows;
}
