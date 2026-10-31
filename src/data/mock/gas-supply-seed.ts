/**
 * Демо-набор снабжения (ADR-057). У заказчика нет номенклатуры и поставщиков, поэтому всё
 * ниже помечено source: "mock" и подписано «Демо» на экране. Цен в наборе нет вовсе:
 * суммы появляются только из предложений, которые вводит снабженец.
 */
import type {
  MaterialLimit,
  NomenclatureItem,
  Supplier,
  SupplyRequest,
  SupplyState,
} from "@/domain/gas-ops/supply";

const ITEMS: NomenclatureItem[] = [
  {
    id: "nm-pipe-20",
    name: "Труба стальная ВГП 20 мм",
    unit: "м",
    category: "Трубы",
    aliases: ["труба 20", "вгп 20", "труба вгп 20", "трубы 20"],
  },
  {
    id: "nm-pipe-15",
    name: "Труба стальная ВГП 15 мм",
    unit: "м",
    category: "Трубы",
    aliases: ["труба 15", "вгп 15", "труба вгп 15", "трубы 15"],
  },
  {
    id: "nm-valve",
    name: 'Кран шаровой газовый 1/2"',
    unit: "шт",
    category: "Арматура",
    aliases: ["кран газовый", "кран шаровой", "кранов", "краны", "кран"],
  },
  {
    id: "nm-hose",
    name: "Подводка сильфонная для газа 1 м",
    unit: "шт",
    category: "Подводка",
    aliases: ["подводка", "подводки", "сильфон"],
  },
  {
    id: "nm-meter",
    name: "Счётчик газа G4",
    unit: "шт",
    category: "Приборы учёта",
    aliases: ["счетчик газа", "счетчик", "счетчика", "счетчиков"],
  },
  {
    id: "nm-flue",
    name: "Дымоход коаксиальный 60/100",
    unit: "компл",
    category: "Дымоходы",
    aliases: ["дымоход", "дымохода", "коаксиальный"],
  },
  {
    id: "nm-bracket",
    name: "Кронштейн настенный для котла",
    unit: "шт",
    category: "Крепёж",
    aliases: ["кронштейн", "кронштейна", "кронштейнов"],
  },
  {
    id: "nm-sealant",
    name: "Герметик для газовых резьб",
    unit: "шт",
    category: "Расходники",
    aliases: ["герметик", "герметика"],
  },
].map((item) => ({ ...item, source: "mock" as const }));

const SUPPLIERS: Supplier[] = [
  {
    id: "sp-a",
    name: "Поставщик А",
    inn: null,
    contact: "Отдел продаж",
    phone: null,
    email: null,
    categories: ["Трубы", "Арматура", "Крепёж"],
    source: "mock",
  },
  {
    id: "sp-b",
    name: "Поставщик Б",
    inn: null,
    contact: "Менеджер по газу",
    phone: null,
    email: null,
    categories: ["Трубы", "Подводка", "Приборы учёта"],
    source: "mock",
  },
  {
    id: "sp-c",
    name: "Поставщик В",
    inn: null,
    contact: null,
    phone: null,
    email: null,
    categories: ["Дымоходы", "Расходники"],
    source: "mock",
  },
];

/** Лимит по смете есть только у одного демо-объекта: разбор смет позиций материалов не даёт */
const LIMITS: MaterialLimit[] = [
  { objectId: "obj-m1", itemId: "nm-pipe-20", qty: 120, source: "mock" },
  { objectId: "obj-m1", itemId: "nm-valve", qty: 6, source: "mock" },
];

export function buildSupplySeed(today: string): SupplyState {
  const requests: SupplyRequest[] = [
    {
      id: "zk-demo-1",
      number: "ЗК-00001",
      objectId: "obj-m2",
      lines: [
        { id: "zl-1", itemId: "nm-hose", qty: 4 },
        { id: "zl-2", itemId: "nm-sealant", qty: 2 },
      ],
      needBy: today,
      priority: "normal",
      photos: [],
      authorId: "u-prorab",
      authorName: "Прораб",
      clientKey: null,
      createdAt: `${today}T08:10:00`,
      status: "new",
      rejectReason: null,
      chosenOfferId: null,
      eta: null,
      history: [{ at: `${today}T08:10:00`, actor: "Прораб", status: "new", note: null }],
      source: "mock",
    },
    {
      id: "zk-demo-2",
      number: "ЗК-00002",
      objectId: "obj-m3",
      lines: [{ id: "zl-3", itemId: "nm-flue", qty: 1 }],
      needBy: null,
      priority: "normal",
      photos: [],
      authorId: "u-prorab",
      authorName: "Прораб",
      clientKey: null,
      createdAt: `${today}T09:30:00`,
      status: "in-work",
      rejectReason: null,
      chosenOfferId: null,
      eta: null,
      history: [
        { at: `${today}T09:30:00`, actor: "Прораб", status: "new", note: null },
        { at: `${today}T10:05:00`, actor: "Снабженец", status: "in-work", note: null },
      ],
      source: "mock",
    },
  ];
  return { items: ITEMS, suppliers: SUPPLIERS, requests, offers: [], receipts: [], limits: LIMITS };
}
