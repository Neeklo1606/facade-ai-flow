export interface Supplier {
  id: string;
  name: string;
  categories: string[];
  contactPerson: string;
  phone: string;
  email: string;
  avgReplyHours: number;
  avgDeliveryDays: number;
  ordersDone: number;
  rating: number;
  ratingNote?: string;
  ratingTrend: { month: string; rating: number }[];
}

export const supplierCategories = [
  "Подконструкция",
  "Крепеж",
  "Облицовка",
  "Утеплитель",
  "Примыкания",
  "Парапеты",
] as const;

export const suppliers: Supplier[] = [
  {
    id: "s-fasad-komplekt",
    name: "Фасад-Комплект",
    categories: ["Подконструкция", "Крепеж", "Примыкания"],
    contactPerson: "Некрасов П.А.",
    phone: "+7 495 220-14-08",
    email: "zakaz@fasad-komplekt.ru",
    avgReplyHours: 6,
    avgDeliveryDays: 9,
    ordersDone: 47,
    rating: 4.7,
    ratingTrend: [
      { month: "Март", rating: 4.4 },
      { month: "Апр", rating: 4.5 },
      { month: "Май", rating: 4.5 },
      { month: "Июнь", rating: 4.6 },
      { month: "Июль", rating: 4.8 },
      { month: "Авг", rating: 4.7 },
    ],
  },
  {
    id: "s-metallprofil",
    name: "МеталлПрофиль Групп",
    categories: ["Подконструкция", "Парапеты", "Примыкания"],
    contactPerson: "Шевцова М.И.",
    phone: "+7 495 660-71-32",
    email: "sales@mpgroup.ru",
    avgReplyHours: 11,
    avgDeliveryDays: 12,
    ordersDone: 33,
    rating: 4.2,
    ratingTrend: [
      { month: "Март", rating: 4.0 },
      { month: "Апр", rating: 4.1 },
      { month: "Май", rating: 4.3 },
      { month: "Июнь", rating: 4.1 },
      { month: "Июль", rating: 4.2 },
      { month: "Авг", rating: 4.2 },
    ],
  },
  {
    id: "s-keramika-treyd",
    name: "Керамика Трейд",
    categories: ["Облицовка"],
    contactPerson: "Бортников А.С.",
    phone: "+7 812 448-90-15",
    email: "info@keramika-trade.ru",
    avgReplyHours: 20,
    avgDeliveryDays: 21,
    ordersDone: 19,
    rating: 3.9,
    ratingTrend: [
      { month: "Март", rating: 4.2 },
      { month: "Апр", rating: 4.1 },
      { month: "Май", rating: 3.9 },
      { month: "Июнь", rating: 3.8 },
      { month: "Июль", rating: 3.9 },
      { month: "Авг", rating: 3.9 },
    ],
  },
  {
    id: "s-stroykrepezh",
    name: "СтройКрепеж",
    categories: ["Крепеж"],
    contactPerson: "Юсупов Т.Р.",
    phone: "+7 495 917-03-44",
    email: "opt@stroykrepezh.ru",
    avgReplyHours: 4,
    avgDeliveryDays: 5,
    ordersDone: 61,
    rating: 4.9,
    ratingTrend: [
      { month: "Март", rating: 4.7 },
      { month: "Апр", rating: 4.8 },
      { month: "Май", rating: 4.8 },
      { month: "Июнь", rating: 4.9 },
      { month: "Июль", rating: 4.9 },
      { month: "Авг", rating: 4.9 },
    ],
  },
  {
    id: "s-izover-opt",
    name: "ТеплоРесурс Опт",
    categories: ["Утеплитель", "Примыкания"],
    contactPerson: "Гаврилова Е.В.",
    phone: "+7 495 108-55-90",
    email: "opt@teploresurs.ru",
    avgReplyHours: 8,
    avgDeliveryDays: 7,
    ordersDone: 24,
    rating: 4.4,
    ratingTrend: [
      { month: "Март", rating: 4.1 },
      { month: "Апр", rating: 4.2 },
      { month: "Май", rating: 4.3 },
      { month: "Июнь", rating: 4.4 },
      { month: "Июль", rating: 4.5 },
      { month: "Авг", rating: 4.4 },
    ],
  },
  {
    id: "s-alyum-sistemy",
    name: "АлюмСистемы Юг",
    categories: ["Подконструкция", "Парапеты", "Облицовка"],
    contactPerson: "Тарасов Д.Н.",
    phone: "+7 863 244-17-06",
    email: "zakaz@alyum-yug.ru",
    avgReplyHours: 31,
    avgDeliveryDays: 26,
    ordersDone: 11,
    rating: 2.5,
    ratingNote: "Просрочил 2 поставки подряд (июнь, июль 2026)",
    ratingTrend: [
      { month: "Март", rating: 3.8 },
      { month: "Апр", rating: 3.6 },
      { month: "Май", rating: 3.4 },
      { month: "Июнь", rating: 2.9 },
      { month: "Июль", rating: 2.5 },
      { month: "Авг", rating: 2.5 },
    ],
  },
];

export const getSupplier = (id: string) => suppliers.find((s) => s.id === id);
