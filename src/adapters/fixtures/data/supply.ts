import type { MaterialRequest } from "@/contracts";

/**
 * Заявки на материал в демонстрации (ADR-037, сценарий 3). Две штуки: одна ждёт снабжения,
 * вторая уже заказана — чтобы на показе было видно и очередь, и движение статуса.
 */
export const materialRequests: MaterialRequest[] = [
  {
    id: "mr-korona-nashchelnik",
    projectId: "p-korona",
    sourceId: "src-tg-gareev",
    name: "Нащельник угловой",
    qty: 12,
    unit: "шт",
    neededBy: "2026-09-08",
    status: "new",
    note: "Без него встанут примыкания на захватке 2",
    authorId: "e-gareev",
    requestedAt: "2026-09-05T08:44:00",
    decidedBy: null,
    decidedAt: null,
    decision: null,
  },
  {
    id: "mr-korona-anchors",
    projectId: "p-korona",
    sourceId: null,
    name: "Анкер клиновой 12×100",
    qty: 400,
    unit: "шт",
    neededBy: "2026-09-12",
    status: "ordered",
    note: "Расход выше планового: добираем на стилобат",
    authorId: "e-gareev",
    requestedAt: "2026-09-03T17:20:00",
    decidedBy: "e-dorohov",
    decidedAt: "2026-09-04T09:10:00",
    decision: "Заказано у «Фасад-Комплект», приедет 11.09",
  },
];
