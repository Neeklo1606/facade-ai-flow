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
}

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
  },
  {
    id: "s-metallprofil",
    name: "МеталлПрофиль Групп",
    categories: ["Подконструкция", "Парапеты", "Нащельники"],
    contactPerson: "Шевцова М.И.",
    phone: "+7 495 660-71-32",
    email: "sales@mpgroup.ru",
    avgReplyHours: 11,
    avgDeliveryDays: 12,
    ordersDone: 33,
    rating: 4.2,
  },
  {
    id: "s-keramika-treyd",
    name: "Керамика Трейд",
    categories: ["Облицовка", "Керамогранит"],
    contactPerson: "Бортников А.С.",
    phone: "+7 812 448-90-15",
    email: "info@keramika-trade.ru",
    avgReplyHours: 20,
    avgDeliveryDays: 21,
    ordersDone: 19,
    rating: 3.9,
  },
  {
    id: "s-stroykrepezh",
    name: "СтройКрепеж",
    categories: ["Крепеж", "Анкеры", "Заклепки"],
    contactPerson: "Юсупов Т.Р.",
    phone: "+7 495 917-03-44",
    email: "opt@stroykrepezh.ru",
    avgReplyHours: 4,
    avgDeliveryDays: 5,
    ordersDone: 61,
    rating: 4.9,
  },
];
