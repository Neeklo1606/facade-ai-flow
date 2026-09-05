import type { AuditEntry, DocumentRecord, Risk, TaskRecord } from "@/types";

export const tasks: TaskRecord[] = [
  { id: "t-101", title: "Закрыть примыкания на захватке 2, оси Г–К", siteId: "s-korona", zoneId: "z-korona-z2", assigneeId: "u-gareev", status: "overdue", dueDate: "2026-09-03", origin: "report_issue", sourceEventId: "e-1041", sourceLabel: "Отчёт Гареева от 05.09", priority: "critical" },
  { id: "t-102", title: "Согласовать замену перфораторов", siteId: "s-meridian", assigneeId: "u-dorohov", status: "in_progress", dueDate: "2026-09-06", origin: "report_issue", sourceEventId: "e-1034", sourceLabel: "Отчёт Кима от 02.09", priority: "high" },
  { id: "t-103", title: "Передать заказчику исполнительную по этапу 2", siteId: "s-school", assigneeId: "u-volkova", status: "open", dueDate: "2026-09-09", origin: "contract", sourceEventId: "e-1039", sourceLabel: "Договор СИ-2026/052, п. 5.3", priority: "high" },
  { id: "t-104", title: "Дозаказать нащельник угловой, 180 шт", siteId: "s-korona", assigneeId: "u-dorohov", status: "in_progress", dueDate: "2026-09-08", origin: "agent", sourceEventId: "e-1041", sourceLabel: "Агент снабжения", priority: "high" },
  { id: "t-105", title: "Устранить сколы керамогранита, партия 420 м²", siteId: "s-meridian", assigneeId: "u-kim", status: "open", dueDate: "2026-09-10", origin: "report_issue", sourceEventId: "e-1038", sourceLabel: "Чек-лист от 04.09", priority: "normal" },
  { id: "t-106", title: "Подписать акт КС-2 за август", siteId: "s-galaxy", assigneeId: "u-volkova", status: "review", dueDate: "2026-09-07", origin: "manual", sourceLabel: "Создана вручную", priority: "normal" },
  { id: "t-107", title: "Контрольная точка 2: сдать 40% объёмов", siteId: "s-primorsky", assigneeId: "u-sokolov", status: "open", dueDate: "2026-10-15", origin: "contract", sourceEventId: "e-1039", sourceLabel: "Договор ДСК-2026/008, стр. 4", priority: "normal" },
  { id: "t-108", title: "Проверить паспорта партии керамогранита", siteId: "s-meridian", assigneeId: "u-volkova", status: "overdue", dueDate: "2026-09-04", origin: "report_issue", sourceEventId: "e-1038", sourceLabel: "Чек-лист от 04.09", priority: "high" },
  { id: "t-109", title: "Выдать бригаде наряд на захватку 1", siteId: "s-korona", assigneeId: "u-gareev", status: "done", dueDate: "2026-09-01", origin: "manual", sourceLabel: "Создана вручную", priority: "low" },
];

export const documents: DocumentRecord[] = [
  { id: "d-11", name: "Договор подряда ДСК-2026/008", type: "contract", siteId: "s-primorsky", authorId: "u-volkova", createdAt: "2026-09-04", status: "review", version: 1, sizeKb: 4820, sourceEventId: "e-1039" },
  { id: "d-12", name: "Договор подряда СИ-2026/041", type: "contract", siteId: "s-korona", authorId: "u-volkova", createdAt: "2026-06-12", status: "confirmed", version: 2, sizeKb: 3960 },
  { id: "d-13", name: "Замерная карта, секция 2", type: "survey", siteId: "s-korona", authorId: "u-gareev", createdAt: "2026-08-20", status: "confirmed", version: 1, sizeKb: 1240 },
  { id: "d-14", name: "Акт скрытых работ, захватка 1", type: "act", siteId: "s-korona", authorId: "u-gareev", createdAt: "2026-08-31", status: "confirmed", version: 1, sizeKb: 860, sourceEventId: "e-1030" },
  { id: "d-15", name: "КС-2 за август, БЦ «Меридиан»", type: "ks2", siteId: "s-meridian", authorId: "u-volkova", createdAt: "2026-09-01", status: "extracted", version: 1, sizeKb: 640 },
  { id: "d-16", name: "Сертификат на керамогранит, партия 8841", type: "certificate", siteId: "s-school", authorId: "u-dorohov", createdAt: "2026-08-28", status: "confirmed", version: 1, sizeKb: 410 },
  { id: "d-17", name: "Письмо заказчику о переносе сроков", type: "letter", siteId: "s-galaxy", authorId: "u-sokolov", createdAt: "2026-09-02", status: "confirmed", version: 1, sizeKb: 120 },
  { id: "d-18", name: "Допсоглашение № 1 к СИ-2026/052", type: "annex", siteId: "s-school", authorId: "u-volkova", createdAt: "2026-07-15", status: "confirmed", version: 1, sizeKb: 780 },
];

