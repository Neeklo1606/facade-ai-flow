import {
  purchaseStatus,
  tables,
  type ExtractedPosition,
  type ProjectOverview,
  type PurchaseStatus,
} from "@/contracts";
import { positionViews, type PositionFilter, type PositionView } from "@/domain/positions";
import type { RegistryFilter, RegistryItem } from "@/domain/registry";
import { wallIso, wallMs } from "@/domain/time";
import { projectView } from "@/adapters/state/assemble";
import type { TableRows } from "@/adapters/state/tables";
import type { KeyCodec } from "./codec";
import type { Driver } from "./driver";
import { selectColumns } from "./schema";

/**
 * Что считает база (ADR-005, п. 5): страницы и счётчики позиций, реестр объектов со сводкой.
 * Условия повторяют правила `domain/positions` и `domain/overview` — паритетный тест
 * `check:db` сверяет ответы с демо-адаптером на тех же данных.
 */

type Row = Record<string, unknown>;

/** Параметры запроса: `$n` по порядку добавления */
class Params {
  values: unknown[] = [];
  add(value: unknown) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/* ---------- Позиции ---------- */

const ACTIVE = "p.review not in ('excluded', 'merged', 'header')";
const VERIFIED = "p.review in ('confirmed', 'corrected')";
const PENDING = "p.review = 'pending'";
/** Полосы уверенности — `confidenceBand`: от 0,85 проверено, от 0,7 требует внимания */
const BAND_VERIFIED = "p.confidence >= 0.85";
const BAND_CLARIFY = "(p.confidence >= 0.7 and p.confidence < 0.85)";
const BAND_CHECK = "p.confidence < 0.7";
const IN_PROCUREMENT = `(${VERIFIED} and p.handed_over_at is not null)`;
const READY = `(${VERIFIED} and p.handed_over_at is not null and p.purchase = 'none' and p.match_status = 'confirmed')`;

const viewSql: Record<PositionView, string> = {
  active: ACTIVE,
  verified: VERIFIED,
  pending: PENDING,
  attention: `(${PENDING} and ${BAND_CLARIFY})`,
  check: `(${PENDING} and ${BAND_CHECK})`,
  excluded: `not (${ACTIVE})`,
  all: "true",
};

/** Позиции с листом, разделом, именем по справочнику и запросами — как `buildSnapshot` */
const POSITION_FROM = `positions p
  join document_sheets s on s.id = p.sheet_id
  left join materials m on m.id = p.material_id`;

const positionColumns = () => {
  const def = tables.find((item) => item.meta.name === "positions")!;
  return [
    selectColumns(def, "p").replace(
      `p.revision_id::text as "revisionId"`,
      `p.revision_id::text as "documentId"`,
    ),
    `s.number as "sheetNumber"`,
    `s.group_name as "group"`,
    `m.name as "normalizedName"`,
    // Запросы позиции без повторов, в порядке первой строки запроса — как Set в сборщике
    `array(select l.request_id::text from supply_request_positions srp
      join supply_request_lines l on l.id = srp.request_line_id
      where srp.position_id = p.id
      group by l.request_id order by min(srp.row_order), l.request_id) as "requestIds"`,
  ].join(", ");
};

function scopeWhere(filter: PositionFilter, params: Params, codec: KeyCodec) {
  const where: string[] = [];
  if (filter.projectId) where.push(`p.project_id = ${params.add(codec.encode(filter.projectId))}`);
  if (filter.revisionId)
    where.push(`p.revision_id = ${params.add(codec.encode(filter.revisionId))}`);
  return where;
}

/** `matchesFilter` в SQL; `except` — какие условия не применять (разделы в счётчиках) */
function filterWhere(
  filter: PositionFilter,
  params: Params,
  codec: KeyCodec,
  except: { sheet?: boolean; group?: boolean } = {},
) {
  const where = scopeWhere(filter, params, codec);
  if (filter.sheetId && !except.sheet)
    where.push(`p.sheet_id = ${params.add(codec.encode(filter.sheetId))}`);
  if (filter.group && !except.group) where.push(`s.group_name = ${params.add(filter.group)}`);
  where.push(viewSql[filter.view ?? "active"]);
  if (filter.stage) where.push(`${IN_PROCUREMENT} and p.purchase = ${params.add(filter.stage)}`);
  if (filter.chars === "with") where.push("jsonb_array_length(p.characteristics) > 0");
  if (filter.chars === "without") where.push("jsonb_array_length(p.characteristics) = 0");
  if (filter.readyForRequest) where.push(READY);
  return where.length ? where.join(" and ") : "true";
}

function decodePosition(row: Row, codec: KeyCodec): ExtractedPosition {
  const id = (value: unknown) => (typeof value === "string" ? codec.decode(value) : value);
  return {
    ...row,
    id: id(row["id"]),
    projectId: id(row["projectId"]),
    documentId: id(row["documentId"]),
    sheetId: id(row["sheetId"]),
    materialId: id(row["materialId"]),
    matchedBy: id(row["matchedBy"]),
    reviewedBy: id(row["reviewedBy"]),
    mergedInto: id(row["mergedInto"]),
    requestIds: (row["requestIds"] as string[]).map((value) => codec.decode(value)),
  } as ExtractedPosition;
}

export interface PositionPageInput extends PositionFilter {
  cursor: string | null;
  limit: number;
  order: "position" | "attention";
}

/** Страница позиций и общее число — пейджинг в базе */
export async function positionPage(driver: Driver, codec: KeyCodec, input: PositionPageInput) {
  const params = new Params();
  const where = filterWhere(input, params, codec);
  const offset = Number(input.cursor ?? 0);
  // «Сначала требующие разбора» — `byAttention`; при равенстве — порядок документа
  const order =
    input.order === "attention"
      ? `(${VERIFIED})::int, case when ${BAND_VERIFIED} then 2 when ${BAND_CLARIFY} then 1 else 0 end, p.row_order, p.id`
      : "p.row_order, p.id";
  const countParams = params.values.slice();
  const [countRows, rows] = await driver.batch(
    [
      {
        text: `select count(*)::int as n from ${POSITION_FROM} where ${where}`,
        values: countParams,
      },
      {
        text: `select ${positionColumns()} from ${POSITION_FROM} where ${where} order by ${order}
          offset ${params.add(offset)} limit ${params.add(input.limit)}`,
        values: params.values,
      },
    ],
    { readOnly: true },
  );
  const total = Number(countRows![0]!["n"]);
  return {
    items: rows!.map((row) => decodePosition(row, codec)),
    nextCursor: offset + input.limit < total ? String(offset + input.limit) : null,
    total,
  };
}

/** Счётчики экрана — `positionFacets` четырьмя запросами в одной транзакции */
export async function positionFacetsSql(driver: Driver, codec: KeyCodec, filter: PositionFilter) {
  const scopeParams = new Params();
  const scope = scopeWhere(filter, scopeParams, codec).join(" and ") || "true";
  const groupParams = new Params();
  const groupWhere = filterWhere(filter, groupParams, codec, { sheet: true, group: true });

  const [totals, stages, sheets, groups] = await driver.batch(
    [
      {
        text: `select ${positionViews.map((view) => `count(*) filter (where ${viewSql[view]})::int as "${view}"`).join(", ")},
          count(*) filter (where ${PENDING} and ${BAND_VERIFIED})::int as "autoVerified",
          count(*) filter (where ${READY})::int as "readyForRequest",
          count(*) filter (where ${VERIFIED} and p.handed_over_at is null)::int as "handOver",
          count(*) filter (where ${VERIFIED} and p.handed_over_at is null and m.name is null)::int as "needNormalization",
          count(*) filter (where ${VERIFIED} and p.handed_over_at is null and p.match_status <> 'confirmed')::int as "unconfirmedMatch",
          count(*) filter (where ${VERIFIED} and p.handed_over_at is null and jsonb_array_length(p.characteristics) = 0)::int as "withoutCharacteristics"
          from ${POSITION_FROM} where ${scope}`,
        values: scopeParams.values,
      },
      {
        text: `select p.purchase, count(*)::int as n from ${POSITION_FROM}
          where ${scope} and ${IN_PROCUREMENT} group by p.purchase`,
        values: scopeParams.values,
      },
      {
        // Листы в порядке первой позиции — как Map в правиле домена
        text: `select p.sheet_id::text as "sheetId",
            count(*) filter (where ${ACTIVE})::int as total,
            count(*) filter (where ${PENDING} and not (${BAND_VERIFIED}))::int as attention
          from ${POSITION_FROM} where ${scope}
          group by p.sheet_id order by min(p.row_order), p.sheet_id`,
        values: scopeParams.values,
      },
      {
        text: `select s.group_name as "group", count(*)::int as total,
            count(*) filter (where ${VERIFIED})::int as verified
          from ${POSITION_FROM} where ${groupWhere}
          group by s.group_name order by min(p.row_order), s.group_name`,
        values: groupParams.values,
      },
    ],
    { readOnly: true },
  );
  const row = totals![0]!;
  const count = (key: string) => Number(row[key] ?? 0);
  const stageCounts = Object.fromEntries(
    purchaseStatus.values.map((stage) => [stage, 0]),
  ) as Record<PurchaseStatus, number>;
  for (const item of stages!) stageCounts[item["purchase"] as PurchaseStatus] = Number(item["n"]);
  return {
    views: Object.fromEntries(positionViews.map((view) => [view, count(view)])) as Record<
      PositionView,
      number
    >,
    stages: stageCounts,
    sheets: sheets!.map((item) => ({
      sheetId: codec.decode(String(item["sheetId"])),
      total: Number(item["total"]),
      attention: Number(item["attention"]),
    })),
    groups: groups!.map((item) => ({
      group: String(item["group"]),
      total: Number(item["total"]),
      verified: Number(item["verified"]),
    })),
    autoVerified: count("autoVerified"),
    readyForRequest: count("readyForRequest"),
    handOver: {
      count: count("handOver"),
      needNormalization: count("needNormalization"),
      withoutCharacteristics: count("withoutCharacteristics"),
      unconfirmedMatch: count("unconfirmedMatch"),
    },
  };
}

/** Выделение раздела целиком: ключ и готовность к запросу */
export async function positionSelectionSql(
  driver: Driver,
  codec: KeyCodec,
  filter: PositionFilter,
) {
  const params = new Params();
  const rows = await driver.query<{ id: string; ready: boolean }>(
    `select p.id::text as id, ${READY} as ready from ${POSITION_FROM}
      where ${filterWhere(filter, params, codec)} order by p.row_order, p.id`,
    params.values,
  );
  return rows.map((row) => ({ id: codec.decode(row.id), ready: row.ready }));
}

/* ---------- Реестр объектов ---------- */

const DAY = 86_400_000;

/**
 * Реестр со сводкой по каждому объекту одним запросом — `projectOverview` и `registryRows`.
 * `projectId` — только этот объект: сводка для карточки.
 */
export async function registrySql(
  driver: Driver,
  codec: KeyCodec,
  filter: RegistryFilter & { projectId?: string },
  now: string,
): Promise<RegistryItem[]> {
  const params = new Params();
  const nowParam = params.add(now);
  // Неделя назад по календарной дате «сейчас», как в правиле домена
  const weekAgo = params.add(wallIso(wallMs(now.slice(0, 10)) - 7 * DAY).slice(0, 10));
  const where: string[] = [];
  if (filter.projectId) where.push(`p.id = ${params.add(codec.encode(filter.projectId))}`);
  if (filter.region) where.push(`p.region = ${params.add(filter.region)}`);
  if (filter.managerId) where.push(`p.manager_id = ${params.add(codec.encode(filter.managerId))}`);
  if (filter.status) where.push(`p.status = ${params.add(filter.status)}`);
  if (filter.unverified) where.push(`coalesce(spec.total, 0) - coalesce(spec.verified, 0) > 0`);

  const projectsDef = tables.find((item) => item.meta.name === "projects")!;
  const rows = await driver.query(
    `with
    rev_all as (
      select r.*, d.project_id,
        min(r.row_order) over (partition by r.document_id) as doc_first,
        row_number() over (partition by r.document_id order by r.revision desc, r.row_order) as rn
      from document_revisions r join documents d on d.id = r.document_id
    ),
    cur as (select * from rev_all where rn = 1),
    own as (
      select c.id,
        count(p.id) filter (where ${ACTIVE})::int as total,
        count(p.id) filter (where ${VERIFIED})::int as verified
      from cur c left join positions p on p.revision_id = c.id
      group by c.id
    ),
    rev as (
      select c.project_id, c.label, c.uploaded_at, c.doc_first,
        case when o.total > 0 or c.positions_total is null then o.total else c.positions_total end as total,
        case when o.total > 0 or c.positions_total is null then o.verified
          else coalesce(c.positions_verified, 0) end as verified
      from cur c join own o on o.id = c.id
    ),
    spec as (
      select project_id, sum(total)::int as total, sum(verified)::int as verified from rev group by project_id
    ),
    main as (
      select distinct on (project_id) project_id, label from rev where total > 0
      order by project_id, total desc, uploaded_at desc, doc_first
    ),
    pos as (
      select p.project_id,
        count(*) filter (where p.purchase in ('requested', 'offers', 'supplier_selected', 'ordered', 'delivered'))::int as in_requests,
        count(*) filter (where p.purchase in ('offers', 'supplier_selected', 'ordered', 'delivered'))::int as offers_received,
        count(*) filter (where p.purchase in ('ordered', 'delivered'))::int as ordered,
        count(*) filter (where p.purchase = 'delivered')::int as delivered,
        count(*) filter (where p.purchase = 'ordered' and exists (
          select 1 from supply_request_positions srp
          join supply_request_lines l on l.id = srp.request_line_id
          join deliveries d on d.request_id = l.request_id
          where srp.position_id = p.id and d.project_id = p.project_id
            and d.status in ('shipped', 'in_transit')))::int as in_transit
      from positions p where ${VERIFIED}
      group by p.project_id
    ),
    req as (
      select r.project_id,
        count(*) filter (where r.status in ('sent', 'decided'))::int as active,
        count(*) filter (where r.status = 'sent'
          and not exists (select 1 from project_decisions x where x.request_id = r.id)
          and not (a.answered >= a.recipients and a.answered > 0)
          and r.reply_due_at < ${nowParam}::timestamp at time zone 'UTC')::int as overdue
      from supply_requests r
      cross join lateral (
        select count(*)::int as recipients,
          count(*) filter (where exists (
            select 1 from supplier_offers o where o.request_id = r.id and o.supplier_id = rr.supplier_id
          ))::int as answered
        from supply_request_recipients rr where rr.request_id = r.id
      ) a
      group by r.project_id
    ),
    chg as (
      select d.project_id, count(*)::int as open_changes
      from revision_changes c join documents d on d.id = c.document_id
      where c.status = 'open' group by d.project_id
    ),
    crew as (
      select c.project_id, count(*) filter (where not exists (
        select 1 from field_reports f where f.crew_id = c.id and f.report_date >= ${weekAgo}::date
      ))::int as missing
      from crews c group by c.project_id
    ),
    dlv as (
      select project_id, count(*) filter (where status = 'arrived')::int as to_accept
      from deliveries group by project_id
    ),
    rmk as (
      select project_id, count(*) filter (where status = 'open')::int as open_remarks
      from delivery_remarks group by project_id
    )
    select ${selectColumns(projectsDef, "p")},
      cp.name as "customerName", ct.id::text as "contractId", ct.number as "contractNumber",
      main.label as "docVersion",
      coalesce(spec.total, 0) as "specTotal",
      coalesce(spec.total, 0) - coalesce(spec.verified, 0) as "specUnverified",
      coalesce(pos.in_requests, 0) as "inRequests",
      coalesce(pos.offers_received, 0) as "offersReceived",
      coalesce(pos.ordered, 0) as "ordered",
      coalesce(pos.in_transit, 0) as "inTransit",
      coalesce(pos.delivered, 0) as "delivered",
      coalesce(dlv.to_accept, 0) as "deliveriesToAccept",
      coalesce(rmk.open_remarks, 0) as "openRemarks",
      coalesce(req.active, 0) as "activeRequests",
      coalesce(req.overdue, 0) as "overdueRequests",
      coalesce(chg.open_changes, 0) as "openChanges",
      coalesce(crew.missing, 0) as "missingReports"
    from projects p
    left join counterparties cp on cp.id = p.customer_id
    left join lateral (
      select c.id, c.number from contracts c where c.project_id = p.id order by c.row_order desc, c.id limit 1
    ) ct on true
    left join spec on spec.project_id = p.id
    left join main on main.project_id = p.id
    left join pos on pos.project_id = p.id
    left join req on req.project_id = p.id
    left join chg on chg.project_id = p.id
    left join crew on crew.project_id = p.id
    left join dlv on dlv.project_id = p.id
    left join rmk on rmk.project_id = p.id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by "overdueRequests" desc, "specUnverified" desc, p.row_order, p.id`,
    params.values,
  );

  return rows.map((row) => {
    const project = projectView(
      {
        id: codec.decode(String(row["id"])),
        name: row["name"],
        code: row["code"],
        customerId: codec.decode(String(row["customerId"])),
        region: row["region"],
        stage: row["stage"],
        status: row["status"],
        managerId: codec.decode(String(row["managerId"])),
        startDate: row["startDate"],
        endDate: row["endDate"],
      } as TableRows["projects"][number],
      (row["customerName"] as string | null) ?? null,
      row["contractId"]
        ? { id: codec.decode(String(row["contractId"])), number: String(row["contractNumber"]) }
        : null,
    );
    const number = (key: string) => Number(row[key]);
    const overview: ProjectOverview = {
      projectId: project.id,
      region: project.region,
      stage: project.stage,
      docVersion: (row["docVersion"] as string | null) ?? "—",
      specTotal: number("specTotal"),
      specUnverified: number("specUnverified"),
      inRequests: number("inRequests"),
      offersReceived: number("offersReceived"),
      ordered: number("ordered"),
      inTransit: number("inTransit"),
      delivered: number("delivered"),
      deliveriesToAccept: number("deliveriesToAccept"),
      openRemarks: number("openRemarks"),
      activeRequests: number("activeRequests"),
      overdueRequests: number("overdueRequests"),
      openChanges: number("openChanges"),
      missingReports: number("missingReports"),
    };
    return { project, overview };
  });
}
