import { z } from "zod";
import { col, idSchema, pgEnum, table } from "./db";

/* ---------- Сотрудники ---------- */

export const employeeRole = pgEnum(
  "employee_role",
  ["manager", "foreman", "pto", "supply", "finance", "worker"],
  "Роль сотрудника; от неё зависят доступные разделы и действия (фаза 4)",
);

export const employeeStatus = pgEnum(
  "employee_status",
  ["active", "vacation", "blocked"],
  "Может ли сотрудник работать в системе",
);

export const employees = table(
  {
    name: "employees",
    comment: "Сотрудники и пользователи системы",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["phone"], unique: true, purpose: "вход по телефону, привязка Telegram" },
      { columns: ["role", "status"], purpose: "выбор согласующих, прорабов и снабженцев" },
    ],
  },
  {
    id: col.id(),
    name: col.name(),
    position: col.name({ comment: "должность словами" }),
    role: col.enum(employeeRole),
    phone: col.name(),
    telegram: col.text({ nullable: true }),
    status: col.enum(employeeStatus),
  },
);

export const projectMembers = table(
  {
    name: "project_members",
    comment: "Кто из сотрудников работает на объекте",
    primaryKey: ["projectId", "employeeId"],
    indexes: [{ columns: ["employeeId"], purpose: "объекты сотрудника в выборе объекта" }],
  },
  {
    projectId: col.ref("projects", "cascade"),
    employeeId: col.ref("employees", "restrict"),
  },
);

/* ---------- Контрагенты ---------- */

export const counterpartyRole = pgEnum(
  "counterparty_role",
  ["customer", "supplier", "subcontractor"],
  "Роль контрагента по отношению к компании",
);

export const counterparties = table(
  {
    name: "counterparties",
    comment: "Заказчики, поставщики и субподрядчики",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["inn"], unique: true, purpose: "поиск и защита от дублей по ИНН" },
      { columns: ["role", "name"], purpose: "списки заказчиков и поставщиков по алфавиту" },
    ],
  },
  {
    id: col.id(),
    name: col.name(),
    role: col.enum(counterpartyRole),
    inn: col.name({ comment: "10 или 12 цифр" }),
    contactName: col.text(),
    email: col.text(),
    phone: col.text(),
    avgReplyHours: col.smallint({ comment: "средний срок ответа на запрос, ч" }),
    rating: col.numeric("numeric(2,1)", { comment: "оценка 0…5" }),
  },
);

export const contactStatus = pgEnum(
  "contact_status",
  ["verified", "needs_check", "stale"],
  "Свежесть контакта поставщика",
);

export const supplierProfiles = table(
  {
    name: "supplier_profiles",
    comment: "Профиль поставщика для подбора в запрос: регион, разделы спецификации, контакт",
    primaryKey: ["supplierId"],
    audited: true,
    indexes: [
      { columns: ["region"], purpose: "подбор поставщиков по региону объекта" },
      { columns: ["categories"], method: "gin", purpose: "подбор по разделам спецификации" },
    ],
  },
  {
    supplierId: col.ref("counterparties", "cascade"),
    region: col.name(),
    categories: col.textArray({ comment: "разделы спецификации: Подконструкция, Крепёж…" }),
    contactName: col.text(),
    phone: col.text(),
    email: col.text(),
    contactSource: col.text({ comment: "откуда взят контакт" }),
    contactCheckedAt: col.date(),
    contactStatus: col.enum(contactStatus),
  },
);

/* ---------- Бригады ---------- */

export const crews = table(
  {
    name: "crews",
    comment: "Бригады на объекте",
    primaryKey: ["id"],
    audited: true,
    indexes: [{ columns: ["projectId"], purpose: "команда объекта, отсутствующие отчёты" }],
    checks: ["headcount >= 0"],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "cascade"),
    name: col.name(),
    foremanId: col.ref("employees", "restrict"),
    headcount: col.smallint(),
    specialization: col.text(),
  },
);

export const crewMembers = table(
  {
    name: "crew_members",
    comment: "Состав бригады из сотрудников системы",
    primaryKey: ["crewId", "employeeId"],
    indexes: [{ columns: ["employeeId"], purpose: "в какой бригаде сотрудник" }],
  },
  {
    crewId: col.ref("crews", "cascade"),
    employeeId: col.ref("employees", "restrict"),
  },
);

/* ---------- Представления ---------- */

export const employeeView = employees.extend({ projectIds: z.array(idSchema) });
export const crewView = crews.extend({ memberIds: z.array(idSchema) });

export type EmployeeRow = z.infer<typeof employees>;
export type Employee = z.infer<typeof employeeView>;
export type ProjectMember = z.infer<typeof projectMembers>;
export type Counterparty = z.infer<typeof counterparties>;
export type SupplierProfile = z.infer<typeof supplierProfiles>;
export type ContactFreshness = z.infer<typeof contactStatus.schema>;
export type CrewRow = z.infer<typeof crews>;
export type Crew = z.infer<typeof crewView>;
export type CrewMember = z.infer<typeof crewMembers>;

/* ---------- Словари ---------- */

export const employeeRoleLabel: Record<Employee["role"], string> = {
  manager: "Руководитель проекта",
  foreman: "Прораб",
  pto: "ПТО",
  supply: "Снабжение",
  finance: "Финансы",
  worker: "Рабочий",
};

export const contactStatusLabel: Record<ContactFreshness, string> = {
  verified: "Проверен",
  needs_check: "Требует проверки",
  stale: "Устарел",
};
