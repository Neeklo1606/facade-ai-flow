/**
 * Контракты модулей сервиса v1 (ADR-060): учёт времени бригад (S4), снабжение (S5)
 * и исполнительная документация (S6). Схема строки — тип для слоя данных и задание
 * на таблицу PostgreSQL; миграция `db/migrations/*_gas_service_v1.sql` собирается из этого
 * файла скриптом `scripts/gas-schema.ts`, `check:db` сверяет базу с ним колонка в колонку.
 *
 * Ключи текстовые: их создаёт приложение, демо и база хранят один и тот же ключ. Имена полей
 * совпадают с domain, поэтому строка и объект домена отличаются только вложенными частями.
 *
 * Модуль не входит в `src/contracts/index.ts`: его таблицы живут в своём реестре `gasTables`
 * и не участвуют в паритете основного приложения. Импортируется прямо: `@/contracts/gas`.
 */
import { z } from "zod";
import { col, pgEnum, table, tables as registeredTables, type TableDef } from "./db";

/* ---------- Перечисления ---------- */

export const gasSource = pgEnum(
  "gas_source",
  ["fact-report", "mock"],
  "Откуда строка: выгрузка заказчика или демо-набор с меткой «Демо»",
);

export const gasRole = pgEnum(
  "gas_role",
  ["admin", "manager", "foreman", "director", "prorab", "supply", "pto"],
  "Роль пользователя модулей сервиса v1",
);

export const gasEntryStatus = pgEnum(
  "gas_entry_status",
  ["draft", "pending", "confirmed", "rejected", "clarify"],
  "Статус записи времени",
);

export const gasEntryChannel = pgEnum(
  "gas_entry_channel",
  ["web", "bot", "manager", "import"],
  "Откуда пришла запись времени",
);

export const gasReviewAction = pgEnum(
  "gas_review_action",
  ["confirm", "reject", "correct", "clarify", "answer"],
  "Действие проверки записи времени",
);

export const gasCrewRole = pgEnum("gas_crew_role", ["lead", "worker"], "Роль в составе бригады");

export const gasSupplyStatus = pgEnum(
  "gas_supply_status",
  [
    "new",
    "in-work",
    "waiting-offers",
    "ordered",
    "in-transit",
    "partial",
    "delivered",
    "closed",
    "rejected",
  ],
  "Статус заявки снабжения; переходы проверяет domain (canMove)",
  {
    new: ["in-work", "rejected"],
    "in-work": ["waiting-offers", "rejected"],
    "waiting-offers": ["ordered", "rejected"],
    ordered: ["in-transit"],
    "in-transit": ["partial", "delivered"],
    partial: ["partial", "delivered"],
    delivered: ["closed"],
  },
);

export const gasSupplyPriority = pgEnum(
  "gas_supply_priority",
  ["normal", "urgent"],
  "Приоритет заявки",
);

export const gasReceiptResult = pgEnum(
  "gas_receipt_result",
  ["accepted", "accepted-with-discrepancy"],
  "Итог приёмки поставки",
);

export const gasParticipantSide = pgEnum(
  "gas_participant_side",
  ["customer-control", "builder", "builder-control", "designer", "performer"],
  "Сторона участника строительства в акте (приказ № 344/пр, черновик)",
);

export const gasActType = pgEnum("gas_act_type", ["aosr", "aook"], "Тип акта: АОСР или АООК");

export const gasDocStatus = pgEnum(
  "gas_doc_status",
  ["draft", "review", "signing", "signed", "registry"],
  "Статус документа ИД; «в реестре» ставит только закрытие реестра",
  {
    draft: ["review"],
    review: ["draft", "signing"],
    signing: ["draft", "signed"],
    signed: ["registry"],
  },
);

export const gasFileKind = pgEnum(
  "gas_file_kind",
  ["scheme", "tests", "certificate", "authority", "scan"],
  "Вид файла основания документа",
);

