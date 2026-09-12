import type { Approval, AuditLog, Evidence, Extraction, FieldReport, IncomingEvent, Source } from "./types";

export const sources: Source[] = [
  {
    id: "src-tg-gareev",
    kind: "telegram",
    title: "Голосовое сообщение прораба, 47 с",
    author: "Гареев Р. М.",
    receivedAt: "2026-09-05T08:42:00",
    projectId: "p-korona",
    location: "00:00–00:47",
    excerpt:
      "Захватка два, оси Г-К, девятый по одиннадцатый этаж, монтаж облицовки сто восемьдесят четыре квадрата за смену. Работали вчетвером. Не хватает нащельника углового, двенадцать штук.",
  },
  {
    id: "src-mail-fk",
    kind: "email",
    title: "Коммерческое предложение «Фасад-Комплект»",
    author: "sales@fasad-komplekt.ru",
    receivedAt: "2026-09-05T07:15:00",
    projectId: "p-korona",
    location: "абзац 2",
    excerpt: "Кронштейн КР-150 оцинкованный — 268 руб./шт при партии от 3000 шт. Срок поставки 12 рабочих дней.",
  },
  {
    id: "src-contract-korona",
    kind: "upload",
    title: "Договор подряда ДСК-2026/008",
    author: "Волкова М. С.",
    receivedAt: "2026-04-18T12:00:00",
    projectId: "p-korona",
    location: "стр. 4, п. 3.2",
    excerpt: "Этап 1 (захватки 1–2) сдаётся заказчику не позднее 10 сентября 2026 года в объёме 8800 м².",
  },
  { id: "src-act-k1", kind: "upload", title: "Акт КС-2 №1", author: "Волкова М. С.", receivedAt: "2026-06-30T15:00:00", projectId: "p-korona", location: "стр. 1", excerpt: "Принято 3200 м² навесного фасада, захватка 1." },
  { id: "src-act-k2", kind: "upload", title: "Акт КС-2 №2", author: "Волкова М. С.", receivedAt: "2026-07-31T15:00:00", projectId: "p-korona", location: "стр. 1", excerpt: "Принято 3200 м² навесного фасада, захватка 1." },
  { id: "src-act-k3", kind: "upload", title: "Акт КС-2 №3", author: "Волкова М. С.", receivedAt: "2026-08-31T15:00:00", projectId: "p-korona", location: "стр. 1–2", excerpt: "Принято 2612 м²: захватка 2 — 1292 м², захватка 3 — 1320 м²." },
  { id: "src-tg-kim", kind: "telegram", title: "Отчёт прораба с фото", author: "Ким А. В.", receivedAt: "2026-09-03T18:20:00", projectId: "p-meridian", location: "сообщение 1", excerpt: "Южный фасад, закрыли 1120 квадратов, есть сколы на партии керамогранита." },
  { id: "src-call-dsk", kind: "call", title: "Звонок заказчика ДСК-Регион", author: "Ветров А. Н.", receivedAt: "2026-09-04T11:30:00", projectId: "p-korona", location: "04:12", excerpt: "Просим подтвердить готовность этапа 1 к 10 сентября." },
];

export const evidence: Evidence[] = [
  { id: "ev-1", reportId: "fr-korona-0905", kind: "audio", caption: "Голосовой отчёт, 47 с", takenAt: "2026-09-05T08:42:00", location: "00:00–00:47" },
  { id: "ev-2", reportId: "fr-korona-0905", kind: "photo", caption: "Оси Г–К, 10 этаж, облицовка", takenAt: "2026-09-05T08:39:00", location: "фото 1" },
  { id: "ev-3", reportId: "fr-korona-0905", kind: "photo", caption: "Узел примыкания без нащельника", takenAt: "2026-09-05T08:40:00", location: "фото 2" },
  { id: "ev-4", reportId: "fr-korona-0905", kind: "photo", caption: "Общий вид захватки 2", takenAt: "2026-09-05T08:41:00", location: "фото 3" },
  { id: "ev-5", reportId: "fr-meridian-0903", kind: "photo", caption: "Сколы керамогранита, партия 420 м²", takenAt: "2026-09-03T18:15:00", location: "фото 1" },
];

export const fieldReports: FieldReport[] = [
  {
    id: "fr-korona-0905",
    projectId: "p-korona",
    zoneId: "z-korona-2",
    authorId: "e-gareev",
    crewId: "cr-korona-1",
    date: "2026-09-05",
    status: "review",
    summary: "Монтаж облицовки, захватка 2, оси Г–К, этажи 9–11. Не хватает нащельника углового.",
    declaredQty: 184,
    unit: "м²",
    acceptedQty: null,
    headcount: 4,
    evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4"],
    sourceId: "src-tg-gareev",
    eventId: "in-1041",
  },
  {
    id: "fr-meridian-0903",
    projectId: "p-meridian",
    zoneId: "z-meridian-2",
    authorId: "e-kim",
    crewId: "cr-meridian-1",
    date: "2026-09-03",
    status: "accepted",
    summary: "Южный фасад, закрыт объём смены, выявлены сколы керамогранита на партии 420 м².",
    declaredQty: 220,
    unit: "м²",
    acceptedQty: 205,
    headcount: 7,
    evidenceIds: ["ev-5"],
    sourceId: "src-tg-kim",
    eventId: "in-1038",
  },
];

