/**
 * Снимок модулей сервиса v1 ↔ строки таблиц `src/contracts/gas.ts` (ADR-060).
 *
 * Имена полей строк совпадают с domain, поэтому перевод почти тождественный. Отличия:
 * - позиции заявки живут своей таблицей, у заявки их нет;
 * - «все объекты» пользователя — `null` в `allowed_object_ids`;
 * - необязательное поле без значения хранится как `null` и читается обратно без ключа;
 * - состояние учёта времени до S4 лежит одной строкой `gas_state`.
 * Порядок строк в массиве снимка хранит `row_order`.
 */
import type { User } from "@/domain/gas-ops/model";
import type { SupplyRequest } from "@/domain/gas-ops/supply";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

export type Row = Record<string, unknown>;
export type GasRows = Record<string, Row[]>;

/** Поля снимка до S4, которые хранятся одной строкой `gas_state` */
const STATE_KEYS = [
  "today",
  "week",
  "estimates",
  "frames",
  "assignments",
  "actorId",
  "estimateVersions",
  "costRules",
  "schedule",
  "brigadeAvailability",
  "reviewSettings",
  "finalChecks",
  "reportIssues",
] as const;

/** Необязательные поля записи времени: в базе `null`, в снимке ключа нет */
const ENTRY_OPTIONAL = [
  "revenueInFile",
  "excelRow",
  "headcount",
  "people",
  "clientKey",
  "channel",
  "note",
] as const;

/** Журнал растёт с головы: `row_order` от конца массива, иначе каждая запись сдвигала бы все строки */
export const PREPENDED = new Set(["gas_audit"]);

const withNulls = (row: Row, keys: readonly string[]): Row => {
  const out = { ...row };
  for (const key of keys) if (out[key] === undefined) out[key] = null;
  return out;
};

const withoutNulls = (row: Row, keys: readonly string[]): Row => {
  const out = { ...row };
  for (const key of keys) if (out[key] === null) delete out[key];
  return out;
};

export function snapshotToRows(s: GasOpsSnapshot): GasRows {
  const { supply, docs } = s;
  return {
    gas_groups: s.groups.map((g) => ({ ...g })),
    gas_brigades: s.brigades.map((b) => ({ ...b })),
    gas_employees: s.employees.map((e) => ({ ...e })),
    gas_objects: s.objects.map((o) => ({ ...o })),
    gas_users: s.users.map((u) => ({
      ...u,
      allowedObjectIds: u.allowedObjectIds === "all" ? null : u.allowedObjectIds,
    })),
    gas_time_entries: s.entries.map((e) => withNulls({ ...e }, ENTRY_OPTIONAL)),
    gas_reviews: s.reviews.map((r) => ({ ...r })),
    gas_crew_members: s.crew.map((c) => ({ ...c })),
    gas_rates: s.rates.map((r) => ({ ...r })),
    gas_period_versions: s.periods.map((p) => ({ ...p })),
    gas_audit: s.audit.map((a) => ({ ...a })),
    gas_state: [
      { key: "main", state: Object.fromEntries(STATE_KEYS.map((k) => [k, s[k] ?? null])) },
    ],
    gas_nomenclature: supply.items.map((i) => ({ ...i })),
    gas_suppliers: supply.suppliers.map((x) => ({ ...x })),
    gas_material_limits: supply.limits.map((l) => ({ ...l })),
    gas_supply_requests: supply.requests.map(({ lines: _lines, ...r }) => ({ ...r })),
    gas_supply_request_lines: supply.requests.flatMap((r) =>
      r.lines.map((l) => ({ ...l, requestId: r.id })),
    ),
    gas_offers: supply.offers.map((o) => ({ ...o })),
    gas_receipts: supply.receipts.map((r) => ({ ...r })),
    gas_participants: docs.participants.map((p) => ({ ...p })),
    gas_project_sheets: docs.sheets.map((x) => ({ ...x })),
    gas_work_kinds: docs.kinds.map((k) => ({ ...k })),
    gas_work_records: docs.works.map((w) => ({ ...w })),
    gas_exec_docs: docs.docs.map((d) => ({ ...d })),
    gas_doc_files: docs.files.map((f) => ({ ...f })),
    gas_registry_versions: docs.registries.map((r) => ({ ...r })),
    gas_journal_entries: docs.journal.map((j) => ({ ...j })),
  };
}

export function rowsToSnapshot(rows: GasRows): GasOpsSnapshot {
  const list = <T>(table: string) => (rows[table] ?? []) as T[];
  const state = (list<Row>("gas_state")[0]?.["state"] ?? {}) as Record<string, unknown>;
  const lines = new Map<string, SupplyRequest["lines"]>();
  for (const { requestId, ...line } of list<Row & { requestId: string }>(
    "gas_supply_request_lines",
  )) {
    lines.set(requestId, [
      ...(lines.get(requestId) ?? []),
      line as unknown as SupplyRequest["lines"][number],
    ]);
  }
  return {
    ...(state as Pick<GasOpsSnapshot, (typeof STATE_KEYS)[number]>),
    groups: list("gas_groups"),
    brigades: list("gas_brigades"),
    employees: list("gas_employees"),
    objects: list("gas_objects"),
    users: list<Row>("gas_users").map(
      (u) => ({ ...u, allowedObjectIds: u["allowedObjectIds"] ?? "all" }) as User,
    ),
    entries: list<Row>("gas_time_entries").map(
      (e) => withoutNulls(e, ENTRY_OPTIONAL) as unknown as GasOpsSnapshot["entries"][number],
    ),
    reviews: list("gas_reviews"),
    crew: list("gas_crew_members"),
    rates: list("gas_rates"),
    periods: list("gas_period_versions"),
    audit: list("gas_audit"),
    supply: {
      items: list("gas_nomenclature"),
      suppliers: list("gas_suppliers"),
      limits: list("gas_material_limits"),
      requests: list<Omit<SupplyRequest, "lines">>("gas_supply_requests").map((r) => ({
        ...r,
        lines: lines.get(r.id) ?? [],
      })),
      offers: list("gas_offers"),
      receipts: list("gas_receipts"),
    },
    docs: {
      participants: list("gas_participants"),
      sheets: list("gas_project_sheets"),
      kinds: list("gas_work_kinds"),
      works: list("gas_work_records"),
      docs: list("gas_exec_docs"),
      files: list("gas_doc_files"),
      registries: list("gas_registry_versions"),
      journal: list("gas_journal_entries"),
    },
  };
}
