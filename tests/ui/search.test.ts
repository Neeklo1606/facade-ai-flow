import { describe, expect, test } from "bun:test";
import { buildGasIndex, type GasIndexInput } from "@/lib/search/gas-index";
import {
  highlight,
  normalize,
  pushRecent,
  score,
  searchIndex,
  type SearchItem,
} from "@/lib/search";

/** Поиск «Монохрома» (ADR-055, 2.6): регистр, «ё/е», номера, начала слов, права роли */

const item = (title: string, subtitle?: string): SearchItem => ({
  id: title,
  group: "objects",
  title,
  subtitle,
});

describe("сопоставление", () => {
  test("без учёта регистра и «ё/е»", () => {
    expect(normalize("  Ёлкино  Шоссе ")).toBe("елкино шоссе");
    expect(score(item("пос. Ёлкино"), "елк")).toBeGreaterThan(0);
    expect(score(item("пос. Елкино"), "ЁЛК")).toBeGreaterThan(0);
  });

  test("по началу слов, а не по середине", () => {
    expect(score(item("х. Демо-Луговой, ул. Демо, 103"), "луг")).toBeGreaterThan(0);
    expect(score(item("х. Демо-Луговой, ул. Демо, 103"), "уговой")).toBe(0);
    // Каждое слово запроса должно найтись
    expect(score(item("х. Демо-Луговой"), "дем луг")).toBeGreaterThan(0);
    expect(score(item("х. Демо-Луговой"), "дем север")).toBe(0);
  });

  test("номера без ведущих нулей и целиком", () => {
    expect(score(item("ГЗ-00042"), "42")).toBeGreaterThan(0);
    expect(score(item("ГЗ-00042"), "00042")).toBeGreaterThan(0);
    expect(score(item("ГЗ-00042"), "гз-42")).toBeGreaterThan(0);
    expect(score(item("ГЗ-00142"), "42")).toBe(0);
  });

  test("название весит больше подписи", () => {
    const results = searchIndex(
      [item("Бригада 4", "котел"), item("Котельная", "бригада 2")],
      "кот",
    );
    expect(results[0]!.items.map((i) => i.title)).toEqual(["Котельная", "Бригада 4"]);
  });

  test("подсветка начал слов, «ё» подсвечивается по «е»", () => {
    expect(highlight("пос. Ёлкино", "елк")).toEqual([
      { text: "пос. ", hit: false },
      { text: "Ёлк", hit: true },
      { text: "ино", hit: false },
    ]);
    expect(highlight("ГЗ-00042", "42")).toEqual([
      { text: "ГЗ-000", hit: false },
      { text: "42", hit: true },
    ]);
  });

  test("недавние: свежий первым, без повторов, до пяти", () => {
    let list: string[] = [];
    for (const q of ["a", "b", "c", "d", "e", "f", "B"]) list = pushRecent(list, q);
    expect(list).toEqual(["B", "f", "e", "d", "c"]);
    expect(pushRecent(list, "   ")).toEqual(list);
  });
});

/* ---------------------------------------------------------------- Права роли */

const base: GasIndexInput = {
  role: "manager",
  brigadeId: null,
  canSeeMoney: true,
  screens: new Set([
    "entries",
    "objects",
    "brigades",
    "estimates",
    "employees",
    "reports",
    "moderation",
  ]),
  entries: [
    {
      id: "e1",
      number: "ГЗ-00042",
      day: "2026-10-03",
      brigadeId: "b1",
      brigadeName: "Бригада 1",
      objectLabel: "х. Демо-Луговой, ул. Демо, 103",
      objectCode: "ОБ-103",
      amountRub: 19950,
    },
    {
      id: "e2",
      number: "ГЗ-00043",
      day: "2026-10-03",
      brigadeId: "b2",
      brigadeName: "Бригада 2",
      objectLabel: "ст. Демо-Северная, ул. Демо, 101",
      objectCode: "ОБ-101",
      amountRub: 14700,
    },
  ],
  objects: [
    {
      id: "o1",
      label: "х. Демо-Луговой, ул. Демо, 103",
      settlement: null,
      workType: null,
      code: "ОБ-103",
      source: "mock",
    },
    {
      id: "o2",
      label: "ст. Демо-Северная, ул. Демо, 101",
      settlement: null,
      workType: null,
      code: "ОБ-101",
      source: "mock",
    },
  ],
  allowedObjectIds: null,
  brigades: [{ id: "b1", name: "Бригада 1", note: "Бригадир Демо" }],
  estimates: [
    {
      estimate: {
        id: "s1",
        objectId: "o1",
        version: 2,
        amountRub: 19950,
        status: "confirmed",
        origin: "estimate",
        confirmedBy: null,
        confirmedAt: null,
        note: null,
        source: "mock",
      },
      object: null,
    },
  ],
  people: [{ id: "p1", name: "Иван Демо", brigadeName: "Бригада 1", isLead: true }],
};

const text = (items: SearchItem[]) =>
  items.map((i) => `${i.title} ${i.subtitle ?? ""} ${(i.keywords ?? []).join(" ")}`).join("\n");

describe("права роли в индексе", () => {
  test("менеджер находит записи с суммой, объекты, бригады, сметы и людей", () => {
    const index = buildGasIndex(base);
    const groups = new Set<string>(index.map((i) => i.group));
    expect([...groups].sort()).toEqual(
      ["actions", "brigades", "estimates", "objects", "people", "records"].sort(),
    );
    // Разряды Intl ru-RU разделены узким неразрывным пробелом: \s его ловит
    expect(text(index)).toMatch(/19\s950 ₽/u);
    expect(searchIndex(index, "42")[0]!.items[0]!.title).toBe("ГЗ-00042");
  });

  test("бригадир не находит сумм, чужих записей и объектов, смет и людей", () => {
    const index = buildGasIndex({
      ...base,
      role: "foreman",
      brigadeId: "b1",
      canSeeMoney: false,
      screens: new Set(["entries", "foreman"]),
      allowedObjectIds: new Set(["o1"]),
    });
    const all = text(index);
    expect(all).not.toMatch(/₽/);
    expect(all).not.toContain("ГЗ-00043");
    expect(all).not.toContain("Демо-Северная");
    expect(index.some((i) => i.group === "estimates" || i.group === "people")).toBe(false);
    expect(index.some((i) => i.group === "brigades")).toBe(false);
    // Своё находится, объект ведёт в бот
    expect(searchIndex(index, "43")).toEqual([]);
    const objects = searchIndex(index, "луг").find((g) => g.group === "objects");
    expect(objects?.items.map((i) => i.to)).toEqual(["/gas/foreman"]);
  });

  test("без права на деньги сумм нет и у не-бригадира", () => {
    const index = buildGasIndex({ ...base, role: "director", canSeeMoney: false });
    expect(text(index)).not.toMatch(/₽/);
    expect(index.some((i) => i.group === "estimates")).toBe(false);
  });

  test("группа без экрана роли в индекс не попадает", () => {
    const index = buildGasIndex({ ...base, screens: new Set(["entries"]) });
    expect(index.some((i) => i.group === "objects" || i.group === "brigades")).toBe(false);
  });

  test("ответ быстрее 100 мс на тысячах элементов", () => {
    const many: SearchItem[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `r${i}`,
      group: "records",
      title: `ГЗ-${String(i).padStart(5, "0")}`,
      subtitle: `х. Демо-Луговой, ул. Демо, ${i}`,
    }));
    const started = performance.now();
    searchIndex(many, "дем луг 42");
    expect(performance.now() - started).toBeLessThan(100);
  });
});