/* ---------- Вложенные части (jsonb) ---------- */

const personTime = z
  .object({
    employeeId: z.string().min(1),
    startMinutes: z.number().int(),
    endMinutes: z.number().int(),
    breakMinutes: z.number().int(),
    minutes: z.number().int(),
  })
  .strict();

const reviewChange = z.object({ field: z.string(), from: z.string(), to: z.string() }).strict();

const statusChange = z
  .object({
    at: z.string(),
    actor: z.string(),
    status: gasSupplyStatus.schema,
    note: z.string().nullable(),
  })
  .strict();

const docHistoryItem = z
  .object({
    at: z.string(),
    actor: z.string(),
    status: gasDocStatus.schema,
    note: z.string().nullable(),
  })
  .strict();

/* ---------- S4: учёт времени бригад ---------- */

export const gasGroups = table(
  {
    name: "gas_groups",
    comment: "Подразделение в отчёте заказчика («1. Стальные»)",
    primaryKey: ["id"],
    indexes: [],
  },
  {
    id: col.key(),
    name: col.name(),
    code: col.text({ nullable: true }),
    excelRow: col.int({ nullable: true }),
  },
);

export const gasBrigades = table(
  {
    name: "gas_brigades",
    comment: "Бригада",
    primaryKey: ["id"],
    indexes: [{ columns: ["groupId", "name"], purpose: "бригады группы в отчёте" }],
  },
  {
    id: col.key(),
    groupId: col.keyRef("gas_groups", "restrict"),
    name: col.name(),
    code: col.name(),
    excelRow: col.int({ nullable: true }),
    source: col.enum(gasSource),
  },
);

export const gasEmployees = table(
  {
    name: "gas_employees",
    comment: "Сотрудник бригады",
    primaryKey: ["id"],
    indexes: [{ columns: ["brigadeId"], purpose: "люди бригады" }],
  },
  {
    id: col.key(),
    brigadeId: col.keyRef("gas_brigades", "restrict"),
    name: col.name(),
    isLead: col.bool(),
    maxId: col.text({ nullable: true, comment: "идентификатор MAX; канал не подключён" }),
    excelRow: col.int({ nullable: true }),
    source: col.enum(gasSource),
  },
);

export const gasObjects = table(
  {
    name: "gas_objects",
    comment: "Объект работ: свой номер, адрес не единственный ключ",
    primaryKey: ["id"],
    indexes: [{ columns: ["code"], purpose: "поиск объекта по номеру" }],
  },
  {
    id: col.key(),
    label: col.name(),
    settlement: col.text({ nullable: true }),
    workType: col.text({ nullable: true }),
    code: col.name(),
    source: col.enum(gasSource),
  },
);

export const gasUsers = table(
  {
    name: "gas_users",
    comment: "Пользователь модулей и его роль. Права проверяет порт, а не меню",
    primaryKey: ["id"],
    indexes: [{ columns: ["role"], purpose: "пользователи роли" }],
  },
  {
    id: col.key(),
    name: col.name(),
    role: col.enum(gasRole),
    brigadeId: col.keyRef("gas_brigades", "set null", { nullable: true }),
    allowedObjectIds: col.textArray({
      nullable: true,
      comment: "объекты, по которым можно работать; null — все",
    }),
  },
);

