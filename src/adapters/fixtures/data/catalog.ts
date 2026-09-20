import type { MaterialCategory, MaterialChange } from "@/contracts";

/**
 * Дерево категорий материалов (ADR-014, п. 5). Верхний уровень — прежние разделы спецификации:
 * по нему поставщик объявляет, что поставляет. Правила — основы слов наименования.
 */
export const materialCategories: MaterialCategory[] = [
  { id: "cat-subframe", parentId: null, name: "Подконструкция", rules: [], sortOrder: 1 },
  {
    id: "cat-brackets",
    parentId: "cat-subframe",
    name: "Кронштейны",
    rules: ["кронштейн"],
    sortOrder: 1,
  },
  {
    id: "cat-rails",
    parentId: "cat-subframe",
    name: "Направляющие профили",
    rules: ["направляющ"],
    sortOrder: 2,
  },
  { id: "cat-facing", parentId: null, name: "Облицовка", rules: [], sortOrder: 2 },
  {
    id: "cat-porcelain",
    parentId: "cat-facing",
    name: "Керамогранит",
    rules: ["керамогранит"],
    sortOrder: 1,
  },
  { id: "cat-insulation", parentId: null, name: "Утепление и мембраны", rules: [], sortOrder: 3 },
  {
    id: "cat-wool",
    parentId: "cat-insulation",
    name: "Теплоизоляция",
    rules: ["вата", "теплоизоляц", "утеплител"],
    sortOrder: 1,
  },
  {
    id: "cat-membranes",
    parentId: "cat-insulation",
    name: "Мембраны",
    rules: ["мембран"],
    sortOrder: 2,
  },
  { id: "cat-fasteners", parentId: null, name: "Крепёж", rules: [], sortOrder: 4 },
  { id: "cat-anchors", parentId: "cat-fasteners", name: "Анкеры", rules: ["анкер"], sortOrder: 1 },
  {
    id: "cat-rivets",
    parentId: "cat-fasteners",
    name: "Заклёпки",
    rules: ["заклепк"],
    sortOrder: 2,
  },
  { id: "cat-trim", parentId: null, name: "Доборные элементы", rules: [], sortOrder: 5 },
  { id: "cat-parapets", parentId: "cat-trim", name: "Парапеты", rules: ["парапет"], sortOrder: 1 },
  {
    id: "cat-strips",
    parentId: "cat-trim",
    name: "Нащельники",
    rules: ["нащельник"],
    sortOrder: 2,
  },
  {
    id: "cat-firecuts",
    parentId: "cat-trim",
    name: "Противопожарные отсечки",
    rules: ["отсечк", "противопожарн"],
    sortOrder: 3,
  },
];

/** Категория и синонимы материалов справочника; типичные написания — из проектных наименований */
export const materialCatalog: Record<string, { categoryId: string; synonyms: string[] }> = {
  "mat-bracket": { categoryId: "cat-brackets", synonyms: ["Кронштейн несущий КР-150"] },
  "mat-rail-t": { categoryId: "cat-rails", synonyms: ["Т-профиль 60×40", "Профиль Т 60×40"] },
  "mat-rail-g": {
    categoryId: "cat-rails",
    synonyms: ["Г-профиль 40×40", "Уголок направляющий 40×40"],
  },
  "mat-tile": { categoryId: "cat-porcelain", synonyms: ["Керамогранит 600×600 антрацит матовый"] },
  "mat-tile-cut": { categoryId: "cat-porcelain", synonyms: ["Керамогранит подрезка 600×600"] },
  "mat-wool": {
    categoryId: "cat-wool",
    synonyms: ["Утеплитель базальтовый 100 мм", "Каменная вата 100 мм"],
  },
  "mat-membrane": {
    categoryId: "cat-membranes",
    synonyms: ["Ветрозащитная плёнка", "Ветрогидрозащита"],
  },
  "mat-anchor": { categoryId: "cat-anchors", synonyms: ["Анкер-клин М10×100"] },
  "mat-rivet": { categoryId: "cat-rivets", synonyms: ["Заклёпка комбинированная 4×12"] },
  "mat-parapet": { categoryId: "cat-parapets", synonyms: ["Отлив парапетный", "Колпак парапета"] },
  "mat-strip": { categoryId: "cat-strips", synonyms: ["Уголок декоративный 50×50"] },
  "mat-firecut": {
    categoryId: "cat-firecuts",
    synonyms: ["Короб противопожарный", "Рассечка противопожарная"],
  },
};

/** История справочника: как он заводился и одна правка синонимов */
export const materialChanges: MaterialChange[] = [
  ...Object.keys(materialCatalog).map((materialId, index) => ({
    id: `mc-${index + 1}`,
    materialId,
    at: "2026-07-28T10:00:00",
    actorId: "e-volkova",
    field: "создан",
    before: null,
    after: null,
  })),
  {
    id: "mc-13",
    materialId: "mat-wool",
    at: "2026-08-19T15:20:00",
    actorId: "e-dorohov",
    field: "синонимы",
    before: "Утеплитель базальтовый 100 мм",
    after: "Утеплитель базальтовый 100 мм; Каменная вата 100 мм",
  },
];
