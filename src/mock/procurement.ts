export type RequestStatus = "draft" | "sent" | "awaiting" | "chosen" | "ordered";

export const requestStatusLabels: Record<RequestStatus, string> = {
  draft: "Черновик",
  sent: "Разослана",
  awaiting: "Ожидает ответов",
  chosen: "Выбран поставщик",
  ordered: "Заказ сделан",
};

export interface NomenclatureItem {
  id: string;
  name: string;
  category: string;
  unit: string;
}

export const nomenclature: NomenclatureItem[] = [
  { id: "n-kr150", name: "Кронштейн КР-150 оцинкованный", category: "Подконструкция", unit: "шт" },
  { id: "n-guide", name: "Направляющая Т-образная 60×40", category: "Подконструкция", unit: "пог. м" },
  { id: "n-kg600", name: "Керамогранит 600×600 антрацит", category: "Облицовка", unit: "м²" },
  { id: "n-wool", name: "Минеральная вата 100 мм", category: "Утеплитель", unit: "м²" },
  { id: "n-anchor", name: "Анкер клиновой 10×100", category: "Крепеж", unit: "шт" },
  { id: "n-parapet", name: "Парапетная крышка", category: "Парапеты", unit: "пог. м" },
];

export const getNom = (id: string) => nomenclature.find((n) => n.id === id);

export interface RequestItem {
  nomId: string;
  qty: number;
}

export type QuoteStatus = "replied" | "pending" | "late";

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  replied: "Ответил",
  pending: "Не ответил",
  late: "Просрочил",
};

export interface Quote {
  supplierId: string;
  status: QuoteStatus;
  /** Цена за единицу по nomId, если поставщик ответил */
  unitPrices?: Record<string, number>;
  deliveryDays?: number;
  repliedAt?: string;
  note?: string;
}

export interface PurchaseRequestV2 {
  id: string;
  projectId: string;
  items: RequestItem[];
  quotes: Quote[];
  status: RequestStatus;
  createdAt: string;
  neededBy: string;
  chosenSupplierId?: string;
  emailBody: string;
}

export const quoteTotal = (req: PurchaseRequestV2, q: Quote) =>
  q.unitPrices
    ? req.items.reduce((s, it) => s + (q.unitPrices?.[it.nomId] ?? 0) * it.qty, 0)
    : undefined;

export const bestTotal = (req: PurchaseRequestV2) => {
  const totals = req.quotes
    .map((q) => quoteTotal(req, q))
    .filter((v): v is number => typeof v === "number" && v > 0);
  return totals.length ? Math.min(...totals) : undefined;
};

export const bestQuote = (req: PurchaseRequestV2) => {
  const best = bestTotal(req);
  return best === undefined ? undefined : req.quotes.find((q) => quoteTotal(req, q) === best);
};

const mailBody = (project: string, list: string, date: string) =>
  `Здравствуйте!\n\nООО «Фасад-Строй» просит предоставить коммерческое предложение на поставку материалов для объекта «${project}».\n\nПозиции:\n${list}\n\nСрок поставки на объект — до ${date}.\nПросим указать цену за единицу без НДС, срок изготовления и условия оплаты.\n\nОтвет просим направить в течение 2 рабочих дней.\n\nС уважением,\nСоколов И.П., руководитель проекта\n+7 495 118-22-40`;