export const gasTimeEntries = table(
  {
    name: "gas_time_entries",
    comment: "Запись времени бригады по объекту за день",
    primaryKey: ["id"],
    indexes: [
      { columns: ["number"], unique: true, purpose: "номер «ГЗ-00042» в боте и поиске" },
      { columns: ["day", "status"], purpose: "очередь проверки и неделя" },
      { columns: ["brigadeId", "day"], purpose: "записи бригады за день, пересечения" },
      { columns: ["objectId", "day"], purpose: "записи объекта, отчёт" },
      {
        columns: ["clientKey"],
        unique: true,
        where: "client_key is not null",
        purpose: "ключ отправки с телефона: повтор не создаёт дубль",
      },
    ],
    checks: ["minutes >= 0", "break_minutes >= 0"],
  },
  {
    id: col.key(),
    number: col.name(),
    day: col.date(),
    brigadeId: col.keyRef("gas_brigades", "restrict"),
    employeeId: col.keyRef("gas_employees", "set null", { nullable: true }),
    objectId: col.keyRef("gas_objects", "restrict"),
    startMinutes: col.int({ nullable: true }),
    endMinutes: col.int({ nullable: true }),
    breakMinutes: col.int(),
    minutes: col.int(),
    amountRub: col.float({ nullable: true, comment: "подтверждённое начисление, рубли" }),
    status: col.enum(gasEntryStatus),
    createdBy: col.name(),
    createdAt: col.timestamp(),
    reviewedBy: col.text({ nullable: true }),
    reviewedAt: col.timestamp({ nullable: true }),
    comment: col.text({ nullable: true }),
    source: col.enum(gasSource),
    revenueInFile: col.float({ nullable: true }),
    excelRow: col.int({ nullable: true }),
    headcount: col.int({ nullable: true }),
    people: col.jsonb(z.array(personTime), { nullable: true }),
    clientKey: col.text({ nullable: true }),
    channel: col.enum(gasEntryChannel, { nullable: true }),
    note: col.text({ nullable: true }),
  },
);

export const gasReviews = table(
  {
    name: "gas_reviews",
    comment: "Решение проверки по записи: подтвердил, исправил, вернул, ответ бригадира",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [{ columns: ["entryId", "at"], purpose: "история проверки записи" }],
  },
  {
    id: col.key(),
    entryId: col.keyRef("gas_time_entries", "cascade"),
    action: col.enum(gasReviewAction),
    actor: col.name(),
    at: col.timestamp(),
    comment: col.text({ nullable: true }),
    changes: col.jsonb(z.array(reviewChange)),
  },
);

export const gasCrewMembers = table(
  {
    name: "gas_crew_members",
    comment: "Состав бригады с периодом: кто и с какой даты в бригаде",
    primaryKey: ["id"],
    indexes: [{ columns: ["brigadeId", "from"], purpose: "состав бригады на дату" }],
    checks: ['"to" is null or "from" is null or "to" >= "from"'],
  },
  {
    id: col.key(),
    brigadeId: col.keyRef("gas_brigades", "restrict"),
    employeeId: col.name({
      comment:
        "человек состава без внешнего ключа: демо-монтажники есть только в составе, со своим именем",
    }),
    name: col.name(),
    role: col.enum(gasCrewRole),
    from: col.date({ nullable: true }),
    to: col.date({ nullable: true, comment: "последний день включительно; null — состоит сейчас" }),
    source: col.enum(gasSource),
  },
);

export const gasRates = table(
  {
    name: "gas_rates",
    comment: "Ставка за час с периодом: на человека или на бригаду",
    primaryKey: ["id"],
    indexes: [
      { columns: ["employeeId", "from"], purpose: "ставка человека на дату" },
      { columns: ["brigadeId", "from"], purpose: "ставка бригады на дату" },
    ],
    checks: ["(employee_id is null) <> (brigade_id is null)", "rub_per_hour > 0"],
  },
  {
    id: col.key(),
    employeeId: col.text({
      nullable: true,
      comment: "человек состава (gas_crew_members.employee_id), без внешнего ключа",
    }),
    brigadeId: col.keyRef("gas_brigades", "restrict", { nullable: true }),
    rubPerHour: col.int(),
    from: col.date(),
    to: col.date({ nullable: true }),
    source: col.enum(gasSource),
  },
);

