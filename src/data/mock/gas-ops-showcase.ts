/**
 * Демо-неделя для показа (ADR-062, F5). Только публичный контур «Демо-подрядчика»: личный
 * контур заказчика строится из его отчёта как есть и сюда не попадает.
 *
 * Исходный набор на показе выглядел сломанным: «получено 7 из 28», 27 причин, у объектов
 * «нет сметы». Здесь неделя здоровая:
 * - назначения дня (демо-данные и в исходном наборе) собраны на 8 объектах недели со сметой,
 *   число назначений бригад то же; Бригада 1 и её свободное окно для показа не меняются;
 * - по назначениям сегодня 28 ожиданий, получено 25: недостающие записи добавлены
 *   проверенными демо-записями бота, три ожидания остаются «Нет записи»;
 * - замечания разных типов остаются из исходного набора: непроверенные, уточнение,
 *   пересечение, состав больше бригады, объект без сметы;
 * - у 10 объектов подтверждённые сметы с версией и итогами, правило состава подтверждено.
 * Все добавленные значения синтетические и помечены `source: "mock"`.
 */
import type { Estimate, TimeEntry } from "@/domain/gas-ops/model";
import { crewOn } from "@/domain/gas-ops/crew";
import { coverage, expectations } from "@/domain/gas-ops/week";
import {
  DEFAULT_COMPANY_RULE,
  allocateByMinutes,
  confirmRule,
  ruleFormula,
  type EstimateVersion,
} from "@/domain/gas-ops/work-cost";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

const MANAGER = "u-manager";
/** Сколько ожиданий графика остаются без записи */
const LEFT_MISSING = 3;
/** Объекты недели, на которых собраны назначения и демо-сметы */
const POOL = 8;
/** Бригада показа: её назначения и окно 12:00–15:00 держит сценарий тура */
const SHOW_BRIGADE = "brg-1";
/** Условная выработка демо-сметы: рублей за час работы бригады */
const RUB_PER_HOUR = 4_200;
/** Длительности демо-записей по кругу, минуты: три записи бригады укладываются в день */
const DURATIONS = [150, 180, 120, 165, 135, 180];
/** Объектов из пула на бригаду без записей со временем сегодня */
const PICKS = 3;

function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Свободное окно бригады с 07:00: без пересечений с записями дня, у которых есть время */
function freeSlot(busy: [number, number][], minutes: number): [number, number] {
  let start = 7 * 60;
  for (const [from, to] of [...busy].sort((a, b) => a[0] - b[0])) {
    if (start + minutes <= from) break;
    start = Math.max(start, to + 15);
  }
  return [start, start + minutes];
}

const kop = (rub: number) => Math.round(rub * 100);