export const risks: Risk[] = [
  { id: "rk-1", kind: "deadline", severity: "critical", siteId: "s-school", risk: "Срыв договорного срока 10.10.2026", cause: "Отставание по примыканиям 68 пог. м и парапетам 42 пог. м", action: "Вывести вторую бригаду с 08.09, согласовать сверхурочные", ownerId: "u-sokolov", dueDate: "2026-09-08", sourceEventId: "e-1035", sourceLabel: "План-факт по объёмам, отчёты с 25.08" },
  { id: "rk-2", kind: "material", severity: "critical", siteId: "s-korona", risk: "Остановка монтажа примыканий на захватке 2", cause: "Нащельник угловой: остаток 0, потребность 180 шт", action: "Подтвердить заявку З-2026/319 и ускорить поставку", ownerId: "u-dorohov", dueDate: "2026-09-06", sourceEventId: "e-1041", sourceLabel: "Голосовой отчёт Гареева, 05.09, 00:28" },
  { id: "rk-3", kind: "unclosed_volume", severity: "high", siteId: "s-korona", risk: "Незакрытый объём 554 м² по облицовке", cause: "Факт 1 846 м² против плана 2 400 м² на 05.09", action: "Скорректировать график или добавить смену", ownerId: "u-sokolov", dueDate: "2026-09-12", sourceLabel: "Работы: монтаж облицовки, захватка 2" },
  { id: "rk-4", kind: "document", severity: "high", siteId: "s-primorsky", risk: "Договор не подтверждён, аванс не выставлен", cause: "7 полей извлечено, 2 с низкой уверенностью не проверены", action: "Пройти проверку данных по событию 1039", ownerId: "u-volkova", dueDate: "2026-09-06", sourceEventId: "e-1039", sourceLabel: "Договор ДСК-2026/008, стр. 15 и 18" },
  { id: "rk-5", kind: "overspend", severity: "medium", siteId: "s-meridian", risk: "Перерасход по крепежу 4,2%", cause: "Повторное сверление после смещения осей на захватке 2", action: "Проверить разметку, зафиксировать доп. объём", ownerId: "u-kim", dueDate: "2026-09-15", sourceEventId: "e-1034", sourceLabel: "Отчёт Кима, 02.09" },
  { id: "rk-6", kind: "open_issue", severity: "medium", siteId: "s-meridian", risk: "Открытое замечание по входному контролю", cause: "Сколы на 6 плитах, паспорт партии отсутствует", action: "Оформить рекламацию «Керамика Трейд»", ownerId: "u-volkova", dueDate: "2026-09-10", sourceEventId: "e-1038", sourceLabel: "Фото чек-листа, 04.09" },
  { id: "rk-7", kind: "reporting", severity: "high", siteId: "s-galaxy", risk: "Отчёты с площадки не сдаются 3 дня", cause: "Ответственный прораб не назначен после перевода", action: "Назначить ответственного и включить напоминания", ownerId: "u-sokolov", dueDate: "2026-09-06", sourceLabel: "Дисциплина отчётности, ТЦ «Галактика»" },
];

export const auditLog: AuditEntry[] = [
  { id: "al-1", at: "2026-09-05T08:42:38", actor: "Агент извлечения", actorType: "agent", action: "Извлёк 7 полей", target: "Событие 1041", details: "Средняя уверенность 0.83, 2 поля ниже порога" },
  { id: "al-2", at: "2026-09-05T09:10:04", actor: "Дорохов С. Н.", actorType: "user", action: "Создал заявку", target: "З-2026/319", details: "Нащельник угловой, 180 шт" },
  { id: "al-3", at: "2026-09-04T17:02:11", actor: "Соколов И. П.", actorType: "user", action: "Подтвердил событие", target: "Событие 1036", details: "Создана запись работ: 96 м² утеплителя" },
  { id: "al-4", at: "2026-09-04T16:20:40", actor: "Агент документов", actorType: "agent", action: "Обработал документ", target: "ДСК-2026/008", details: "24 страницы, 4 контрольные точки" },
  { id: "al-5", at: "2026-09-03T12:11:00", actor: "Волкова Е. С.", actorType: "user", action: "Загрузила документ", target: "Счёт № 4417", details: "Керамика Трейд, 1 284 000 ₽" },
];

export const planFact = [
  { date: "07.08", plan: 320, fact: 298 },
  { date: "12.08", plan: 340, fact: 351 },
  { date: "17.08", plan: 360, fact: 302 },
  { date: "22.08", plan: 380, fact: 344 },
  { date: "27.08", plan: 390, fact: 318 },
  { date: "01.09", plan: 400, fact: 286 },
  { date: "05.09", plan: 410, fact: 184 },
];
