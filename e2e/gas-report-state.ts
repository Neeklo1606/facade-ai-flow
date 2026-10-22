/**
 * Состояние вкладки для проверок отчёта (ADR-044, F6): исходный набор плюс запись показа
 * по ОБ-200, которую бригадир внёс 12:00–14:30, а менеджер подтвердил. Вход руководителем.
 *
 * Ключ и версия снимка повторяют `src/adapters/gas-ops/state.ts`: тест кладёт снимок
 * туда же, откуда его поднимает оболочка раздела.
 */
import { buildSeed, GAS_TODAY } from "@/data/mock/gas-ops-seed";
import type { TimeEntry } from "@/domain/gas-ops/model";

/** Отчёт сверяется с файлом заказчика: снимок кладётся в его личный контур (ADR-047) */
export const GAS_STATE_KEY = "neeklo-gas-ops-v1:client";
export const GAS_STATE_VERSION = 3;
export const SHOW_ENTRY_ID = "ent-show-m200";

export function reportState(): string {
  const seed = buildSeed();
  const template = seed.entries.find((e) => e.brigadeId === "brg-1" && e.source === "mock")!;
  const show: TimeEntry = {
    ...template,
    id: SHOW_ENTRY_ID,
    number: "ГЗ-00104",
    day: GAS_TODAY,
    employeeId: "emp-1-1",
    objectId: "obj-m200",
    startMinutes: 12 * 60,
    endMinutes: 14 * 60 + 30,
    breakMinutes: 0,
    minutes: 150,
    amountRub: 14_700,
    status: "confirmed",
    createdBy: "emp-1-1",
    createdAt: `${GAS_TODAY}T14:35:00`,
    reviewedBy: "u-manager",
    reviewedAt: `${GAS_TODAY}T14:40:00`,
    comment: null,
    source: "mock",
  };
  const snapshot = {
    today: seed.today,
    week: seed.week,
    groups: seed.groups,
    brigades: seed.brigades,
    employees: seed.employees,
    objects: seed.objects,
    estimates: seed.estimates,
    entries: [...seed.entries, show],
    reviews: seed.reviews,
    audit: seed.audit,
    frames: seed.frames,
    assignments: seed.assignments,
    users: seed.users,
    actorId: "u-director",
  };
  return JSON.stringify({ version: GAS_STATE_VERSION, snapshot });
}
