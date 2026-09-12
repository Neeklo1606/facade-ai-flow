import type { Counterparty, Crew, Employee } from "./types";

export const counterparties: Counterparty[] = [
  { id: "c-dsk", name: "ДСК-Регион", role: "customer", inn: "7802451190", contactName: "Ветров А. Н.", email: "vetrov@dsk-region.ru", phone: "+7 812 640-11-20", avgReplyHours: 26, rating: 4.2 },
  { id: "c-stroyinvest", name: "ГК «Стройинвест»", role: "customer", inn: "7841009832", contactName: "Лебедева О. К.", email: "lebedeva@stroyinvest.ru", phone: "+7 812 611-04-77", avgReplyHours: 18, rating: 4.5 },
  { id: "c-proekt", name: "«Проектстрой»", role: "customer", inn: "7806332145", contactName: "Гусев М. В.", email: "gusev@proektstroy.ru", phone: "+7 812 320-19-05", avgReplyHours: 31, rating: 3.9 },
  { id: "c-galaxy", name: "УК «Галактика»", role: "customer", inn: "7810225477", contactName: "Шилов Е. Д.", email: "shilov@galaktika-uk.ru", phone: "+7 812 445-70-12", avgReplyHours: 22, rating: 4.0 },
  { id: "c-fk", name: "Фасад-Комплект", role: "supplier", inn: "7804119063", contactName: "Литвинов П. А.", email: "sales@fasad-komplekt.ru", phone: "+7 812 702-30-40", avgReplyHours: 6, rating: 4.6 },
  { id: "c-mp", name: "МеталлПрофиль Групп", role: "supplier", inn: "7805440218", contactName: "Романова Т. И.", email: "zakaz@mp-group.ru", phone: "+7 812 336-88-10", avgReplyHours: 11, rating: 4.1 },
  { id: "c-kt", name: "Керамика Трейд", role: "supplier", inn: "7816003994", contactName: "Абрамов Д. С.", email: "info@keramika-trade.ru", phone: "+7 812 244-51-63", avgReplyHours: 21, rating: 3.4 },
  { id: "c-sk", name: "СтройКрепёж", role: "supplier", inn: "7813551200", contactName: "Ушакова Н. В.", email: "opt@stroykrepezh.ru", phone: "+7 812 777-12-08", avgReplyHours: 4, rating: 4.8 },
  { id: "c-vysota", name: "Высота-Монтаж", role: "subcontractor", inn: "7802664301", contactName: "Панин С. Ю.", email: "panin@vysota-montazh.ru", phone: "+7 921 330-45-19", avgReplyHours: 9, rating: 4.3 },
];

export const employees: Employee[] = [
  { id: "e-sokolov", name: "Соколов И. П.", position: "Руководитель проектов", role: "manager", phone: "+7 921 400-11-02", telegram: "@sokolov_ip", projectIds: ["p-korona", "p-meridian", "p-primorsky", "p-school", "p-galaxy"], status: "active" },
  { id: "e-gareev", name: "Гареев Р. М.", position: "Прораб", role: "foreman", phone: "+7 911 220-71-45", telegram: "@gareev_rm", projectIds: ["p-korona"], status: "active" },
  { id: "e-kim", name: "Ким А. В.", position: "Прораб", role: "foreman", phone: "+7 911 508-03-19", telegram: "@kim_av", projectIds: ["p-meridian", "p-school"], status: "active" },
  { id: "e-panov", name: "Панов Д. И.", position: "Прораб", role: "foreman", phone: "+7 962 114-90-33", telegram: "@panov_di", projectIds: ["p-primorsky", "p-galaxy"], status: "active" },
  { id: "e-volkova", name: "Волкова М. С.", position: "Инженер ПТО", role: "pto", phone: "+7 921 655-27-84", telegram: "@volkova_ms", projectIds: ["p-korona", "p-primorsky", "p-school"], status: "active" },
  { id: "e-dorohov", name: "Дорохов К. А.", position: "Снабжение", role: "supply", phone: "+7 931 180-44-70", telegram: "@dorohov_ka", projectIds: ["p-korona", "p-meridian", "p-primorsky", "p-school", "p-galaxy"], status: "active" },
  { id: "e-titova", name: "Титова Е. В.", position: "Финансовый контролёр", role: "finance", phone: "+7 921 909-16-52", telegram: null, projectIds: ["p-korona", "p-galaxy"], status: "active" },
  { id: "e-nazarov", name: "Назаров Т. Б.", position: "Монтажник, звеньевой", role: "worker", phone: "+7 999 201-38-64", telegram: "@nazarov_tb", projectIds: ["p-korona"], status: "active" },
];

export const crews: Crew[] = [
  { id: "cr-korona-1", name: "Бригада Назарова", projectId: "p-korona", foremanId: "e-gareev", memberIds: ["e-nazarov"], headcount: 8, specialization: "Монтаж навесного фасада" },
  { id: "cr-korona-2", name: "Бригада Умарова", projectId: "p-korona", foremanId: "e-gareev", memberIds: [], headcount: 6, specialization: "Подконструкция и утепление" },
  { id: "cr-meridian-1", name: "Бригада Сафина", projectId: "p-meridian", foremanId: "e-kim", memberIds: [], headcount: 7, specialization: "Облицовка керамогранитом" },
  { id: "cr-primorsky-1", name: "Бригада Ильина", projectId: "p-primorsky", foremanId: "e-panov", memberIds: [], headcount: 9, specialization: "Монтаж навесного фасада" },
  { id: "cr-school-1", name: "Бригада Юсупова", projectId: "p-school", foremanId: "e-kim", memberIds: [], headcount: 5, specialization: "Штукатурный фасад" },
  { id: "cr-galaxy-1", name: "Бригада Дроздова", projectId: "p-galaxy", foremanId: "e-panov", memberIds: [], headcount: 6, specialization: "Витражные конструкции" },
];

export function employeeName(id: string) {
  return employees.find((item) => item.id === id)?.name ?? "—";
}

export function counterpartyName(id: string) {
  return counterparties.find((item) => item.id === id)?.name ?? "—";
}
