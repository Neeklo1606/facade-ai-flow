import type {
  Characteristic,
  DocumentRevisionRow,
  DocumentSheetRow,
  ExtractedPosition,
  Material,
  PositionChange,
  PositionRow,
  PurchaseStatus,
  ReplacementSuggestion,
  SupplyRequestLine,
  SupplyRequestPosition,
} from "@/contracts";
import { SHEET_TABLE } from "@/lib/sheet-geometry";

/**
 * Спецификация «Северной Короны»: справочник материалов, листы ревизий и генератор 847 позиций.
 * Данные детерминированы: одинаковые при каждом запуске, на сервере и в браузере.
 */

export const SPEC_REVISION_ID = "pd-korona-spec";
export const SPEC_TOTAL = 847;
export const SPEC_CONFIRMED = 312;

interface Family {
  material: string;
  family: string;
  base: string;
  normalized: string;
  unit: string;
  characteristics: (i: number) => Characteristic[];
  qty: (i: number) => number;
  variant: (i: number) => string;
}

const zones = [
  "захватка 1, оси А–Г",
  "захватка 2, оси Г–К",
  "захватка 3, оси К–Р",
  "стилобат, оси А–Р",
];

function floors(i: number) {
  const from = 1 + ((i * 5) % 16);
  return `эт. ${from}–${from + 2}`;
}