export const extractions: Extraction[] = [
  { id: "ex-1", sourceId: "src-tg-gareev", eventId: "in-1041", label: "Объект", value: "ЖК «Северная Корона», корпус 3", confidence: 0.97, quote: "захватка два оси Г-К", location: "00:02", appliedTo: { entity: "Project", id: "p-korona" } },
  { id: "ex-2", sourceId: "src-tg-gareev", eventId: "in-1041", label: "Захватка", value: "Захватка 2, оси Г–К", confidence: 0.94, quote: "захватка два, оси Г-К", location: "00:03", appliedTo: { entity: "WorkZone", id: "z-korona-2" } },
  { id: "ex-3", sourceId: "src-tg-gareev", eventId: "in-1041", label: "Этажи", value: "9–11", confidence: 0.91, quote: "девятый по одиннадцатый этаж", location: "00:06", appliedTo: { entity: "WorkZone", id: "z-korona-2" } },
  { id: "ex-4", sourceId: "src-tg-gareev", eventId: "in-1041", label: "Вид работ", value: "Монтаж навесного фасада", confidence: 0.96, quote: "монтаж облицовки", location: "00:09", appliedTo: { entity: "WorkType", id: "wt-facade" } },
  { id: "ex-5", sourceId: "src-tg-gareev", eventId: "in-1041", label: "Объём за смену", value: "184 м²", confidence: 0.88, quote: "сто восемьдесят четыре квадрата", location: "00:11", appliedTo: { entity: "FieldReport", id: "fr-korona-0905" } },
  { id: "ex-6", sourceId: "src-tg-gareev", eventId: "in-1041", label: "Состав бригады", value: "4 человека", confidence: 0.61, quote: "работали вчетвером", location: "00:19", appliedTo: null },
  { id: "ex-7", sourceId: "src-tg-gareev", eventId: "in-1041", label: "Дефицит материала", value: "Нащельник угловой — 12 шт", confidence: 0.54, quote: "не хватает нащельника углового, двенадцать штук", location: "00:28", appliedTo: null },
  { id: "ex-8", sourceId: "src-mail-fk", eventId: "in-1040", label: "Поставщик", value: "Фасад-Комплект", confidence: 0.99, quote: "«Фасад-Комплект»", location: "подпись", appliedTo: { entity: "Counterparty", id: "c-fk" } },
  { id: "ex-9", sourceId: "src-mail-fk", eventId: "in-1040", label: "Цена кронштейна", value: "268 ₽/шт", confidence: 0.95, quote: "268 руб./шт при партии от 3000 шт", location: "абз. 2", appliedTo: { entity: "SupplierOffer", id: "so-318-fk" } },
  { id: "ex-10", sourceId: "src-mail-fk", eventId: "in-1040", label: "Срок поставки", value: "12 рабочих дней", confidence: 0.9, quote: "срок поставки 12 рабочих дней", location: "абз. 3", appliedTo: { entity: "SupplierOffer", id: "so-318-fk" } },
  { id: "ex-11", sourceId: "src-contract-korona", eventId: "in-1039", label: "Срок этапа 1", value: "10 сентября 2026", confidence: 0.93, quote: "не позднее 10 сентября 2026 года", location: "стр. 4, п. 3.2", appliedTo: { entity: "Milestone", id: "ms-k-1" } },
  { id: "ex-12", sourceId: "src-contract-korona", eventId: "in-1039", label: "Объём этапа 1", value: "8800 м²", confidence: 0.89, quote: "в объёме 8800 м²", location: "стр. 4, п. 3.2", appliedTo: { entity: "Milestone", id: "ms-k-1" } },
];

