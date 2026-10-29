/**
 * Индекс поиска контура «Учёт времени бригад» (ADR-055, 2.6). Данные приходят из портов
 * контура (хуки api/gas-ops), права режутся здесь, а не в палитре:
 * - бригадир находит только записи своей бригады и разрешённые ему объекты, без сумм;
 * - смет и людей у бригадира нет вовсе;
 * - группа появляется, только если у роли есть её экран.
 * Действия только те, что уже работают: «Закрыть неделю», «Новая заявка» и «Сформировать
 * АОСР» придут с S4-S6 вместе со своими экранами.
 */
import type { Estimate, Role, WorkObject } from "@/domain/gas-ops/model";
import type { SearchItem } from "./index";

export interface GasIndexEntry {
  id: string;
  number: string;
  day: string;
  brigadeId: string;
  brigadeName: string | null;
  objectLabel: string | null;
  objectCode: string | null;
  amountRub: number | null;
}

export interface GasIndexInput {
  role: Role;
  /** Бригада бригадира: его записи; у остальных ролей null */
  brigadeId: string | null;
  canSeeMoney: boolean;
  /** Экраны, открытые роли: группа без экрана в индекс не попадает */
  screens: ReadonlySet<string>;
  entries: readonly GasIndexEntry[];
  objects: readonly WorkObject[];
  /** Объекты, разрешённые бригадиру; у остальных ролей null — все */
  allowedObjectIds: ReadonlySet<string> | null;
  /** Бригада и подпись: бригадир или код */
  brigades: readonly { id: string; name: string; note: string | null }[];
  estimates: readonly { estimate: Estimate; object: WorkObject | null }[];
  people: readonly { id: string; name: string; brigadeName: string; isLead: boolean }[];
}

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const rub = (value: number) => `${money.format(value)} ₽`;

/** «2026-10-03» → «03.10» */
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

export function buildGasIndex(input: GasIndexInput): SearchItem[] {
  const foreman = input.role === "foreman";
  const items: SearchItem[] = [];

  // Действия
  if (input.role !== "director") {
    items.push({
      id: "action:time",
      group: "actions",
      title: "Внести время",
      subtitle: "Бот бригадира: объект, день, начало и конец",
      to: "/gas/foreman",
      keywords: ["запись", "смена", "часы"],
    });
  }
  if (input.screens.has("reports")) {
    items.push({
      id: "action:excel",
      group: "actions",
      title: "Выгрузить Excel",
      subtitle: "Недельный отчёт в структуре заказчика",
      to: "/gas/reports",
      keywords: ["отчет", "выгрузка", "неделя"],
    });
  }
  items.push({
    id: "action:theme",
    group: "actions",
    title: "Сменить тему",
    subtitle: "Светлая или тёмная",
    action: "theme",
    keywords: ["темная", "светлая", "оформление"],
  });

  // Записи: бригадир видит только свою бригаду и без сумм
  for (const entry of input.entries) {
    if (foreman && entry.brigadeId !== input.brigadeId) continue;
    const parts = [shortDay(entry.day), entry.objectLabel ?? "объект не найден"];
    if (!foreman && entry.brigadeName) parts.push(entry.brigadeName);
    if (input.canSeeMoney && !foreman && entry.amountRub !== null) parts.push(rub(entry.amountRub));
    items.push({
      id: `record:${entry.id}`,
      group: "records",
      title: entry.number,
      subtitle: parts.join(" · "),
      to: "/gas/entries",
      search: { q: entry.number },
      keywords: [entry.objectCode ?? "", entry.brigadeName ?? ""],
    });
  }

  // Объекты: бригадиру только разрешённые, они ведут в бот
  for (const object of input.objects) {
    if (input.allowedObjectIds && !input.allowedObjectIds.has(object.id)) continue;
    if (!foreman && !input.screens.has("objects")) continue;
    items.push({
      id: `object:${object.id}`,
      group: "objects",
      title: object.label,
      subtitle: object.code,
      to: foreman ? "/gas/foreman" : "/gas/objects",
      keywords: [object.code, object.settlement ?? "", object.workType ?? ""],
    });
  }

  if (!foreman && input.screens.has("brigades")) {
    for (const brigade of input.brigades) {
      items.push({
        id: `brigade:${brigade.id}`,
        group: "brigades",
        title: brigade.name,
        subtitle: brigade.note ?? undefined,
        to: "/gas/brigades",
      });
    }
  }

  // Сметы и деньги: только ролям с экраном стоимости и правом видеть суммы
  if (!foreman && input.canSeeMoney && input.screens.has("estimates")) {
    for (const { estimate, object } of input.estimates) {
      items.push({
        id: `estimate:${estimate.id}`,
        group: "estimates",
        title: object?.label ?? "Объект не найден",
        subtitle:
          estimate.status === "missing"
            ? "нет источника суммы"
            : `${rub(estimate.amountRub)}, версия ${estimate.version}`,
        to: "/gas/estimates",
        keywords: [object?.code ?? "", "смета", "стоимость"],
      });
    }
  }

  if (!foreman && input.screens.has("employees")) {
    for (const person of input.people) {
      items.push({
        id: `person:${person.id}`,
        group: "people",
        title: person.name,
        subtitle: `${person.brigadeName}${person.isLead ? ", бригадир" : ""}`,
        to: "/gas/employees",
      });
    }
  }

  return items;
}
