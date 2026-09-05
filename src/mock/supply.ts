import type { Delivery, Material, PurchaseRequest, Quote, Supplier } from "@/types";

export const materials: Material[] = [
  { id: "m-1", name: "Кронштейн КР-150 оцинкованный", category: "Подконструкция", unit: "шт", need: 12400, ordered: 9000, delivered: 8400, stock: 620 },
  { id: "m-2", name: "Направляющая Т-образная 60х40", category: "Подконструкция", unit: "пог. м", need: 8600, ordered: 6200, delivered: 6200, stock: 340 },
  { id: "m-3", name: "Керамогранит 600х600 антрацит", category: "Облицовка", unit: "м²", need: 9800, ordered: 7400, delivered: 5100, stock: 210 },
  { id: "m-4", name: "Минеральная вата 100 мм", category: "Утеплитель", unit: "м²", need: 11200, ordered: 8800, delivered: 8800, stock: 940 },
  { id: "m-5", name: "Анкер клиновой 10х100", category: "Крепёж", unit: "шт", need: 24000, ordered: 18000, delivered: 18000, stock: 2100 },
  { id: "m-6", name: "Парапетная крышка", category: "Доборные элементы", unit: "пог. м", need: 640, ordered: 400, delivered: 400, stock: 0 },
  { id: "m-7", name: "Противопожарная отсечка", category: "Доборные элементы", unit: "пог. м", need: 1800, ordered: 1200, delivered: 900, stock: 60 },
  { id: "m-8", name: "Нащельник угловой", category: "Доборные элементы", unit: "шт", need: 480, ordered: 300, delivered: 300, stock: 0 },
  { id: "m-9", name: "Заклёпка вытяжная 4х12", category: "Крепёж", unit: "тыс. шт", need: 96, ordered: 80, delivered: 80, stock: 12 },
];

export const suppliers: Supplier[] = [
  { id: "sp-fk", name: "Фасад-Комплект", categories: ["Подконструкция", "Доборные элементы"], contact: "Литвинов П. А.", email: "sales@fasad-komplekt.ru", avgReplyHours: 6, avgLeadDays: 12, requestsCount: 34, rating: 4.6 },
  { id: "sp-mp", name: "МеталлПрофиль Групп", categories: ["Подконструкция", "Крепёж"], contact: "Романова Т. И.", email: "zakaz@mp-group.ru", avgReplyHours: 11, avgLeadDays: 18, requestsCount: 27, rating: 4.1 },
  { id: "sp-kt", name: "Керамика Трейд", categories: ["Облицовка"], contact: "Абрамов Д. С.", email: "info@keramika-trade.ru", avgReplyHours: 21, avgLeadDays: 24, requestsCount: 19, rating: 3.4 },
  { id: "sp-sk", name: "СтройКрепеж", categories: ["Крепёж", "Утеплитель"], contact: "Ушакова Н. В.", email: "opt@stroykrepezh.ru", avgReplyHours: 4, avgLeadDays: 8, requestsCount: 41, rating: 4.8 },
];

export function supplierName(id: string) {
  return suppliers.find((s) => s.id === id)?.name ?? "—";
}

export const requests: PurchaseRequest[] = [
  {
    id: "r-318",
    siteId: "s-korona",
    zoneId: "z-korona-z2",
    items: [
      { materialId: "m-1", name: "Кронштейн КР-150 оцинкованный", qty: 3400, unit: "шт" },
      { materialId: "m-2", name: "Направляющая Т-образная 60х40", qty: 2400, unit: "пог. м" },
    ],
    sentTo: ["sp-fk", "sp-mp", "sp-sk"],
    repliesCount: 2,
    bestPrice: 1_868_000,
    leadTimeDays: 12,
    status: "compared",
    createdAt: "2026-09-01T10:00:00",
  },
  {
    id: "r-319",
    siteId: "s-korona",
    zoneId: "z-korona-z2",
    items: [{ materialId: "m-8", name: "Нащельник угловой", qty: 180, unit: "шт" }],
    sentTo: ["sp-fk"],
    repliesCount: 0,
    bestPrice: null,
    leadTimeDays: null,
    status: "sent",
    createdAt: "2026-09-05T09:10:00",
  },
  {
    id: "r-317",
    siteId: "s-school",
    items: [{ materialId: "m-3", name: "Керамогранит 600х600 антрацит", qty: 1200, unit: "м²" }],
    sentTo: ["sp-kt"],
    repliesCount: 1,
    bestPrice: 1_284_000,
    leadTimeDays: 24,
    status: "ordered",
    createdAt: "2026-08-24T14:20:00",
  },
  {
    id: "r-320",
    siteId: "s-primorsky",
    items: [
      { materialId: "m-5", name: "Анкер клиновой 10х100", qty: 12000, unit: "шт" },
      { materialId: "m-9", name: "Заклёпка вытяжная 4х12", qty: 40, unit: "тыс. шт" },
    ],
    sentTo: ["sp-sk", "sp-mp"],
    repliesCount: 0,
    bestPrice: null,
    leadTimeDays: null,
    status: "collecting",
    createdAt: "2026-09-04T16:00:00",
  },
];

export const quotes: Quote[] = [
  { id: "q-1", requestId: "r-318", supplierId: "sp-fk", prices: { "m-1": 268, "m-2": 412 }, leadTimeDays: 12, total: 1_899_600, sourceEventId: "e-1040", confidence: 0.95 },
  { id: "q-2", requestId: "r-318", supplierId: "sp-mp", prices: { "m-1": 259, "m-2": 428 }, leadTimeDays: 18, total: 1_907_800, sourceEventId: "e-1037", confidence: 0.96 },
];

export const deliveries: Delivery[] = [
  { id: "dl-1", requestId: "r-317", siteId: "s-school", supplierId: "sp-kt", expectedAt: "2026-09-12", receivedAt: null, status: "in_transit", items: "Керамогранит 600х600 антрацит, 1 200 м²" },
  { id: "dl-2", requestId: "r-318", siteId: "s-korona", supplierId: "sp-fk", expectedAt: "2026-09-19", receivedAt: null, status: "expected", items: "Кронштейн КР-150, 3 400 шт" },
  { id: "dl-3", requestId: "r-317", siteId: "s-school", supplierId: "sp-kt", expectedAt: "2026-08-28", receivedAt: "2026-08-29", status: "received", items: "Керамогранит 600х600 антрацит, 420 м²" },
];