export function showcaseSnapshot(base: GasOpsSnapshot): GasOpsSnapshot {
  const today = base.today;
  const yesterday = dayBefore(today);

  // Объекты недели без сметы, где бригады работали чаще всего
  const count = new Map<string, number>();
  for (const e of base.entries)
    if (e.source === "fact-report" && !base.estimates.some((x) => x.objectId === e.objectId))
      count.set(e.objectId, (count.get(e.objectId) ?? 0) + 1);
  const pool = [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, POOL)
    .map(([id]) => id);

  /*
   * Бригада с записями по времени сегодня (сценарии очереди) остаётся со своими объектами
   * дня. Остальным — объекты дня плюс три из пула: три записи по времени помещаются в смену
   */
  const assignments = base.assignments.map((a, index) => {
    if (a.brigadeId === SHOW_BRIGADE || a.day !== today) return a;
    const own = base.entries.filter(
      (e) => e.brigadeId === a.brigadeId && e.day === today && e.status !== "rejected",
    );
    const covered = [...new Set(own.map((e) => e.objectId))];
    if (own.some((e) => e.startMinutes !== null)) return { ...a, objectIds: covered };
    const picks = [...pool.slice(index % POOL), ...pool.slice(0, index % POOL)]
      .filter((id) => !covered.includes(id))
      .slice(0, PICKS);
    return { ...a, objectIds: [...covered, ...picks] };
  });
  const s: GasOpsSnapshot = { ...base, assignments };

  const expected = expectations({
    days: s.week.days,
    brigades: s.brigades,
    objects: s.objects,
    schedule: s.schedule,
    assignments: s.assignments,
  });
  // Без записи остаются ожидания бригады показа и последние по порядку
  const missing = [...coverage(expected, s.entries).missing].sort(
    (a, b) => Number(a.brigadeId === SHOW_BRIGADE) - Number(b.brigadeId === SHOW_BRIGADE),
  );
  const filled = missing.slice(0, Math.max(0, missing.length - LEFT_MISSING));

  // Новые записи: проверенные менеджером, из бота, весь состав бригады
  const busy = new Map<string, [number, number][]>();
  for (const e of s.entries)
    if (e.day === today && e.startMinutes !== null && e.endMinutes !== null)
      busy.set(e.brigadeId, [...(busy.get(e.brigadeId) ?? []), [e.startMinutes, e.endMinutes]]);
  // Номера после наибольшего: номера набора идут не по порядку массива
  const top = s.entries.reduce((a, e) => Math.max(a, Number(e.number.replace(/\D/g, "")) || 0), 0);
  const added: TimeEntry[] = filled.map((x, i) => {
    const minutes = DURATIONS[i % DURATIONS.length]!;
    const [startMinutes, endMinutes] = freeSlot(busy.get(x.brigadeId) ?? [], minutes);
    busy.set(x.brigadeId, [...(busy.get(x.brigadeId) ?? []), [startMinutes, endMinutes]]);
    const lead = s.employees.find((e) => e.brigadeId === x.brigadeId && e.isLead);
    const crew = crewOn(s.crew, x.brigadeId, today).length;
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    return {
      id: `sc-${i + 1}`,
      number: `ГЗ-${String(top + i + 1).padStart(5, "0")}`,
      day: today,
      brigadeId: x.brigadeId,
      employeeId: lead?.id ?? null,
      objectId: x.objectId,
      startMinutes,
      endMinutes,
      breakMinutes: 0,
      minutes,
      amountRub: null,
      status: "confirmed",
      createdBy: lead?.id ?? MANAGER,
      createdAt: `${today}T${end}:00`,
      reviewedBy: MANAGER,
      reviewedAt: `${today}T${end}:00`,
      comment: null,
      source: "mock",
      headcount: crew > 0 ? crew : null,
      channel: "bot",
    };
  });
  const entries = [...s.entries, ...added];

  // Сметы: демо-объекты со сметой из набора и объекты назначений
  const targets = [
    ...s.estimates
      .filter((e) => e.status === "confirmed" && e.origin === "estimate")
      .map((e) => e.objectId),
    ...pool,
  ];

  const rule = confirmRule(DEFAULT_COMPANY_RULE, MANAGER, `${yesterday}T10:30:00`);
  const versions: EstimateVersion[] = [];
  const estimates: Estimate[] = [...s.estimates];
  for (const [i, objectId] of targets.entries()) {
    const own = entries.filter((e) => e.objectId === objectId && e.status !== "rejected");
    const existing = s.estimates.find((e) => e.objectId === objectId);
    const minutes = own.reduce((a, e) => a + e.minutes, 0);
    const amountRub =
      existing?.amountRub ??
      Math.max(1_000, Math.round(((minutes / 60) * RUB_PER_HOUR) / 100) * 100);
    // Итоги демо-сметы: без НДС минус материалы равно стоимости работ ровно
    const materials = Math.round(amountRub * 0.35);
    const withoutVat = amountRub + materials;
    const vat = Math.round(withoutVat * 0.22);
    const code = s.objects.find((o) => o.id === objectId)?.code ?? objectId;
    const at = `${yesterday}T${String(11 + (i % 6)).padStart(2, "0")}:00:00`;
    versions.push({
      id: `esv-sc-${i + 1}`,
      objectId,
      version: 1,
      fileName: `Демо-смета ${code}.xlsx`,
      sheet: "Смета",
      uploadedAt: at,
      uploadedBy: MANAGER,
      format: "grand",
      parseStatus: "parsed",
      totals: {
        direct: { kopecks: kop(Math.round(amountRub * 0.6)), row: 112 },
        materials: { kopecks: kop(materials), row: 113 },
        withoutVat: { kopecks: kop(withoutVat), row: 119 },
        vat: { kopecks: kop(vat), row: 120 },
        total: { kopecks: kop(withoutVat + vat), row: 121 },
      },
      vatRate: 22,
      laborHours: null,
      sections: [],
      extras: [],
      issues: [],
      issuesReviewedBy: null,
      confirmedBy: MANAGER,
      confirmedAt: at,
    });
    const estimate: Estimate = {
      id: existing?.id ?? `est-sc-${i + 1}`,
      objectId,
      version: 1,
      amountRub,
      status: "confirmed",
      origin: "estimate",
      confirmedBy: MANAGER,
      confirmedAt: at,
      note: ruleFormula(rule.terms),
      source: "mock",
    };
    const index = estimates.findIndex((e) => e.objectId === objectId);
    if (index >= 0) estimates[index] = estimate;
    else estimates.push(estimate);
    // Доля новой записи по минутам (ADR-043); суммы записей из набора не меняются
    const shares = allocateByMinutes(
      amountRub,
      own.map((e) => ({ id: e.id, minutes: e.minutes })),
    );
    for (const entry of added)
      if (entry.objectId === objectId) entry.amountRub = shares.get(entry.id) ?? null;
  }

  return {
    ...s,
    entries,
    estimates,
    estimateVersions: [...versions, ...s.estimateVersions],
    costRules: [rule],
  };
}
