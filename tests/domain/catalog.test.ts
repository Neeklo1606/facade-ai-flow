import { describe, expect, test } from "bun:test";
import type { Delivery, MaterialCategory, SupplierOffer, SupplyRequest } from "@/contracts";
import {
  SUGGESTION_THRESHOLD,
  categoryFor,
  contactFreshness,
  normalizeText,
  stems,
  suggestMaterial,
  supplierStats,
  suppliersFor,
  topCategory,
} from "@/domain/catalog";

/** Правила номенклатуры, категорий и поставщиков — ADR-014. Ожидания посчитаны по тексту ADR. */

const catalog = [
  {
    id: "mat-bracket",
    name: "Кронштейн стеновой КР-150, сталь оцинкованная",
    synonyms: ["Кронштейн несущий КР-150"],
    spellings: ["Кронштейн КР-150 оцинкованный"],
  },
  {
    id: "mat-tile",
    name: "Плита керамогранитная 600×600×10, антрацит, матовая",
    synonyms: [],
    spellings: ["Керамогранит 600×600 антрацит"],
  },
  {
    id: "mat-tile-cut",
    name: "Плита керамогранитная 600×600×10, антрацит, подрезка",
    synonyms: [],
    spellings: ["Керамогранит 600×600 антрацит, подрезка"],
  },
];

const category = (
  id: string,
  parentId: string | null,
  name: string,
  rules: string[] = [],
  sortOrder = 1,
): MaterialCategory => ({ id, parentId, name, rules, sortOrder });

const tree: MaterialCategory[] = [
  category("cat-subframe", null, "Подконструкция"),
  category("cat-brackets", "cat-subframe", "Кронштейны", ["кронштейн"]),
  category("cat-rails", "cat-subframe", "Направляющие", ["направляющ"], 2),
  category("cat-trim", null, "Доборные элементы", ["отлив"], 5),
  category("cat-parapets", "cat-trim", "Парапеты", ["парапет", "отлив парапет"]),
];

describe("normalizeText и stems", () => {
  test("регистр, «ё» и знаки не важны", () => {
    expect(normalizeText("Заклёпка «Вытяжная», 4×12.")).toBe("заклепка вытяжная 4×12");
  });

  test("слово длиннее пяти букв — основа из пяти, короткие слова и марки целиком", () => {
    expect(stems("Кронштейн КР-150 оцинкованный")).toEqual(["кронш", "кр-150", "оцинк"]);
    expect(stems("Анкер 10×100")).toEqual(["анкер", "10×100"]);
  });
});

describe("suggestMaterial", () => {
  test("проектное наименование длиннее образца — лишние слова не штрафуют", () => {
    // Образец «Кронштейн КР-150 оцинкованный»: 3 основы, все есть в наименовании → 1.
    // Синоним «Кронштейн несущий КР-150» — 2 из 3: «несущий» в этом наименовании нет
    const hit = suggestMaterial(
      "Кронштейн КР-150 оцинкованный, опорный, захватка 1, оси А–Г, эт. 1–3",
      catalog,
    );
    expect(hit).toEqual({
      materialId: "mat-bracket",
      score: 1,
      matchedBy: "Кронштейн КР-150 оцинкованный",
    });
  });

  test("при равной оценке побеждает более длинный образец — подрезка не путается с плитой", () => {
    // «…антрацит, подрезка»: оба написания совпадают полностью (1), у подрезки 5 основ против 4
    const cut = suggestMaterial("Керамогранит 600×600 антрацит, подрезка, фасад А", catalog);
    expect(cut?.materialId).toBe("mat-tile-cut");
    // Без «подрезка»: у подрезки 4 из 5 = 0,8, у плиты 4 из 4 = 1
    const whole = suggestMaterial("Керамогранит 600×600 антрацит, фасад А", catalog);
    expect(whole?.materialId).toBe("mat-tile");
  });

  test("ниже порога — предложения нет", () => {
    expect(SUGGESTION_THRESHOLD).toBe(0.6);
    // «Кронштейн» — 1 из 3 основ лучшего образца = 0,33 < 0,6
    expect(suggestMaterial("Кронштейн угловой усиленный", catalog)).toBeNull();
    expect(suggestMaterial("Совсем другой материал", catalog)).toBeNull();
  });

  test("ровно на пороге предложение есть", () => {
    // Образец из 5 основ, найдено 3 → 0,6
    const five = [
      { id: "m", name: "альфа бета гамма дельта эпсилон", synonyms: [], spellings: [] },
    ];
    expect(suggestMaterial("альфа бета гамма", five)?.score).toBe(0.6);
  });

  test("синоним тоже образец", () => {
    expect(suggestMaterial("Кронштейн несущий КР-150", catalog)?.materialId).toBe("mat-bracket");
  });

  test("пустой справочник — предложения нет", () => {
    expect(suggestMaterial("Кронштейн КР-150 оцинкованный", [])).toBeNull();
  });
});