export const gasPeriodVersions = table(
  {
    name: "gas_period_versions",
    comment: "Версия закрытой недели: копия записей и итогов на момент закрытия",
    primaryKey: ["id"],
    indexes: [{ columns: ["weekFrom", "version"], unique: true, purpose: "v1, v2 недели" }],
  },
  {
    id: col.key(),
    weekFrom: col.date(),
    weekTo: col.date(),
    version: col.int(),
    closedAt: col.timestamp(),
    closedBy: col.name(),
    entries: col.jsonb(z.array(z.record(z.unknown())), {
      comment: "копия подтверждённых записей недели",
    }),
    totals: col.jsonb(
      z
        .object({
          accruedRub: z.number(),
          minutes: z.number(),
          manMinutes: z.number(),
          count: z.number(),
        })
        .strict(),
    ),
    accepted: col.jsonb(z.array(z.object({ key: z.string(), reason: z.string() }).strict())),
    reopenedAt: col.timestamp({ nullable: true }),
    reopenedBy: col.text({ nullable: true }),
    reopenReason: col.text({ nullable: true }),
  },
);

export const gasAudit = table(
  {
    name: "gas_audit",
    comment: "Журнал действий модулей: кто, когда, что",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [
      { columns: ["at desc"], purpose: "журнал действий, новые сверху" },
      { columns: ["entityId"], purpose: "история сущности" },
    ],
  },
  {
    id: col.key(),
    at: col.timestamp(),
    actor: col.name(),
    action: col.name(),
    entityId: col.name(),
    detail: col.text(),
  },
);

/**
 * Остальное состояние учёта времени до S4 (ADR-053): неделя, сметы и их версии, правила
 * стоимости, график, отметки бригад, режим проверки, финальные проверки, сданные отчёты.
 * Пока одной строкой jsonb, нормализация — задача бэкенда (docs/BACKEND_HANDOFF.md)
 */
export const gasState = table(
  {
    name: "gas_state",
    comment: "Состояние учёта времени до S4 одной строкой; ключ «main»",
    primaryKey: ["key"],
    indexes: [],
  },
  {
    key: col.key(),
    state: col.jsonb(z.record(z.unknown())),
  },
);

/* ---------- S5: снабжение ---------- */

export const gasNomenclature = table(
  {
    name: "gas_nomenclature",
    comment: "Позиция номенклатуры: название, единица, синонимы для разбора текста",
    primaryKey: ["id"],
    indexes: [{ columns: ["category", "name"], purpose: "выбор позиции по категории" }],
  },
  {
    id: col.key(),
    name: col.name(),
    unit: col.name(),
    category: col.name(),
    aliases: col.textArray(),
    source: col.enum(gasSource),
  },
);

export const gasSuppliers = table(
  {
    name: "gas_suppliers",
    comment: "Поставщик",
    primaryKey: ["id"],
    indexes: [
      { columns: ["name"], purpose: "справочник поставщиков" },
      { columns: ["inn"], unique: true, where: "inn is not null", purpose: "ИНН без дублей" },
    ],
    checks: ["inn is null or inn ~ '^([0-9]{10}|[0-9]{12})$'"],
  },
  {
    id: col.key(),
    name: col.name(),
    inn: col.text({ nullable: true }),
    contact: col.text({ nullable: true }),
    phone: col.text({ nullable: true }),
    email: col.text({ nullable: true }),
    categories: col.textArray(),
    source: col.enum(gasSource),
  },
);

export const gasMaterialLimits = table(
  {
    name: "gas_material_limits",
    comment: "Лимит материала по смете объекта",
    primaryKey: ["objectId", "itemId"],
    indexes: [],
    checks: ["qty > 0"],
  },
  {
    objectId: col.keyRef("gas_objects", "restrict"),
    itemId: col.keyRef("gas_nomenclature", "restrict"),
    qty: col.qty(),
    source: col.enum(gasSource),
  },
);