export const incomingEvents: IncomingEvent[] = [
  { id: "in-1041", sourceId: "src-tg-gareev", projectId: "p-korona", authorId: "e-gareev", receivedAt: "2026-09-05T08:42:00", kind: "field_report", status: "review", preview: "Захватка 2, оси Г–К, этажи 9–11: 184 м² за смену, не хватает нащельника", confidence: 0.83, extractionIds: ["ex-1", "ex-2", "ex-3", "ex-4", "ex-5", "ex-6", "ex-7"], appliedTo: { entity: "FieldReport", id: "fr-korona-0905", label: "Отчёт с объекта от 05.09" } },
  { id: "in-1040", sourceId: "src-mail-fk", projectId: "p-korona", authorId: "e-dorohov", receivedAt: "2026-09-05T07:15:00", kind: "supplier_offer", status: "extracted", confidence: 0.93, preview: "Предложение «Фасад-Комплект» по заявке З-2026/318, срок 12 дней", extractionIds: ["ex-8", "ex-9", "ex-10"], appliedTo: { entity: "SupplierOffer", id: "so-318-fk", label: "Предложение по заявке З-2026/318" } },
  { id: "in-1039", sourceId: "src-contract-korona", projectId: "p-korona", authorId: "e-volkova", receivedAt: "2026-04-18T12:00:00", kind: "document", status: "applied", confidence: 0.91, preview: "Договор ДСК-2026/008: контрольные точки этапов 1–3", extractionIds: ["ex-11", "ex-12"], appliedTo: { entity: "Milestone", id: "ms-k-1", label: "Этап 1: захватки 1–2" } },
  { id: "in-1038", sourceId: "src-tg-kim", projectId: "p-meridian", authorId: "e-kim", receivedAt: "2026-09-03T18:20:00", kind: "field_report", status: "applied", confidence: 0.86, preview: "Южный фасад: 220 м² заявлено, принято 205 м², сколы плитки", extractionIds: [], appliedTo: { entity: "FieldReport", id: "fr-meridian-0903", label: "Отчёт с объекта от 03.09" } },
  { id: "in-1037", sourceId: "src-call-dsk", projectId: "p-korona", authorId: "e-sokolov", receivedAt: "2026-09-04T11:30:00", kind: "question", status: "received", confidence: 0.74, preview: "Заказчик просит подтвердить готовность этапа 1 к 10 сентября", extractionIds: [], appliedTo: null },
];

export const approvals: Approval[] = [
  { id: "ap-1", extractionId: "ex-5", entity: "VolumeEntry", entityId: "ve-k2-2", field: "Объём", previousValue: "370 м²", newValue: "554 м²", approvedBy: "e-volkova", approvedAt: "2026-09-05T09:05:00", decision: "accepted", comment: "Добавлен объём смены 05.09 по отчёту Гареева" },
  { id: "ap-2", extractionId: "ex-7", entity: "SupplyRequest", entityId: "sr-319", field: "Позиция заявки", previousValue: null, newValue: "Нащельник угловой — 180 шт", approvedBy: "e-dorohov", approvedAt: "2026-09-05T09:12:00", decision: "corrected", comment: "Объём увеличен с 12 до 180 шт на всю захватку" },
  { id: "ap-3", extractionId: "ex-11", entity: "Milestone", entityId: "ms-k-1", field: "Срок", previousValue: null, newValue: "2026-09-10", approvedBy: "e-volkova", approvedAt: "2026-04-18T13:40:00", decision: "accepted" },
  { id: "ap-4", extractionId: null, entity: "FieldReport", entityId: "fr-meridian-0903", field: "Принятый объём", previousValue: "220 м²", newValue: "205 м²", approvedBy: "e-sokolov", approvedAt: "2026-09-03T19:40:00", decision: "corrected", comment: "15 м² не принято из-за сколов плитки" },
];

export const auditLog: AuditLog[] = [
  { id: "al-1", at: "2026-09-05T08:42:38", actorId: "agent-extract", actorKind: "agent", action: "Извлечены поля из голосового отчёта", entity: "IncomingEvent", entityId: "in-1041", sourceId: "src-tg-gareev", details: "7 полей, средняя уверенность 0,83" },
  { id: "al-2", at: "2026-09-05T09:05:00", actorId: "e-volkova", actorKind: "user", action: "Подтверждён объём захватки 2", entity: "VolumeEntry", entityId: "ve-k2-2", sourceId: "src-tg-gareev", details: "370 м² → 554 м²" },
  { id: "al-3", at: "2026-09-05T09:12:00", actorId: "e-dorohov", actorKind: "user", action: "Создана заявка на материалы", entity: "SupplyRequest", entityId: "sr-319", sourceId: "src-tg-gareev", details: "Нащельник угловой — 180 шт" },
  { id: "al-4", at: "2026-09-05T09:20:00", actorId: "agent-risk", actorKind: "agent", action: "Сформирован риск по незакрытому объёму", entity: "Risk", entityId: "rk-1", sourceId: "src-tg-gareev", details: "554 м² на 2 400 000 ₽ вне актов" },
  { id: "al-5", at: "2026-09-03T19:40:00", actorId: "e-sokolov", actorKind: "user", action: "Отчёт принят частично", entity: "FieldReport", entityId: "fr-meridian-0903", sourceId: "src-tg-kim", details: "220 м² → 205 м²" },
  { id: "al-6", at: "2026-04-18T13:40:00", actorId: "e-volkova", actorKind: "user", action: "Подтверждена контрольная точка договора", entity: "Milestone", entityId: "ms-k-1", sourceId: "src-contract-korona", details: "Этап 1, срок 10.09.2026" },
];