describe("topCategory и categoryFor", () => {
  test("верхний уровень для листа и для себя самого", () => {
    expect(topCategory("cat-brackets", tree)?.id).toBe("cat-subframe");
    expect(topCategory("cat-subframe", tree)?.id).toBe("cat-subframe");
    expect(topCategory("нет-такой", tree)).toBeNull();
  });

  test("категория по правилу, из нескольких совпавших — глубже в дереве", () => {
    expect(categoryFor("Кронштейн стеновой КР-150", tree)?.id).toBe("cat-brackets");
    // «отлив» есть и у «Доборных» (уровень 0), и у «Парапетов» (уровень 1) — точнее «Парапеты»
    expect(categoryFor("Отлив парапетный оцинкованный", tree)?.id).toBe("cat-parapets");
  });

  test("ни одно правило не подошло — категории нет", () => {
    expect(categoryFor("Саморез по металлу", tree)).toBeNull();
  });
});

describe("suppliersFor", () => {
  const profiles = [
    { supplierId: "far-both", region: "Казань", categories: ["cat-subframe", "cat-trim"] },
    { supplierId: "near-one", region: "Москва", categories: ["cat-subframe"] },
    { supplierId: "near-both", region: "Москва", categories: ["cat-trim", "cat-subframe"] },
    { supplierId: "near-other", region: "Москва", categories: ["cat-facing"] },
  ];

  test("только с пересечением категорий; свой регион первым, затем по числу категорий", () => {
    const result = suppliersFor(["cat-subframe", "cat-trim"], "Москва", profiles);
    expect(result.map((r) => r.supplierId)).toEqual(["near-both", "near-one", "far-both"]);
    expect(result[0]).toEqual({
      supplierId: "near-both",
      matched: ["cat-trim", "cat-subframe"],
      regionMatch: true,
    });
  });

  test("нет нужных категорий — никого", () => {
    expect(suppliersFor([], "Москва", profiles)).toEqual([]);
  });
});

describe("contactFreshness", () => {
  const now = "2026-09-20T10:00:00";
  test("до 90 дней включительно — проверен", () => {
    expect(contactFreshness("2026-09-20", now)).toBe("verified");
    // 22.06 → 20.09: 90 дней
    expect(contactFreshness("2026-06-22", now)).toBe("verified");
  });
  test("91–180 дней — требует проверки", () => {
    expect(contactFreshness("2026-06-21", now)).toBe("needs_check");
    // 24.03 → 20.09: 180 дней
    expect(contactFreshness("2026-03-24", now)).toBe("needs_check");
  });
  test("больше 180 дней — устарел", () => {
    expect(contactFreshness("2026-03-23", now)).toBe("stale");
  });
});

describe("supplierStats", () => {
  const request = (id: string, sentTo: string[], sentAt: string | null): SupplyRequest =>
    ({ id, sentTo, sentAt }) as SupplyRequest;
  const offer = (requestId: string, supplierId: string, receivedAt: string): SupplierOffer =>
    ({ requestId, supplierId, receivedAt }) as SupplierOffer;
  const delivery = (supplierId: string, expectedAt: string, receivedAt: string | null): Delivery =>
    ({ supplierId, expectedAt, receivedAt }) as Delivery;

  test("время ответа — среднее по фактическим ответам; доля в срок — по принятым поставкам", () => {
    const stats = supplierStats("s1", {
      requests: [
        request("r1", ["s1", "s2"], "2026-09-01T10:00:00"),
        request("r2", ["s1"], "2026-09-05T08:00:00"),
        request("r3", ["s1"], "2026-09-06T08:00:00"),
        request("r4", ["s2"], "2026-09-06T08:00:00"),
      ],
      offers: [
        offer("r1", "s1", "2026-09-02T10:00:00"), // 24 ч
        offer("r2", "s1", "2026-09-05T20:00:00"), // 12 ч
        offer("r4", "s2", "2026-09-06T09:00:00"), // чужой
      ],
      deliveries: [
        delivery("s1", "2026-09-10", "2026-09-10T15:00:00"), // в срок: день в день
        delivery("s1", "2026-09-10", "2026-09-11T09:00:00"), // опоздание
        delivery("s1", "2026-09-12", null), // ещё не принята — не считается
        delivery("s2", "2026-09-10", "2026-09-09T09:00:00"), // чужая
      ],
    });
    expect(stats).toEqual({
      requests: 3,
      answered: 2,
      avgReplyHours: 18, // (24 + 12) / 2
      onTimeShare: 0.5, // 1 из 2 принятых
      deliveriesReceived: 2,
    });
  });

  test("нет ответов и поставок — не ноль, а «нет данных»", () => {
    expect(supplierStats("s9", { requests: [], offers: [], deliveries: [] })).toEqual({
      requests: 0,
      answered: 0,
      avgReplyHours: null,
      onTimeShare: null,
      deliveriesReceived: 0,
    });
  });
});