export const purchaseRequestsV2: PurchaseRequestV2[] = [
  {
    id: "З-2026-114",
    projectId: "obj-primorskiy",
    items: [
      { nomId: "n-kg600", qty: 3100 },
      { nomId: "n-anchor", qty: 8600 },
    ],
    status: "awaiting",
    createdAt: "2026-07-28",
    neededBy: "2026-09-02",
    emailBody: mailBody(
      "Приморский, д. 7",
      "• Керамогранит 600×600 антрацит — 3 100 м²\n• Анкер клиновой 10×100 — 8 600 шт",
      "2 сентября 2026",
    ),
    quotes: [
      {
        supplierId: "s-keramika-treyd",
        status: "replied",
        unitPrices: { "n-kg600": 845, "n-anchor": 22 },
        deliveryDays: 19,
        repliedAt: "2026-07-31",
      },
      {
        supplierId: "s-fasad-komplekt",
        status: "replied",
        unitPrices: { "n-kg600": 902, "n-anchor": 17 },
        deliveryDays: 12,
        repliedAt: "2026-07-29",
      },
      {
        supplierId: "s-alyum-sistemy",
        status: "replied",
        unitPrices: { "n-kg600": 878, "n-anchor": 25 },
        deliveryDays: 27,
        repliedAt: "2026-08-04",
        note: "Ответ получен с задержкой 5 дней",
      },
    ],
  },
  {
    id: "З-2026-118",
    projectId: "obj-meridian",
    items: [
      { nomId: "n-kr150", qty: 2400 },
      { nomId: "n-guide", qty: 1850 },
    ],
    status: "sent",
    createdAt: "2026-08-06",
    neededBy: "2026-08-24",
    emailBody: mailBody(
      "БЦ Меридиан",
      "• Кронштейн КР-150 оцинкованный — 2 400 шт\n• Направляющая Т-образная 60×40 — 1 850 пог. м",
      "24 августа 2026",
    ),
    quotes: [
      {
        supplierId: "s-fasad-komplekt",
        status: "replied",
        unitPrices: { "n-kr150": 318, "n-guide": 542 },
        deliveryDays: 11,
        repliedAt: "2026-08-07",
      },
      { supplierId: "s-metallprofil", status: "pending" },
      { supplierId: "s-stroykrepezh", status: "late", note: "Срок ответа истек 10 августа" },
    ],
  },
  {
    id: "З-2026-121",
    projectId: "obj-severnaya-korona",
    items: [{ nomId: "n-wool", qty: 700 }],
    status: "draft",
    createdAt: "2026-08-11",
    neededBy: "2026-08-28",
    emailBody: mailBody(
      "ЖК Северная Корона, к3",
      "• Минеральная вата 100 мм — 700 м²",
      "28 августа 2026",
    ),
    quotes: [],
  },
];

export interface SupplierHistoryRow {
  requestId: string;
  projectId: string;
  items: string;
  price: number;
  deliveryDays: number;
  status: "Поставлено" | "В работе" | "Проиграна" | "Просрочка";
}

export const supplierHistory: Record<string, SupplierHistoryRow[]> = {
  "s-fasad-komplekt": [
    { requestId: "З-2026-118", projectId: "obj-meridian", items: "Кронштейн, направляющая", price: 1765900, deliveryDays: 11, status: "В работе" },
    { requestId: "З-2026-109", projectId: "obj-school-1547", items: "Минеральная вата 100 мм", price: 412000, deliveryDays: 6, status: "Поставлено" },
    { requestId: "З-2026-114", projectId: "obj-primorskiy", items: "Керамогранит, анкер", price: 2942400, deliveryDays: 12, status: "В работе" },
  ],
  "s-metallprofil": [
    { requestId: "З-2026-102", projectId: "obj-galaktika", items: "Парапетная крышка", price: 684000, deliveryDays: 14, status: "Поставлено" },
    { requestId: "З-2026-118", projectId: "obj-meridian", items: "Кронштейн, направляющая", price: 0, deliveryDays: 0, status: "В работе" },
  ],
  "s-keramika-treyd": [
    { requestId: "З-2026-114", projectId: "obj-primorskiy", items: "Керамогранит, анкер", price: 2809700, deliveryDays: 19, status: "В работе" },
    { requestId: "З-2026-096", projectId: "obj-severnaya-korona", items: "Керамогранит 600×600", price: 2180000, deliveryDays: 22, status: "Поставлено" },
  ],
  "s-stroykrepezh": [
    { requestId: "З-2026-107", projectId: "obj-meridian", items: "Анкер клиновой 10×100", price: 244000, deliveryDays: 5, status: "Поставлено" },
    { requestId: "З-2026-118", projectId: "obj-meridian", items: "Кронштейн, направляющая", price: 0, deliveryDays: 0, status: "Просрочка" },
  ],
  "s-izover-opt": [
    { requestId: "З-2026-099", projectId: "obj-school-1547", items: "Минеральная вата 100 мм", price: 217000, deliveryDays: 7, status: "Поставлено" },
  ],
  "s-alyum-sistemy": [
    { requestId: "З-2026-114", projectId: "obj-primorskiy", items: "Керамогранит, анкер", price: 2937800, deliveryDays: 27, status: "В работе" },
    { requestId: "З-2026-091", projectId: "obj-galaktika", items: "Парапетная крышка", price: 512000, deliveryDays: 34, status: "Просрочка" },
    { requestId: "З-2026-088", projectId: "obj-primorskiy", items: "Подсистема, кронштейн", price: 1340000, deliveryDays: 31, status: "Просрочка" },
  ],
};