export const gasSupplyRequests = table(
  {
    name: "gas_supply_requests",
    comment: "Заявка снабжения с объекта",
    primaryKey: ["id"],
    indexes: [
      { columns: ["number"], unique: true, purpose: "номер «ЗК-00001»" },
      { columns: ["status", "needBy"], purpose: "таблица снабженца по сроку" },
      { columns: ["objectId", "createdAt desc"], purpose: "заявки объекта, лимит сметы" },
      {
        columns: ["clientKey"],
        unique: true,
        where: "client_key is not null",
        purpose: "ключ отправки с телефона: повтор не создаёт дубль",
      },
    ],
  },
  {
    id: col.key(),
    number: col.name(),
    objectId: col.keyRef("gas_objects", "restrict"),
    needBy: col.date({ nullable: true }),
    priority: col.enum(gasSupplyPriority),
    photos: col.textArray(),
    authorId: col.name(),
    authorName: col.name(),
    clientKey: col.text({ nullable: true }),
    createdAt: col.timestamp(),
    status: col.enum(gasSupplyStatus),
    rejectReason: col.text({ nullable: true }),
    chosenOfferId: col.text({ nullable: true, comment: "выбранное предложение gas_offers.id" }),
    eta: col.date({ nullable: true }),
    history: col.jsonb(z.array(statusChange)),
    source: col.enum(gasSource),
  },
);

export const gasSupplyRequestLines = table(
  {
    name: "gas_supply_request_lines",
    comment: "Позиция заявки: что и сколько",
    primaryKey: ["id"],
    indexes: [
      { columns: ["requestId"], purpose: "позиции заявки" },
      { columns: ["itemId"], purpose: "заказано по позиции: лимит сметы" },
    ],
    checks: ["qty > 0"],
  },
  {
    id: col.key(),
    requestId: col.keyRef("gas_supply_requests", "cascade"),
    itemId: col.keyRef("gas_nomenclature", "restrict"),
    qty: col.qty(),
  },
);

export const gasOffers = table(
  {
    name: "gas_offers",
    comment: "Предложение поставщика по заявке: цены строк, срок, доставка",
    primaryKey: ["id"],
    indexes: [{ columns: ["requestId", "at"], purpose: "сравнение предложений заявки" }],
    checks: ["lead_days >= 0", "delivery_kop >= 0"],
  },
  {
    id: col.key(),
    requestId: col.keyRef("gas_supply_requests", "cascade"),
    supplierId: col.keyRef("gas_suppliers", "restrict"),
    lines: col.jsonb(
      z
        .array(z.object({ lineId: z.string(), priceKop: z.number().int().nullable() }).strict())
        .min(1),
    ),
    leadDays: col.int(),
    deliveryKop: col.money(),
    terms: col.text({ nullable: true }),
    fileName: col.text({ nullable: true }),
    enteredBy: col.name(),
    at: col.timestamp(),
  },
);

export const gasReceipts = table(
  {
    name: "gas_receipts",
    comment: "Приёмка поставки на объекте: количество, расхождение, сертификаты",
    primaryKey: ["id"],
    indexes: [
      { columns: ["requestId", "at"], purpose: "приёмки заявки" },
      {
        columns: ["clientKey"],
        unique: true,
        where: "client_key is not null",
        purpose: "повтор приёмки с телефона не принимает дважды",
      },
    ],
  },
  {
    id: col.key(),
    requestId: col.keyRef("gas_supply_requests", "restrict"),
    lines: col.jsonb(z.array(z.object({ lineId: z.string(), qty: z.number() }).strict())),
    result: col.enum(gasReceiptResult),
    discrepancy: col.text({ nullable: true }),
    invoicePhoto: col.text({ nullable: true }),
    certificates: col.jsonb(
      z.array(z.object({ lineId: z.string(), fileName: z.string() }).strict()),
    ),
    acceptedBy: col.name(),
    at: col.timestamp(),
    clientKey: col.text({ nullable: true }),
  },
);

/* ---------- S6: исполнительная документация ---------- */

