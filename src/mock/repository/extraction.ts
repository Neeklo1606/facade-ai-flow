import type {
  Characteristic,
  DocumentSheet,
  ExtractedPosition,
  PositionChange,
  ProjectDocument,
  PurchaseStatus,
  ReplacementSuggestion,
} from "./types";

/**
 * Проектная документация объекта и позиции, извлечённые из спецификаций.
 * Формат повторяет ответы GET /projects/:id/documents и GET /documents/:id/positions.
 */

export const SPEC_DOCUMENT_ID = "pd-korona-spec";

export const projectDocuments: ProjectDocument[] = [
  {
    id: SPEC_DOCUMENT_ID,
    projectId: "p-korona",
    title: "Спецификация фасадных материалов, ДСК-2026/008, лист 84",
    section: "НВФ",
    version: "Рев. 3",
    fileName: "ДСК-2026-008_НВФ_СМ_л84-95_рев3.pdf",
    fileType: "pdf",
    sizeKb: 18640,
    uploadedAt: "2026-08-27T10:05:00",
    uploadedBy: "e-volkova",
    sheetCount: 12,
    status: "review",
    sourceId: "src-pd-korona-spec",
  },
  {
    id: "pd-korona-ar",
    projectId: "p-korona",
    title: "Архитектурные решения. Фасады, ДСК-2026/008",
    section: "АР",
    version: "Рев. 3",
    fileName: "ДСК-2026-008_АР_фасады_рев3.pdf",
    fileType: "pdf",
    sizeKb: 24310,
    uploadedAt: "2026-08-27T09:50:00",
    uploadedBy: "e-volkova",
    sheetCount: 36,
    status: "verified",
    sourceId: "src-pd-korona-ar",
  },
  {
    id: "pd-korona-uzly",
    projectId: "p-korona",
    title: "Узлы примыканий НВФ, лист 33",
    section: "НВФ",
    version: "Рев. 2",
    fileName: "ДСК-2026-008_НВФ_узлы_рев2.pdf",
    fileType: "pdf",
    sizeKb: 6120,
    uploadedAt: "2026-08-27T10:02:00",
    uploadedBy: "e-volkova",
    sheetCount: 8,
    status: "verified",
    sourceId: "src-pd-korona-uzly",
  },
  {
    id: "pd-korona-km",
    projectId: "p-korona",
    title: "Расчёт кронштейнов на ветровую нагрузку",
    section: "КМ",
    version: "Рев. 1",
    fileName: "ДСК-2026-008_КМ_расчёт.docx",
    fileType: "docx",
    sizeKb: 1480,
    uploadedAt: "2026-09-05T11:30:00",
    uploadedBy: "e-volkova",
    sheetCount: 14,
    status: "recognizing",
    sourceId: null,
  },
  {
    id: "pd-korona-vedomost",
    projectId: "p-korona",
    title: "Ведомость отделки фасадов, корпус 3",
    section: "АР",
    version: "Рев. 1",
    fileName: "Ведомость_отделки_К3.xlsx",
    fileType: "xlsx",
    sizeKb: 212,
    uploadedAt: "2026-09-05T12:04:00",
    uploadedBy: "e-sokolov",
    sheetCount: 3,
    status: "uploaded",
    sourceId: null,
  },
];

/* ---------- Структура спецификации ---------- */

