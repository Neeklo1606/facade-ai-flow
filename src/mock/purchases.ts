export type PurchaseStatus = "draft" | "sent" | "collecting" | "compared" | "ordered" | "delivered";

export interface PurchaseItem {
  nomenclature: string;
  qty: number;
  unit: string;
}

export interface PurchaseRequest {
  id: string;
  projectId: string;
  items: PurchaseItem[];
  sentTo: string[];
  repliesCount: number;
  bestPrice?: number;
  bestSupplier?: string;
  deliveryDays?: number;
  status: PurchaseStatus;
  createdAt: string;
  neededBy: string;
}

export const purchaseStatusLabels: Record<PurchaseStatus, string> = {
  draft: "Черновик",
  sent: "Разослана",
  collecting: "Сбор ответов",
  compared: "Сравнение",
  ordered: "Заказано",
  delivered: "Поставлено",
};

export const purchaseRequests: PurchaseRequest[] = [
  {
    id: "З-2026-118",
    projectId: "obj-meridian",
    items: [
      { nomenclature: "Кронштейн КР-150 оцинкованный", qty: 2400, unit: "шт" },
      { nomenclature: "Направляющая Т-образная 60х40", qty: 1850, unit: "пог. м" },
    ],
    sentTo: ["Фасад-Комплект", "МеталлПрофиль Групп", "СтройКрепеж"],
    repliesCount: 1,
    bestPrice: 1842000,
    bestSupplier: "Фасад-Комплект",
    deliveryDays: 11,
    status: "collecting",
    createdAt: "2026-08-06",
    neededBy: "2026-08-24",
  },
  {
    id: "З-2026-121",
    projectId: "obj-severnaya-korona",
    items: [{ nomenclature: "Нащельник угловой", qty: 320, unit: "пог. м" }],
    sentTo: ["МеталлПрофиль Групп", "Фасад-Комплект"],
    repliesCount: 0,
    status: "sent",
    createdAt: "2026-08-11",
    neededBy: "2026-08-18",
  },
  {
    id: "З-2026-114",
    projectId: "obj-primorskiy",
    items: [
      { nomenclature: "Керамогранит 600х600 антрацит", qty: 3100, unit: "м²" },
      { nomenclature: "Заклепка вытяжная 4х12", qty: 24000, unit: "шт" },
    ],
    sentTo: ["Керамика Трейд", "Фасад-Комплект", "СтройКрепеж"],
    repliesCount: 3,
    bestPrice: 2760000,
    bestSupplier: "Керамика Трейд",
    deliveryDays: 19,
    status: "compared",
    createdAt: "2026-07-28",
    neededBy: "2026-09-02",
  },
  {
    id: "З-2026-109",
    projectId: "obj-school-1547",
    items: [{ nomenclature: "Минеральная вата 100мм", qty: 640, unit: "м²" }],
    sentTo: ["Фасад-Комплект"],
    repliesCount: 1,
    bestPrice: 412000,
    bestSupplier: "Фасад-Комплект",
    deliveryDays: 6,
    status: "delivered",
    createdAt: "2026-07-14",
    neededBy: "2026-07-28",
  },
  {
    id: "З-2026-123",
    projectId: "obj-galaktika",
    items: [
      { nomenclature: "Анкер клиновой 10х100", qty: 8600, unit: "шт" },
      { nomenclature: "Противопожарная отсечка", qty: 410, unit: "пог. м" },
    ],
    sentTo: ["СтройКрепеж", "МеталлПрофиль Групп"],
    repliesCount: 1,
    status: "collecting",
    createdAt: "2026-08-10",
    neededBy: "2026-08-29",
  },
];