export const gasParticipants = table(
  {
    name: "gas_participants",
    comment: "Участник строительства объекта и его представитель",
    primaryKey: ["id"],
    indexes: [{ columns: ["objectId", "side"], purpose: "участники объекта для акта" }],
  },
  {
    id: col.key(),
    objectId: col.keyRef("gas_objects", "restrict"),
    side: col.enum(gasParticipantSide),
    org: col.name(),
    position: col.name(),
    person: col.name(),
    authority: col.jsonb(
      z.object({ title: z.string(), fileName: z.string().nullable() }).strict(),
      { nullable: true, comment: "документ о представительстве" },
    ),
    nrsId: col.text({ nullable: true, comment: "идентификационный номер в НРС" }),
    source: col.enum(gasSource),
  },
);

export const gasProjectSheets = table(
  {
    name: "gas_project_sheets",
    comment: "Проектная документация объекта: шифр, раздел, листы",
    primaryKey: ["id"],
    indexes: [{ columns: ["objectId"], purpose: "проект объекта" }],
  },
  {
    id: col.key(),
    objectId: col.keyRef("gas_objects", "restrict"),
    cipher: col.name(),
    section: col.name(),
    sheets: col.name(),
    title: col.name(),
    author: col.name(),
    source: col.enum(gasSource),
  },
);

export const gasWorkKinds = table(
  {
    name: "gas_work_kinds",
    comment: "Справочник «вид работы → какой акт» и что нужно акту",
    primaryKey: ["id"],
    indexes: [],
  },
  {
    id: col.key(),
    name: col.name(),
    unit: col.name(),
    act: col.enum(gasActType),
    needsScheme: col.bool(),
    needsTests: col.bool(),
    next: col.text({ comment: "пункт 7 акта: последующие работы" }),
    source: col.enum(gasSource),
  },
);

export const gasWorkRecords = table(
  {
    name: "gas_work_records",
    comment: "Запись объёма работ: вид, объём, даты, материалы. Основание акта",
    primaryKey: ["id"],
    indexes: [
      { columns: ["number"], unique: true, purpose: "номер «РО-0001»" },
      { columns: ["objectId", "from"], purpose: "пакет актов за период" },
    ],
    checks: ['"to" >= "from"', "volume > 0"],
  },
  {
    id: col.key(),
    number: col.name(),
    objectId: col.keyRef("gas_objects", "restrict"),
    zone: col.text({ nullable: true, comment: "захватка или место" }),
    kindId: col.keyRef("gas_work_kinds", "restrict"),
    volume: col.qty(),
    from: col.date(),
    to: col.date(),
    materials: col.jsonb(z.array(z.object({ itemId: z.string(), qty: z.number() }).strict())),
    sheetIds: col.textArray(),
    reportedBy: col.name(),
    volumeConfirmedBy: col.text({ nullable: true }),
    volumeConfirmedAt: col.timestamp({ nullable: true }),
    source: col.enum(gasSource),
  },
);

export const gasExecDocs = table(
  {
    name: "gas_exec_docs",
    comment: "Документ ИД (акт): статус, версия, исправления полей, замечания",
    primaryKey: ["id"],
    indexes: [
      {
        columns: ["objectId", "type", "number"],
        unique: true,
        purpose: "номер акта своего типа на объекте",
      },
      { columns: ["workId"], unique: true, purpose: "по работе один акт" },
      { columns: ["status"], purpose: "показатели ПТО" },
    ],
    checks: ["version >= 1", "(status in ('signed', 'registry')) = (scan is not null)"],
  },
  {
    id: col.key(),
    objectId: col.keyRef("gas_objects", "restrict"),
    type: col.enum(gasActType),
    number: col.int(),
    workId: col.keyRef("gas_work_records", "restrict"),
    version: col.int(),
    status: col.enum(gasDocStatus),
    overrides: col.jsonb(
      z.record(z.object({ value: z.string(), by: z.string(), at: z.string() }).strict()),
    ),
    remarks: col.jsonb(
      z.array(
        z
          .object({ at: z.string(), by: z.string(), reason: z.string(), version: z.number() })
          .strict(),
      ),
    ),
    history: col.jsonb(z.array(docHistoryItem)),
    scan: col.text({ nullable: true }),
    signedAt: col.timestamp({ nullable: true }),
    createdAt: col.timestamp(),
  },
);