interface Family {
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

const families: Record<number, Family> = {
  84: {
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

const sheetPlan: { group: string; sheets: { number: number; title: string; rows: number }[] }[] = [
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

export const SPEC_TOTAL = 847;
export const SPEC_CONFIRMED = 312;

/** Геометрия таблицы на листе: где начинаются строки и сколько места они занимают. */
export const SHEET_TABLE = { top: 0.135, bottom: 0.855, left: 0.06, right: 0.94 } as const;

export const documentSheets: DocumentSheet[] = sheetPlan.flatMap((group) =>
  group.sheets.map((sheet) => ({
    id: `sh-${sheet.number}`,
    documentId: SPEC_DOCUMENT_ID,
    number: sheet.number,
    title: sheet.title,
    group: group.group,
  })),
);

/** Этап закупки проверенной позиции определяется запросом по её семейству. */
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

function buildSpecPositions(): ExtractedPosition[] {
  const rows: Omit<
    ExtractedPosition,
    "review" | "reviewedBy" | "reviewedAt" | "purchase" | "requestIds" | "handedOver"
  >[] = [];
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
          id: `pos-${String(i).padStart(4, "0")}`,
          projectId: "p-korona",
          documentId: SPEC_DOCUMENT_ID,
          sheetId: `sh-${sheet.number}`,
          sheetNumber: sheet.number,
          position: `${groupIndex + 1}.${inGroup}`,
          group: group.group,
          family: family.family,
          projectName: `${family.base}, ${family.variant(r)}`,
          normalizedName: family.normalized,
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

  return rows.map((row, index) => {
    if (confirmedFlags[index]) {
      const kk = k++;
      const inSheet = sheetCounter.get(row.sheetNumber) ?? 0;
      sheetCounter.set(row.sheetNumber, inSheet + 1);
      const plan = purchaseBySheet[row.sheetNumber]!;
      const purchase = plan.split && inSheet % 3 === 2 ? plan.split : plan.status;
      return {
        ...row,
        // 47 проверенных позиций без нормализованного наименования, 12 — без характеристик
        normalizedName: (kk * 149 + 17) % SPEC_CONFIRMED < 47 ? null : row.normalizedName,
        characteristics: (kk * 97 + 31) % SPEC_CONFIRMED < 12 ? [] : row.characteristics,
        review: kk % 9 === 0 ? "corrected" : "confirmed",
        reviewedBy: kk % 4 === 0 ? "e-sokolov" : "e-volkova",
        reviewedAt: `2026-09-0${1 + (kk % 5)}T${String(9 + (kk % 8)).padStart(2, "0")}:${String((kk * 7) % 60).padStart(2, "0")}:00`,
        handedOver: true,
        purchase,
        requestIds: purchase === "none" ? [] : plan.requestIds,
      } satisfies ExtractedPosition;
    }

    const uu = u++;
    let confidence = row.confidence;
    let note: string | null = null;
    let qty = row.qty;
    if (lowSheets.has(row.sheetNumber)) {
      lowSheets.delete(row.sheetNumber);
      confidence = 0.42 + seeded(index, 30) * 0.14;
      note = lowConfidenceNotes[row.sheetNumber] ?? null;
      qty = row.sheetNumber === 93 ? 0 : row.qty;
    } else if (uu % 61 === 5) {
      confidence = 0.72 + seeded(index, 31) * 0.1;
      note = clarifyNotes[uu % clarifyNotes.length] ?? null;
    }
    return {
      ...row,
      confidence,
      note,
      qty,
      normalizedName: uu % 13 === 0 ? null : row.normalizedName,
      review: "pending",
      reviewedBy: null,
      reviewedAt: null,
      handedOver: false,
      purchase: "none",
      requestIds: [],
    } satisfies ExtractedPosition;
  });
}

export const extractedPositions: ExtractedPosition[] = buildSpecPositions();

/** Позиции для документа, загруженного в демо: небольшая таблица из того же справочника. */
export function simulatedPositions(
  documentId: string,
  projectId: string,
  count: number,
): ExtractedPosition[] {
  const sheetNumbers = [84, 87, 89, 91, 94];
  const rowH = (SHEET_TABLE.bottom - SHEET_TABLE.top) / count;
  return Array.from({ length: count }, (_, r) => {
    const sheetNumber = sheetNumbers[r % sheetNumbers.length]!;
    const family = families[sheetNumber]!;
    const i = 5000 + r;
    return {
      id: `${documentId}-pos-${r + 1}`,
      projectId,
      documentId,
      sheetId: `${documentId}-sh-1`,
      sheetNumber: 1,
      position: String(r + 1),
      group: sheetPlan.find((group) => group.sheets.some((sheet) => sheet.number === sheetNumber))!
        .group,
      family: family.family,
      projectName: `${family.base}, ${family.variant(r)}`,
      normalizedName: r % 7 === 3 ? null : family.normalized,
      characteristics: family.characteristics(r),
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
      handedOver: false,
      purchase: "none",
      requestIds: [],
      mergedInto: null,
    } satisfies ExtractedPosition;
  });
}

/* ---------- История позиций и замены ---------- */

/** История для исправленных позиций: что предложила обработка и что поставил человек. */
export const positionChanges: PositionChange[] = extractedPositions.flatMap((item, index) => {
  if (item.review === "pending") return [];
  const extracted: PositionChange = {
    id: `pc-${item.id}-1`,
    positionId: item.id,
    at: "2026-08-27T11:33:00",
    actorId: "agent-extract",
    action: `Извлечено из листа ${item.sheetNumber}`,
    before: null,
    after: `${item.qty} ${item.unit}`,
  };
  if (item.review === "corrected") {
    const before = Math.round(item.qty * (index % 2 ? 1.1 : 0.9));
    return [
      { ...extracted, after: `${before} ${item.unit}` },
      {
        id: `pc-${item.id}-2`,
        positionId: item.id,
        at: item.reviewedAt!,
        actorId: item.reviewedBy!,
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
      at: item.reviewedAt!,
      actorId: item.reviewedBy!,
      action: "Подтверждено",
      before: null,
      after: null,
    },
  ];
});

export const replacementSuggestions: ReplacementSuggestion[] = [
  {
    id: "rp-1",
    family: "strip",
    name: "Нащельник угловой 50×50 «Фасад-Комплект», RAL 7024",
    reason: "Профиль совпадает, срок поставки 5 дней вместо 18",
    priceDeltaPct: 4,
    status: "agreed",
    agreedBy: "e-sokolov",
  },
  {
    id: "rp-2",
    family: "tile",
    name: "Керамогранит 600×600×10 Estima, графит матовый",
    reason: "Аналог по водопоглощению и морозостойкости, есть на складе в Москве",
    priceDeltaPct: -6,
    status: "proposed",
    agreedBy: null,
  },
  {
    id: "rp-3",
    family: "bracket",
    name: "Кронштейн КН-150 «МеталлПрофиль», сталь оцинкованная",
    reason: "Совместим с направляющей 60×40, сертификат ТС есть",
    priceDeltaPct: 3,
    status: "proposed",
    agreedBy: null,
  },
  {
    id: "rp-4",
    family: "wool",
    name: "Плита ТЕХНОВЕНТ Стандарт 100 мм",
    reason: "Та же плотность и группа горючести НГ",
    priceDeltaPct: -3,
    status: "rejected",
    agreedBy: "e-volkova",
  },
  {
    id: "rp-5",
    family: "membrane",
    name: "Мембрана Изоспан AF+",
    reason: "Паропроницаемость выше требуемой, Г1",
    priceDeltaPct: -9,
    status: "proposed",
    agreedBy: null,
  },
  {
    id: "rp-6",
    family: "firecut",
    name: "Отсечка противопожарная 0,7 мм, EI 60",
    reason: "Запас по огнестойкости, заказчик согласен",
    priceDeltaPct: 12,
    status: "proposed",
    agreedBy: null,
  },
];

export const purchaseStatusLabel: Record<PurchaseStatus, string> = {
  none: "Не в работе",
  requested: "В запросе",
  offers: "Получены предложения",
  supplier_selected: "Выбран поставщик",
  ordered: "Заказано",
  delivered: "Поставлено",
};

export const purchaseOrder: PurchaseStatus[] = [
  "none",
  "requested",
  "offers",
  "supplier_selected",
  "ordered",
  "delivered",
];

export const docStatusLabel: Record<ProjectDocument["status"], string> = {
  uploaded: "Загружен",
  recognizing: "Распознаётся",
  extracted: "Извлечено",
  review: "На проверке",
  verified: "Проверено",
};

/** Стадии обработки загруженного файла в порядке прохождения. */
export const processingStages = [
  "Загружен",
  "Распознан текст",
  "Найдены таблицы",
  "Извлечены позиции",
  "Готов к проверке",
] as const;

/** Листы документа: для спецификации — реальная структура, для остальных — сквозная нумерация. */
export function sheetsOfDocument(document: ProjectDocument): DocumentSheet[] {
  const own = documentSheets.filter((sheet) => sheet.documentId === document.id);
  if (own.length) return own;
  return Array.from({ length: document.sheetCount }, (_, index) => ({
    id: `${document.id}-sh-${index + 1}`,
    documentId: document.id,
    number: index + 1,
    title: index === 0 ? "Общие данные" : `Лист ${index + 1}`,
    group: document.section,
  }));
}

export function projectDocumentsOf(projectId: string) {
  return projectDocuments
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