/** Детерминированное псевдослучайное число из индекса: одинаковые данные при каждом запуске. */
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const families: Record<number, Family> = {
  84: {
    material: "mat-bracket",
    family: "bracket",
    base: "Кронштейн КР-150 оцинкованный",
    normalized: "Кронштейн стеновой КР-150, сталь оцинкованная",
    unit: "шт",
    variant: (i) => `${i % 3 === 0 ? "несущий" : "опорный"}, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: (i) => [
      { label: "Материал", value: "сталь 08пс, горячее цинкование" },
      { label: "Толщина", value: "2 мм" },
      { label: "Вылет", value: `${[150, 180, 200][i % 3]} мм` },
      { label: "Покрытие", value: "Zn 275 г/м²" },
    ],
    qty: (i) => 40 + Math.round(seeded(i, 1) * 26) * 10,
  },
  85: {
    material: "mat-rail-t",
    family: "rail",
    base: "Направляющая Т-образная 60×40",
    normalized: "Профиль направляющий Т-образный 60×40, АД31",
    unit: "пог. м",
    variant: (i) => `L=${[3000, 3200, 3600][i % 3]} мм, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: (i) => [
      { label: "Сплав", value: "АД31 Т1" },
      { label: "Толщина стенки", value: "2 мм" },
      { label: "Длина", value: `${[3000, 3200, 3600][i % 3]} мм` },
    ],
    qty: (i) => 60 + Math.round(seeded(i, 2) * 30) * 6,
  },
  86: {
    material: "mat-rail-g",
    family: "rail",
    base: "Направляющая Г-образная 40×40",
    normalized: "Профиль направляющий Г-образный 40×40, АД31",
    unit: "пог. м",
    variant: (i) => `откосы, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: () => [
      { label: "Сплав", value: "АД31 Т1" },
      { label: "Толщина стенки", value: "1,8 мм" },
    ],
    qty: (i) => 24 + Math.round(seeded(i, 3) * 20) * 4,
  },
  87: {
    material: "mat-tile",
    family: "tile",
    base: "Керамогранит 600×600 антрацит",
    normalized: "Плита керамогранитная 600×600×10, антрацит, матовая",
    unit: "м²",
    variant: (i) => `основное поле, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: () => [
      { label: "Толщина", value: "10 мм" },
      { label: "Поверхность", value: "матовая" },
      { label: "Водопоглощение", value: "≤ 0,5 %" },
      { label: "Морозостойкость", value: "F100" },
    ],
    qty: (i) => 80 + Math.round(seeded(i, 4) * 30) * 8,
  },
  88: {
    material: "mat-tile-cut",
    family: "tile",
    base: "Керамогранит 600×600 антрацит, подрезка",
    normalized: "Плита керамогранитная 600×600×10, антрацит, подрезка",
    unit: "м²",
    variant: (i) => `${i % 2 ? "откосы" : "углы"}, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: () => [
      { label: "Толщина", value: "10 мм" },
      { label: "Поверхность", value: "матовая" },
      { label: "Кромка", value: "ректифицированная" },
    ],
    qty: (i) => 6 + Math.round(seeded(i, 5) * 18) * 2,
  },
  89: {
    material: "mat-wool",
    family: "wool",
    base: "Минеральная вата 100 мм",
    normalized: "Плита теплоизоляционная из каменной ваты 100 мм",
    unit: "м²",
    variant: (i) => `${i % 2 ? "наружный слой" : "внутренний слой"}, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: (i) => [
      { label: "Плотность", value: i % 2 ? "90 кг/м³" : "45 кг/м³" },
      { label: "Горючесть", value: "НГ" },
      { label: "Теплопроводность", value: "λ = 0,037 Вт/(м·К)" },
    ],
    qty: (i) => 90 + Math.round(seeded(i, 6) * 30) * 8,
  },
  90: {
    material: "mat-membrane",
    family: "membrane",
    base: "Мембрана ветрозащитная",
    normalized: "Мембрана ветрогидрозащитная паропроницаемая",
    unit: "м²",
    variant: (i) => `${zones[i % 4]}, ${floors(i)}`,
    characteristics: () => [
      { label: "Паропроницаемость", value: "≥ 1200 г/м²·сут" },
      { label: "Горючесть", value: "Г1" },
    ],
    qty: (i) => 100 + Math.round(seeded(i, 7) * 30) * 8,
  },
  91: {
    material: "mat-anchor",
    family: "anchor",
    base: "Анкер клиновой 10×100",
    normalized: "Анкер клиновой оцинкованный М10×100",
    unit: "шт",
    variant: (i) =>
      `${i % 3 === 0 ? "несущие кронштейны" : "опорные кронштейны"}, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: () => [
      { label: "Материал", value: "сталь оцинкованная" },
      { label: "Основание", value: "бетон B25" },
      { label: "Вырыв", value: "≥ 3,5 кН" },
    ],
    qty: (i) => 80 + Math.round(seeded(i, 8) * 26) * 12,
  },
  92: {
    material: "mat-rivet",
    family: "rivet",
    base: "Заклёпка вытяжная 4×12",
    normalized: "Заклёпка вытяжная 4,0×12, Al/нерж.",
    unit: "шт",
    variant: (i) => `${i % 2 ? "крепление облицовки" : "крепление направляющих"}, ${zones[i % 4]}`,
    characteristics: () => [
      { label: "Материал", value: "алюминий / нержавеющая сталь" },
      { label: "Диаметр", value: "4,0 мм" },
    ],
    qty: (i) => 400 + Math.round(seeded(i, 9) * 40) * 50,
  },
  93: {
    material: "mat-parapet",
    family: "parapet",
    base: "Парапетная крышка",
    normalized: "Крышка парапетная, сталь с полимерным покрытием",
    unit: "пог. м",
    variant: (i) => `развёртка ${[390, 500, 625][i % 3]} мм, ${zones[i % 4]}`,
    characteristics: (i) => [
      { label: "Материал", value: "сталь 0,7 мм, полиэстер" },
      { label: "Цвет", value: "RAL 7016" },
      { label: "Развёртка", value: `${[390, 500, 625][i % 3]} мм` },
    ],
    qty: (i) => 12 + Math.round(seeded(i, 10) * 20) * 2,
  },
  94: {
    material: "mat-strip",
    family: "strip",
    base: "Нащельник угловой",
    normalized: "Нащельник угловой 50×50, RAL 7016",
    unit: "шт",
    variant: (i) => `${i % 2 ? "внешний угол" : "внутренний угол"}, ${zones[i % 4]}, ${floors(i)}`,
    characteristics: () => [
      { label: "Размер", value: "50×50 мм" },
      { label: "Материал", value: "сталь 0,5 мм, полиэстер" },
      { label: "Цвет", value: "RAL 7016" },
    ],
    qty: (i) => 4 + Math.round(seeded(i, 11) * 12) * 2,
  },
  95: {
    material: "mat-firecut",
    family: "firecut",
    base: "Противопожарная отсечка",
    normalized: "Отсечка противопожарная, сталь оцинкованная 0,55 мм",
    unit: "пог. м",
    variant: (i) => `${zones[i % 4]}, ${floors(i)}`,
    characteristics: () => [
      { label: "Материал", value: "сталь оцинкованная 0,55 мм" },
      { label: "Ширина", value: "200 мм" },
      { label: "Предел огнестойкости", value: "EI 45" },
    ],
    qty: (i) => 20 + Math.round(seeded(i, 12) * 20) * 3,
  },
};

export const sheetPlan: {
  group: string;
  sheets: { number: number; title: string; rows: number }[];
}[] = [
  {
    group: "Подконструкция",
    sheets: [
      { number: 84, title: "Кронштейны стеновые", rows: 78 },
      { number: 85, title: "Направляющие Т-образные", rows: 74 },
      { number: 86, title: "Направляющие Г-образные", rows: 62 },
    ],
  },
  {
    group: "Облицовка",
    sheets: [
      { number: 87, title: "Керамогранит, основное поле", rows: 80 },
      { number: 88, title: "Керамогранит, откосы и углы", rows: 66 },
    ],
  },
  {
    group: "Утепление и мембраны",
    sheets: [
      { number: 89, title: "Минеральная вата", rows: 72 },
      { number: 90, title: "Мембрана ветрозащитная", rows: 58 },
    ],
  },
  {
    group: "Крепёж",
    sheets: [
      { number: 91, title: "Анкеры", rows: 76 },
      { number: 92, title: "Заклёпки", rows: 70 },
    ],
  },
  {
    group: "Доборные элементы",
    sheets: [
      { number: 93, title: "Парапетные крышки", rows: 64 },
      { number: 94, title: "Нащельники", rows: 77 },
      { number: 95, title: "Противопожарные отсечки", rows: 70 },
    ],
  },
];

const purchaseBySheet: Record<
  number,
  { status: PurchaseStatus; requestIds: string[]; split?: PurchaseStatus }
> = {
  84: { status: "delivered", requestIds: ["sr-318"], split: "supplier_selected" },
  85: { status: "delivered", requestIds: ["sr-318"], split: "supplier_selected" },
  86: { status: "supplier_selected", requestIds: ["sr-318"] },
  87: { status: "offers", requestIds: ["sr-323"] },
  88: { status: "requested", requestIds: ["sr-323"] },
  89: { status: "ordered", requestIds: ["sr-324"], split: "delivered" },
  90: { status: "ordered", requestIds: ["sr-324"] },
  91: { status: "requested", requestIds: ["sr-322"] },
  92: { status: "requested", requestIds: ["sr-325"] },
  93: { status: "none", requestIds: [] },
  94: { status: "requested", requestIds: ["sr-319"] },
  95: { status: "requested", requestIds: ["sr-322"] },
};

const lowConfidenceNotes: Record<number, string> = {
  93: "Количество на листе указано «по месту», в таблице пусто — нужен расчёт по контуру кровли.",
  92: "Ячейка количества перечёркнута от руки, распознанное значение не совпадает с итогом листа.",
};

const clarifyNotes = [
  "Единица измерения в строке не указана, взята из заголовка столбца.",
  "Количество читается как 1 480 или 1 430 — плохое качество скана.",
  "Наименование переносится на следующую строку, возможна склейка с соседней позицией.",
  "Характеристики указаны сноской внизу листа.",
];

/* ---------- Справочник материалов ---------- */

export const materials: Material[] = Object.values(families).map((item) => ({
  id: item.material,
  family: item.family,
  name: item.normalized,
  unit: item.unit,
}));

/* ---------- Листы ревизий ---------- */

/** Листы ревизии: у спецификации — реальная структура, у остальных — сквозная нумерация. */
export function sheetsOf(
  revision: Pick<DocumentRevisionRow, "id" | "sheetCount">,
  section: string,
) {
  if (revision.id === SPEC_REVISION_ID) {
    return sheetPlan.flatMap((group) =>
      group.sheets.map((sheet): DocumentSheetRow => ({
        id: `sh-${sheet.number}`,
        revisionId: revision.id,
        number: sheet.number,
        title: sheet.title,
        groupName: group.group,
      })),
    );
  }
  return Array.from({ length: revision.sheetCount }, (_, index): DocumentSheetRow => ({
    id: `${revision.id}-sh-${index + 1}`,
    revisionId: revision.id,
    number: index + 1,
    title: index === 0 ? "Общие данные" : `Лист ${index + 1}`,
    groupName: section,
  }));
}

/* ---------- Позиции ---------- */

interface GeneratedPosition {
  row: PositionRow;
  /** Запрос, в который вошла проверенная позиция */
  requestId: string | null;
}

function buildSpecPositions(): GeneratedPosition[] {
  const rows: {
    row: Omit<PositionRow, "review" | "reviewedBy" | "reviewedAt" | "purchase" | "handedOverAt">;
    sheetNumber: number;
  }[] = [];
  let g = 0;
  sheetPlan.forEach((group, groupIndex) => {
    let inGroup = 0;
    for (const sheet of group.sheets) {
      const family = families[sheet.number]!;
      const rowH = (SHEET_TABLE.bottom - SHEET_TABLE.top) / sheet.rows;
      for (let r = 0; r < sheet.rows; r++) {
        inGroup += 1;
        const i = g + 1;
        rows.push({
          sheetNumber: sheet.number,
          row: {
            id: `pos-${String(i).padStart(4, "0")}`,
            projectId: "p-korona",
            revisionId: SPEC_REVISION_ID,
            sheetId: `sh-${sheet.number}`,
            position: `${groupIndex + 1}.${inGroup}`,
            family: family.family,
            projectName: `${family.base}, ${family.variant(r)}`,
            materialId: family.material,
            characteristics: family.characteristics(r),
            qty: family.qty(i),
            unit: family.unit,
            confidence: 0.86 + seeded(i, 20) * 0.13,
            region: {
              x: SHEET_TABLE.left,
              y: SHEET_TABLE.top + r * rowH,
              w: SHEET_TABLE.right - SHEET_TABLE.left,
              h: rowH,
            },
            note: null,
            mergedInto: null,
          },
        });
        g += 1;
      }
    }
  });

  // Ровно 312 позиций подтверждены человеком: 37 взаимно просто с 847, отбор равномерный по документу
  const confirmedFlags = rows.map((_, index) => (index * 37) % SPEC_TOTAL < SPEC_CONFIRMED);
  const sheetCounter = new Map<number, number>();
  let k = 0;
  let u = 0;
  const lowSheets = new Set([93, 92]);

  return rows.map(({ row, sheetNumber }, index) => {
    if (confirmedFlags[index]) {
      const kk = k++;
      const inSheet = sheetCounter.get(sheetNumber) ?? 0;
      sheetCounter.set(sheetNumber, inSheet + 1);
      const plan = purchaseBySheet[sheetNumber]!;
      const purchase: PurchaseStatus = plan.split && inSheet % 3 === 2 ? plan.split : plan.status;
      const reviewedAt = `2026-09-0${1 + (kk % 5)}T${String(9 + (kk % 8)).padStart(2, "0")}:${String((kk * 7) % 60).padStart(2, "0")}:00`;
      return {
        requestId: purchase === "none" ? null : (plan.requestIds[0] ?? null),
        row: {
          ...row,
          // 47 проверенных позиций без нормализованного наименования, 12 — без характеристик
          materialId: (kk * 149 + 17) % SPEC_CONFIRMED < 47 ? null : row.materialId,
          characteristics: (kk * 97 + 31) % SPEC_CONFIRMED < 12 ? [] : row.characteristics,
          review: kk % 9 === 0 ? "corrected" : "confirmed",
          reviewedBy: kk % 4 === 0 ? "e-sokolov" : "e-volkova",
          reviewedAt,
          handedOverAt: reviewedAt,
          purchase,
        },
      };
    }

    const uu = u++;
    let confidence = row.confidence;
    let note: string | null = null;
    let qty = row.qty;
    if (lowSheets.has(sheetNumber)) {
      lowSheets.delete(sheetNumber);
      confidence = 0.42 + seeded(index, 30) * 0.14;
      note = lowConfidenceNotes[sheetNumber] ?? null;
      qty = sheetNumber === 93 ? 0 : row.qty;
    } else if (uu % 61 === 5) {
      confidence = 0.72 + seeded(index, 31) * 0.1;
      note = clarifyNotes[uu % clarifyNotes.length] ?? null;
    }
    return {
      requestId: null,
      row: {
        ...row,
        confidence,
        note,
        qty,
        materialId: uu % 13 === 0 ? null : row.materialId,
        review: "pending",
        reviewedBy: null,
        reviewedAt: null,
        handedOverAt: null,
        purchase: "none",
      },
    };
  });
}

const generated = buildSpecPositions();

export const positions: PositionRow[] = generated.map((item) => item.row);

/** Связь проверенных позиций со строками запросов: строка того же семейства материала. */
export function requestPositionsOf(
  lines: SupplyRequestLine[],
  materialFamily: (materialId: string | null) => string | null,
): SupplyRequestPosition[] {
  return generated.flatMap(({ row, requestId }) => {
    if (!requestId) return [];
    const line =
      lines.find((item) => item.requestId === requestId && item.materialId === row.materialId) ??
      lines.find(
        (item) => item.requestId === requestId && materialFamily(item.materialId) === row.family,
      );
    return line ? [{ requestLineId: line.id, positionId: row.id }] : [];
  });
}

/** История для проверенных позиций: что предложила обработка и что поставил человек. */
export const positionChanges: PositionChange[] = positions.flatMap((item, index) => {
  if (item.review === "pending") return [];
  const extracted: PositionChange = {
    id: `pc-${item.id}-1`,
    positionId: item.id,
    at: "2026-08-27T11:33:00",
    actorKind: "system",
    actorId: null,
    action: `Извлечено из листа ${item.sheetId.replace("sh-", "")}`,
    before: null,
    after: `${item.qty} ${item.unit}`,
  };
  const reviewed = { actorKind: "user" as const, actorId: item.reviewedBy, at: item.reviewedAt! };
  if (item.review === "corrected") {
    const before = Math.round(item.qty * (index % 2 ? 1.1 : 0.9));
    return [
      { ...extracted, after: `${before} ${item.unit}` },
      {
        id: `pc-${item.id}-2`,
        positionId: item.id,
        ...reviewed,
        action: "Исправлено количество",
        before: `${before} ${item.unit}`,
        after: `${item.qty} ${item.unit}`,
      },
    ];
  }
  return [
    extracted,
    {
      id: `pc-${item.id}-2`,
      positionId: item.id,
      ...reviewed,
      action: "Подтверждено",
      before: null,
      after: null,
    },
  ];
});

/* ---------- Замены ---------- */

const REPLACEMENTS: ReplacementSuggestion[] = [
  {
    id: "rp-1",
    family: "strip",
    name: "Нащельник угловой 50×50 «Фасад-Комплект», RAL 7024",
    reason: "Профиль совпадает, срок поставки 5 дней вместо 18",
    priceDeltaPct: 4,
    status: "agreed",
    decidedBy: "e-sokolov",
  },
  {
    id: "rp-2",
    family: "tile",
    name: "Керамогранит 600×600×10 Estima, графит матовый",
    reason: "Аналог по водопоглощению и морозостойкости, есть на складе в Москве",
    priceDeltaPct: -6,
    status: "proposed",
    decidedBy: null,
  },
  {
    id: "rp-3",
    family: "bracket",
    name: "Кронштейн КН-150 «МеталлПрофиль», сталь оцинкованная",
    reason: "Совместим с направляющей 60×40, сертификат ТС есть",
    priceDeltaPct: 3,
    status: "proposed",
    decidedBy: null,
  },
  {
    id: "rp-4",
    family: "wool",
    name: "Плита ТЕХНОВЕНТ Стандарт 100 мм",
    reason: "Та же плотность и группа горючести НГ",
    priceDeltaPct: -3,
    status: "rejected",
    decidedBy: "e-volkova",
  },
  {
    id: "rp-5",
    family: "membrane",
    name: "Мембрана Изоспан AF+",
    reason: "Паропроницаемость выше требуемой, Г1",
    priceDeltaPct: -9,
    status: "proposed",
    decidedBy: null,
  },
  {
    id: "rp-6",
    family: "firecut",
    name: "Отсечка противопожарная 0,7 мм, EI 60",
    reason: "Запас по огнестойкости, заказчик согласен",
    priceDeltaPct: 12,
    status: "proposed",
    decidedBy: null,
  },
];

export const replacementSuggestions: ReplacementSuggestion[] = REPLACEMENTS;

/* ---------- Позиции загруженного в демо документа ---------- */

/** Позиции для документа, загруженного в демо: небольшая таблица из того же справочника. */
export function simulatedPositions(
  revisionId: string,
  projectId: string,
  count: number,
): ExtractedPosition[] {
  const sheetNumbers = [84, 87, 89, 91, 94];
  const rowH = (SHEET_TABLE.bottom - SHEET_TABLE.top) / count;
  return Array.from({ length: count }, (_, r) => {
    const sheetNumber = sheetNumbers[r % sheetNumbers.length]!;
    const family = families[sheetNumber]!;
    const i = 5000 + r;
    const normalized = r % 7 !== 3;
    return {
      id: `${revisionId}-pos-${r + 1}`,
      projectId,
      documentId: revisionId,
      sheetId: `${revisionId}-sh-1`,
      sheetNumber: 1,
      position: String(r + 1),
      group: sheetPlan.find((group) => group.sheets.some((sheet) => sheet.number === sheetNumber))!
        .group,
      family: family.family,
      projectName: `${family.base}, ${family.variant(r)}`,
      materialId: normalized ? family.material : null,
      normalizedName: normalized ? family.normalized : null,
      characteristics: family.characteristics(r) satisfies Characteristic[],
      qty: family.qty(i),
      unit: family.unit,
      confidence: r === 5 ? 0.55 : r % 6 === 2 ? 0.76 : 0.88 + seeded(i, 40) * 0.1,
      region: {
        x: SHEET_TABLE.left,
        y: SHEET_TABLE.top + r * rowH,
        w: SHEET_TABLE.right - SHEET_TABLE.left,
        h: rowH,
      },
      review: "pending",
      reviewedBy: null,
      reviewedAt: null,
      note: r === 5 ? "Количество не распознано: ячейка пустая." : null,
      handedOverAt: null,
      purchase: "none",
      requestIds: [],
      mergedInto: null,
    };
  });
}