export const gasDocFiles = table(
  {
    name: "gas_doc_files",
    comment: "Файл основания: схема, испытания, сертификат, приказ, скан. В демо только имя",
    primaryKey: ["id"],
    indexes: [
      { columns: ["objectId", "kind"], purpose: "файлы объекта по виду" },
      { columns: ["workId"], purpose: "схема и испытания работы" },
    ],
  },
  {
    id: col.key(),
    objectId: col.keyRef("gas_objects", "restrict"),
    kind: col.enum(gasFileKind),
    fileName: col.name(),
    workId: col.keyRef("gas_work_records", "restrict", { nullable: true }),
    itemId: col.keyRef("gas_nomenclature", "restrict", { nullable: true }),
    participantId: col.keyRef("gas_participants", "restrict", { nullable: true }),
    docId: col.keyRef("gas_exec_docs", "restrict", { nullable: true }),
    by: col.name(),
    at: col.timestamp(),
  },
);

export const gasRegistryVersions = table(
  {
    name: "gas_registry_versions",
    comment: "Закрытая версия реестра ИД объекта: строки на момент закрытия",
    primaryKey: ["id"],
    indexes: [{ columns: ["objectId", "version"], unique: true, purpose: "v1, v2 реестра" }],
  },
  {
    id: col.key(),
    objectId: col.keyRef("gas_objects", "restrict"),
    version: col.int(),
    closedAt: col.timestamp(),
    closedBy: col.name(),
    rows: col.jsonb(
      z.array(
        z
          .object({
            docId: z.string(),
            title: z.string(),
            details: z.string(),
            signedAt: z.string().nullable(),
            signers: z.string(),
          })
          .strict(),
      ),
    ),
  },
);

export const gasJournalEntries = table(
  {
    name: "gas_journal_entries",
    comment: "Принятая запись раздела 3 общего журнала работ",
    primaryKey: ["id"],
    indexes: [
      { columns: ["workId"], unique: true, purpose: "по работе одна запись" },
      { columns: ["objectId", "acceptedAt"], purpose: "журнал объекта" },
    ],
  },
  {
    id: col.key(),
    objectId: col.keyRef("gas_objects", "restrict"),
    workId: col.keyRef("gas_work_records", "restrict"),
    dates: col.name(),
    conditions: col.text(),
    text: col.name(),
    representative: col.text(),
    acceptedBy: col.name(),
    acceptedAt: col.timestamp(),
  },
);

/* ---------- Реестр ---------- */

/** Порядок важен: ссылки идут только на таблицы выше по списку (загрузка и вставка) */
const GAS_SCHEMAS = [
  gasGroups,
  gasBrigades,
  gasEmployees,
  gasObjects,
  gasUsers,
  gasTimeEntries,
  gasReviews,
  gasCrewMembers,
  gasRates,
  gasPeriodVersions,
  gasAudit,
  gasState,
  gasNomenclature,
  gasSuppliers,
  gasMaterialLimits,
  gasSupplyRequests,
  gasSupplyRequestLines,
  gasOffers,
  gasReceipts,
  gasParticipants,
  gasProjectSheets,
  gasWorkKinds,
  gasWorkRecords,
  gasExecDocs,
  gasDocFiles,
  gasRegistryVersions,
  gasJournalEntries,
] as const;

export const gasTables: TableDef[] = GAS_SCHEMAS.map((schema) =>
  registeredTables.find((def) => def.schema === schema)!,
);

export type GasRow<T extends z.ZodTypeAny> = z.infer<T>;
