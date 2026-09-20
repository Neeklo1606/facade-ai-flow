/**
 * Паритет адаптера PostgreSQL с демо-адаптером (ADR-005, пп. 7, 13).
 *
 * По DATABASE_URL создаёт временную базу, применяет миграции dbmate, сверяет колонки
 * с контрактами, загружает сид и выполняет одну и ту же цепочку операций через демо-адаптер
 * и через базу. Ответы сравниваются целиком; ключи новых записей — по месту: `…-live-…`
 * в демо и `uuid` в базе должны соответствовать друг другу одинаково во всех ответах.
 * В конце — замер реестра материалов объекта на 847 позиций. Временная база удаляется.
 *
 * Запуск: DATABASE_URL=postgres://localhost/postgres bun run check:db (нужно право CREATEDB).
 */
import { spawnSync } from "node:child_process";
import pg from "pg";
import { enums, sqlName, tables } from "../src/contracts";
import { checklistFor, deliveryFamilies } from "../src/domain/deliveries";
import { createDemoRepositories, setClockSource, type ClockSource } from "../src/adapters/demo";
import {
  createDbRepositories,
  createDriver,
  fixtureCodec,
  seedDatabase,
  type Driver,
} from "../src/adapters/db";
import { UUID } from "../src/adapters/db/codec";
import { sqlState } from "../src/adapters/db/driver";
import { STALE_VERSION, diffStatements, loadTables } from "../src/adapters/db/store";
import { buildSnapshot, snapshotTables } from "../src/adapters/state/assemble";
import { FIXTURES_NOW } from "../src/adapters/fixtures";
import type { Repositories } from "../src/ports";

const adminUrl = process.env["DATABASE_URL"];
if (!adminUrl) {
  console.error("check:db: задайте DATABASE_URL — сервер PostgreSQL 16 с правом CREATEDB");
  process.exit(1);
}

const url = new URL(adminUrl);
const database = `fieldops_check_${process.pid}_${Date.now()}`;
const checkUrl = new URL(adminUrl);
checkUrl.pathname = `/${database}`;

/* ---------- Миграции ---------- */

function migrate() {
  const started = performance.now();
  const result = spawnSync(
    "node_modules/.bin/dbmate",
    ["--url", checkUrl.toString(), "--migrations-dir", "db/migrations", "--no-dump-schema", "up"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`dbmate up:\n${result.stdout}${result.stderr}`);
  console.log(`✓ миграции dbmate за ${Math.round(performance.now() - started)} мс`);
}

/* ---------- Колонки базы и контракты ---------- */

async function checkColumns(db: Driver) {
  const rows = await db.query<{ table: string; column: string; type: string; notnull: boolean }>(
    `select c.relname as table, a.attname as column,
       format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull
     from pg_attribute a join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`,
  );
  const actual = new Map(rows.map((row) => [`${row.table}.${row.column}`, row]));
  const named: Record<string, string> = {
    timestamptz: "timestamp with time zone",
  };
  const service = new Set(["created_at", "updated_at", "created_by", "row_order"]);
  const problems: string[] = [];
  const expected = new Set<string>();
  for (const def of tables) {
    for (const [key, column] of Object.entries(def.columns)) {
      const name = `${def.meta.name}.${sqlName(key)}`;
      expected.add(name);
      const found = actual.get(name);
      if (!found) {
        problems.push(`нет колонки ${name}`);
        continue;
      }
      const type = named[column.sqlType] ?? column.sqlType;
      if (found.type !== type) problems.push(`${name}: ${found.type}, в контракте ${type}`);
      if (found.notnull === column.nullable) {
        problems.push(
          `${name}: not null = ${found.notnull}, в контракте nullable = ${column.nullable}`,
        );
      }
    }
    if (!actual.has(`${def.meta.name}.row_order`)) problems.push(`нет ${def.meta.name}.row_order`);
  }
  const enumNames = new Set(enums.map((item) => item.name));
  // Значения перечислений базы — те же и в том же порядке, что в контрактах
  const labels = await db.query<{ name: string; values: string[] }>(
    `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder)::text[] as values
     from pg_type t join pg_enum e on e.enumtypid = t.oid
     join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' group by t.typname`,
  );
  const actualEnums = new Map(labels.map((row) => [row.name, row.values]));
  for (const item of enums) {
    const values = actualEnums.get(item.name);
    if (!values) problems.push(`нет перечисления ${item.name}`);
    else if (values.join() !== item.values.join()) {
      problems.push(
        `${item.name}: в базе ${values.join(", ")}, в контракте ${item.values.join(", ")}`,
      );
    }
  }
  for (const [name] of actual) {
    const [table, column] = name.split(".") as [string, string];
    if (table === "app_state" || table === "schema_migrations") continue;
    if (!expected.has(name) && !service.has(column)) problems.push(`лишняя колонка ${name}`);
  }
  if (problems.length) {
    console.error(`✗ колонки базы расходятся с контрактами:\n  ${problems.join("\n  ")}`);
    return true;
  }
  console.log(
    `✓ колонки и перечисления базы совпадают с контрактами: ${tables.length} таблиц, ${expected.size} колонок, ${enumNames.size} перечислений`,
  );
  return false;
}

/* ---------- Паритет ---------- */

/** Пошаговые часы: каждая запись — на минуту позже; одинаковые у обоих адаптеров */
function stepClock(): ClockSource {
  let now = new Date(`${FIXTURES_NOW}Z`).getTime();
  const iso = () => new Date(now).toISOString().slice(0, 19);
  return {
    tick: () => {
      now += 60_000;
      return iso();
    },
    peek: iso,
  };
}

type Outcome = { ok: unknown } | { error: string };
/**
 * Blob не сравнить по полям: у него нет перечислимых свойств. Байты тоже не годятся — .xlsx это
 * zip, и в нём лежит время сборки: два одинаковых файла, собранные в разные секунды, различаются.
 * Сравниваем содержимое: имена записей, их размеры и контрольные суммы из оглавления архива
 */
function zipContents(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Оглавление ищем с конца: сигнатура конца центрального каталога
  let end = data.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) return ["не zip"];
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const name = new TextDecoder().decode(data.subarray(at + 46, at + 46 + nameLength));
    entries.push(`${name} ${size} ${crc.toString(16)}`);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries.sort();
}

const bytes = async (value: unknown) =>
  value instanceof Blob ? zipContents(new Uint8Array(await value.arrayBuffer())) : value;
const settle = (promise: Promise<unknown>): Promise<Outcome> =>
  promise.then(
    async (ok) => ({ ok: await bytes(ok) }),
    (error: unknown) => ({
      error: error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error),
    }),
  );

const LIVE = /[\w-]+-live-\d+-\d+/g;
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** Сравнение ответов: ключи новых записей — по месту, остальное — точно */
class Matcher {
  demoToDb = new Map<string, string>();
  dbToDemo = new Map<string, string>();
  problems: string[] = [];

  pair(demo: string, db: string, path: string) {
    const known = this.demoToDb.get(demo);
    const back = this.dbToDemo.get(db);
    if ((known && known !== db) || (back && back !== demo)) {
      this.problems.push(`${path}: ключ ${demo} сопоставлен с разными ключами базы`);
      return;
    }
    this.demoToDb.set(demo, db);
    this.dbToDemo.set(db, demo);
  }

  same(demo: unknown, db: unknown, path: string): void {
    if (this.problems.length > 20) return;
    if (typeof demo === "string" && typeof db === "string") {
      if (demo === db) return;
      // Ключ новой записи целиком: `…-live-…` в демо, `uuid` в базе
      if (new RegExp(`^${LIVE.source}$`).test(demo) && UUID.test(db)) {
        this.pair(demo, db, path);
        return;
      }
      // Строка со встроенными ключами (адрес, производный ключ `tl-<решение>`): подставить
      // уже сопоставленные ключи, длинные первыми
      const known = [...this.demoToDb.entries()].sort((a, b) => b[0].length - a[0].length);
      if (known.reduce((text, [from, to]) => text.split(from).join(to), demo) === db) return;
      const liveKeys = demo.match(LIVE) ?? [];
      const dbKeys = (db.match(UUIDS) ?? []).filter((key) => UUID.test(key));
      if (
        liveKeys.length &&
        liveKeys.length === dbKeys.length &&
        demo.replace(LIVE, "<ключ>") === db.replace(UUIDS, "<ключ>")
      ) {
        liveKeys.forEach((key, index) => this.pair(key, dbKeys[index]!, path));
        return;
      }
      this.problems.push(`${path}: демо «${demo}», база «${db}»`);
      return;
    }
    if (demo instanceof Uint8Array || db instanceof Uint8Array) {
      const a = demo as Uint8Array;
      const b = db as Uint8Array;
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) {
        this.problems.push(`${path}: файлы выгрузки различаются`);
      }
      return;
    }
    if (Array.isArray(demo) && Array.isArray(db)) {
      if (demo.length !== db.length) {
        this.problems.push(`${path}: в демо ${demo.length} элементов, в базе ${db.length}`);
        return;
      }
      demo.forEach((item, index) => this.same(item, db[index], `${path}[${index}]`));
      return;
    }
    if (demo && db && typeof demo === "object" && typeof db === "object") {
      const keys = (value: object) =>
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key]) => key)
          .sort();
      const left = keys(demo);
      const right = keys(db);
      if (left.join() !== right.join()) {
        this.problems.push(`${path}: поля демо [${left}] и базы [${right}]`);
        return;
      }
      for (const key of left) {
        this.same(
          (demo as Record<string, unknown>)[key],
          (db as Record<string, unknown>)[key],
          `${path}.${key}`,
        );
      }
      return;
    }
    if (!Object.is(demo, db))
      this.problems.push(`${path}: демо ${String(demo)}, база ${String(db)}`);
  }
}

interface Step {
  name: string;
  run: (r: Repositories) => Promise<unknown>;
  /** Шаг проверяет отказ: у остальных записей отказ — поломка цепочки, а не совпадение */
  fails?: true;
}

const actor = { actorId: "e-volkova" };
const supply = { actorId: "e-dorohov" };
const foreman = { actorId: "e-gareev" };

/** Чтения, которые сверяются после каждой записи */
const reads: Step[] = [
  { name: "реестр объектов", run: (r) => r.projects.list({}) },
  { name: "реестр: непроверенные", run: (r) => r.projects.list({ unverified: true }) },
  {
    name: "реестр: регион и ответственный",
    run: (r) => r.projects.list({ region: "Москва", managerId: "e-sokolov" }),
  },
  { name: "карточка объекта", run: (r) => r.projects.card("p-korona") },
  { name: "выгрузка реестра", run: (r) => r.projects.exportRegistry({}) },
  { name: "счётчики объекта", run: (r) => r.positions.facets({ projectId: "p-korona" }) },
  {
    name: "счётчики с фильтром",
    run: (r) => r.positions.facets({ projectId: "p-korona", view: "verified", chars: "with" }),
  },
  { name: "страница позиций", run: (r) => r.positions.list({ projectId: "p-korona", limit: 40 }) },
  {
    name: "страница 3, сначала требующие разбора",
    run: (r) =>
      r.positions.list({
        revisionId: "pd-korona-spec",
        order: "attention",
        cursor: "80",
        limit: 40,
      }),
  },
  {
    name: "позиции этапа «запрошено»",
    run: (r) =>
      r.positions.list({ projectId: "p-korona", view: "verified", stage: "requested", limit: 200 }),
  },
  {
    name: "готовые к запросу",
    run: (r) => r.positions.selection({ projectId: "p-korona", readyForRequest: true }),
  },
  {
    name: "выделение раздела",
    run: (r) => r.positions.selection({ projectId: "p-korona", view: "all" }),
  },
  { name: "запросы объекта", run: (r) => r.procurement.requests("p-korona") },
  { name: "поставки объекта", run: (r) => r.procurement.deliveries("p-korona") },
  { name: "ждут решения", run: (r) => r.timeline.pending("p-korona") },
  { name: "история объекта", run: (r) => r.timeline.list("p-korona") },
  { name: "документы", run: (r) => r.documents.list({ projectId: "p-korona" }) },
  { name: "поставщики", run: (r) => r.procurement.suppliers() },
  { name: "сотрудники", run: (r) => r.directory.employees() },
  { name: "объекты прораба", run: (r) => r.scope.projectsOf("e-gareev") },
  { name: "объект поставки", run: (r) => r.scope.projectOf("delivery", "dl-501") },
  { name: "изменения документации", run: (r) => r.documents.changes({ projectId: "p-korona" }) },
  {
    name: "позиции листа",
    run: (r) => r.positions.list({ revisionId: "pd-korona-spec", sheetId: "sh-84", limit: 50 }),
  },
  {
    name: "позиции раздела",
    run: (r) => r.positions.list({ projectId: "p-korona", group: "Подконструкция", limit: 50 }),
  },
  {
    name: "позиции без характеристик",
    run: (r) => r.positions.list({ projectId: "p-korona", chars: "without", limit: 50 }),
  },
  {
    name: "счётчики листа и раздела",
    run: (r) =>
      r.positions.facets({
        revisionId: "pd-korona-spec",
        sheetId: "sh-85",
        group: "Подконструкция",
      }),
  },
  { name: "реестр: статус объекта", run: (r) => r.projects.list({ status: "at_risk" }) },
  { name: "позиция", run: (r) => r.positions.item("pos-0001") },
  { name: "история позиции", run: (r) => r.positions.history("pos-0001") },
  { name: "номенклатура", run: (r) => r.positions.materials() },
  { name: "предложенные замены", run: (r) => r.positions.replacements() },
  { name: "карточка ревизии", run: (r) => r.documents.card("pd-korona-spec") },
  { name: "карточка запроса", run: (r) => r.procurement.request("sr-323") },
  { name: "карточка поставщика", run: (r) => r.procurement.supplier("c-fk") },
  { name: "шаблоны писем", run: (r) => r.procurement.templates() },
  { name: "карточка поставки", run: (r) => r.procurement.delivery("dl-503") },
  { name: "отчёты с площадки", run: (r) => r.reports.list("p-korona") },
  { name: "категории справочника", run: (r) => r.catalog.categories() },
  { name: "карточка материала", run: (r) => r.catalog.material("mat-bracket") },
  { name: "решения объекта", run: (r) => r.timeline.decisions("p-korona") },
  { name: "контрагенты", run: (r) => r.directory.counterparties() },
];

async function firstIds(r: Repositories, view: "pending" | "verified", count: number) {
  const page = await r.positions.list({ revisionId: "pd-korona-spec", view, limit: count });
  return page.items.map((item) => item.id);
}

/** Цепочка ADR-005, п. 7: проверка, передача, запрос, решение, приёмка, сопоставление, справочник */
const writes: Step[] = [
  {
    name: "подтвердить позиции",
    run: async (r) => r.positions.confirm({ ids: await firstIds(r, "pending", 5) }, actor),
  },
  {
    name: "исправить позицию",
    run: async (r) => {
      const [id] = await firstIds(r, "pending", 1);
      return r.positions.correct(
        {
          id: id!,
          projectName: "Кронштейн КР-150, правка ПТО",
          qty: 12.5,
          unit: "шт",
          characteristics: [],
        },
        actor,
      );
    },
  },
  {
    name: "исключить позицию и отменить",
    run: async (r) => {
      const [id] = await firstIds(r, "pending", 1);
      await r.positions.exclude({ id: id! }, actor);
      return r.positions.undoReview(
        { items: [{ id: id!, from: "excluded", to: "pending" }] },
        actor,
      );
    },
  },
  {
    name: "разделить позицию",
    run: async (r) => {
      const page = await r.positions.list({
        revisionId: "pd-korona-spec",
        view: "pending",
        limit: 40,
      });
      const item = page.items.find((position) => position.qty >= 2)!;
      return r.positions.split({ id: item.id, firstQty: 1 }, actor);
    },
  },
  {
    name: "подтвердить сопоставление",
    run: async (r) => {
      const page = await r.positions.list({
        revisionId: "pd-korona-spec",
        view: "verified",
        limit: 200,
      });
      const item = page.items.find((position) => position.matchStatus === "suggested")!;
      return r.positions.confirmMatch(
        { positionId: item.id, materialId: item.materialId! },
        supply,
      );
    },
  },
  {
    name: "передача с неразобранными — отказ",
    fails: true,
    run: (r) => r.positions.handOver({ revisionId: "pd-korona-spec" }, actor),
  },
  {
    name: "запрос поставщикам",
    run: async (r) => {
      const ready = await r.positions.selection({ projectId: "p-korona", readyForRequest: true });
      return r.procurement.createRequest(
        {
          projectId: "p-korona",
          positionIds: ready
            .filter((item) => item.ready)
            .slice(0, 6)
            .map((item) => item.id),
          supplierIds: ["c-fk", "c-mp"],
          templateId: null,
          replyDueAt: "2026-09-12T18:00:00",
        },
        supply,
      );
    },
  },
  {
    name: "напомнить поставщикам",
    run: (r) => r.procurement.remind({ requestId: "sr-318" }, supply),
  },
  {
    name: "объединить позиции",
    run: async (r) => {
      const [source, target] = await firstIds(r, "pending", 2);
      return r.positions.merge({ sourceId: source!, targetId: target! }, actor);
    },
  },
  {
    name: "отметить заголовком и вернуть в работу",
    run: async (r) => {
      // Не первая позиция: к ней уже присоединили другую на шаге объединения
      const ids = await firstIds(r, "pending", 3);
      const id = ids[2]!;
      await r.positions.markHeader({ id }, actor);
      return r.positions.reopen({ id }, actor);
    },
  },
  {
    name: "подтвердить все проверенные ревизии",
    run: (r) => r.positions.confirmAutoVerified({ revisionId: "pd-korona-spec" }, actor),
  },
  {
    name: "загрузка документа",
    run: (r) =>
      r.documents.upload(
        { projectId: "p-korona", documentId: null, fileName: "dobory.pdf", sizeKb: 1200 },
        actor,
      ),
  },
  {
    name: "проверка отчёта с площадки",
    run: async (r) => {
      const report = (await r.reports.list("p-korona")).find(
        (item) => item.report.status === "review",
      )!;
      return r.reports.review(
        { id: report.report.id, status: "accepted", acceptedQty: 120 },
        actor,
      );
    },
  },
  {
    name: "контакт поставщика проверен",
    run: (r) => r.procurement.verifyContact({ supplierId: "c-fk" }, supply),
  },
  {
    name: "решение по запросу",
    run: (r) =>
      r.procurement.chooseSupplier(
        {
          requestId: "sr-323",
          supplierId: "c-kt",
          reason: "Лучшая цена и срок поставки, остаток есть на складе",
          approvedBy: "e-sokolov",
        },
        supply,
      ),
  },
  {
    name: "поставка прибыла",
    run: (r) =>
      r.procurement.moveDelivery({ deliveryId: "dl-501", status: "arrived", note: null }, foreman),
  },
  {
    name: "приёмка с замечаниями",
    run: async (r) => {
      const card = (await r.procurement.delivery("dl-501"))!;
      return r.procurement.acceptDelivery(
        {
          deliveryId: "dl-501",
          result: "accepted_with_remarks",
          lines: card.delivery.items.map((line, index) => ({
            lineId: line.id,
            acceptedQty: index === 0 ? Math.max(0, line.qty - 1) : line.qty,
            remark: index === 0 ? "Недостача одной единицы" : null,
          })),
          checklist: checklistFor(
            deliveryFamilies(card.delivery, await r.positions.materials()),
          ).map((item) => ({
            id: item.id,
            label: item.label,
            ok: true,
            note: null,
          })),
          photos: [{ dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", caption: "Недостача" }],
          reason: null,
          confirmed: true,
        },
        foreman,
      );
    },
  },
  {
    name: "закрыть замечание",
    run: async (r) => {
      const card = (await r.procurement.delivery("dl-501"))!;
      return r.procurement.resolveRemark(
        { remarkId: card.remarks[0]!.id, resolution: "Поставщик довезёт в следующей партии" },
        supply,
      );
    },
  },
  {
    name: "новый материал в справочнике",
    run: (r) =>
      r.catalog.saveMaterial(
        {
          id: null,
          name: "Кронштейн усиленный КУ-200, сталь оцинкованная",
          unit: "шт",
          categoryId: "cat-brackets",
          characteristics: [{ label: "Толщина", value: "3 мм" }],
          synonyms: ["Кронштейн КУ-200"],
          spellings: [],
        },
        supply,
      ),
  },
  {
    name: "повтор названия — отказ",
    fails: true,
    run: (r) =>
      r.catalog.saveMaterial(
        {
          id: null,
          name: "Кронштейн усиленный КУ-200, сталь оцинкованная",
          unit: "шт",
          categoryId: "cat-brackets",
          characteristics: [],
          synonyms: [],
          spellings: [],
        },
        supply,
      ),
  },
  {
    name: "статус объекта: «Под риском» → «В работе»",
    run: (r) => r.projects.setStatus({ projectId: "p-korona", status: "active" }, actor),
  },
  {
    name: "контрольная точка выполнена",
    run: async (r) => {
      const card = (await r.projects.card("p-korona"))!;
      const open = card.milestones.find((item) => item.status !== "done")!;
      return r.projects.completeMilestone({ projectId: "p-korona", milestoneId: open.id }, actor);
    },
  },
  {
    name: "изменение ревизии разобрано",
    run: async (r) => {
      const [change] = await r.documents.changes({ projectId: "p-korona", status: "open" });
      return r.documents.resolveChange({ projectId: "p-korona", changeId: change!.id }, actor);
    },
  },
  {
    name: "изменение чужого объекта — отказ",
    fails: true,
    run: async (r) => {
      const [change] = await r.documents.changes({ projectId: "p-korona", status: "open" });
      return r.documents.resolveChange({ projectId: "p-meridian", changeId: change!.id }, actor);
    },
  },
  {
    name: "новый объект с новым заказчиком и договором",
    run: (r) =>
      r.projects.create(
        {
          name: "ЖК «Север», корпус 2",
          code: "SEV-2",
          region: "Москва",
          customer: "ООО «Север-Девелопмент»",
          contractNumber: "Д-2026/77",
          startDate: "2026-10-01",
          endDate: "2027-06-30",
          managerId: "e-sokolov",
        },
        actor,
      ),
  },
];

async function parity(db: Driver) {
  setClockSource(stepClock());
  const demo = createDemoRepositories({ persist: false, simulate: false });
  const base = createDbRepositories({ driver: db, codec: fixtureCodec(), clock: stepClock() });
  const matcher = new Matcher();
  let steps = 0;
  const compare = async (step: Step) => {
    const before = matcher.problems.length;
    const [a, b] = [await settle(step.run(demo)), await settle(step.run(base))];
    matcher.same(a, b, step.name);
    // Совпадающий отказ там, где ждали выполнения, — не паритет, а сломанная цепочка
    if (!step.fails && "error" in a && "error" in b) {
      matcher.problems.push(`${step.name}: шаг не выполнился у обоих адаптеров — ${a.error}`);
    }
    steps += 1;
    if (matcher.problems.length > before) console.error(`✗ ${step.name}`);
    return a;
  };
  for (const step of reads) await compare(step);
  for (const step of writes) {
    const outcome = await compare(step);
    console.log(`  ${step.name}: ${"error" in outcome ? `отказ — ${outcome.error}` : "выполнено"}`);
    for (const read of reads) await compare({ ...read, name: `${step.name} → ${read.name}` });
  }
  if (matcher.problems.length) {
    console.error(
      `✗ паритет: ${matcher.problems.length} расхождений\n  ${matcher.problems.slice(0, 20).join("\n  ")}`,
    );
    return true;
  }
  console.log(
    `✓ паритет: ${steps} сравнений (${writes.length} записей, после каждой — ${reads.length} чтений), новых ключей сопоставлено ${matcher.demoToDb.size}`,
  );
  return false;
}

/* ---------- Параллельные записи ---------- */

/**
 * Версия данных (ADR-005, п. 5). Пакет, собранный по устаревшей загрузке, база отвергает
 * с кодом 40001. Записи одного сервера идут по очереди; записи двух серверов одновременно
 * расходятся по версии, и проигравший повторяет действие на свежих данных.
 */
async function concurrency(db: Driver) {
  const codec = fixtureCodec();
  const problems: string[] = [];
  const version = async () =>
    (await db.query<{ version: number }>("select version::int as version from app_state"))[0]!
      .version;

  // Устаревший пакет: загрузили, кто-то записал, пишем по старой загрузке
  const one = createDbRepositories({ driver: db, codec, clock: stepClock() });
  const [target] = await firstIds(one, "pending", 1);
  const stale = await loadTables(db, codec);
  await one.positions.confirm({ ids: [target!] }, actor);
  const tables = snapshotTables(buildSnapshot(stale.tables));
  tables.positions = tables.positions.map((row) =>
    row.id === target ? { ...row, note: "запись по устаревшим данным" } : row,
  );
  const rejected = await db.batch(diffStatements(stale, tables, codec)).then(
    () => null,
    (error: unknown) => sqlState(error),
  );
  if (rejected !== STALE_VERSION)
    problems.push(`устаревший пакет: ожидался отказ 40001, получено ${rejected}`);
  if ((await one.positions.item(target!))?.note === "запись по устаревшим данным") {
    problems.push("устаревший пакет записал данные");
  }

  // Два сервера, по две записи одновременно
  let retries = 0;
  const servers = [0, 1].map(() =>
    createDbRepositories({ driver: db, codec, clock: stepClock(), onRetry: () => (retries += 1) }),
  );
  const ids = await firstIds(one, "pending", 4);
  const before = await version();
  await Promise.all(
    ids.map((id, index) => servers[index % 2]!.positions.confirm({ ids: [id] }, actor)),
  );
  const items = await Promise.all(ids.map((id) => one.positions.item(id)));
  const confirmed = items.filter((item) => item?.review === "confirmed").length;
  const grown = (await version()) - before;
  if (confirmed !== ids.length || grown !== ids.length) {
    problems.push(
      `одновременные записи: подтверждено ${confirmed} из ${ids.length}, версия +${grown}`,
    );
  }
  if (problems.length) {
    console.error(`✗ версия данных:\n  ${problems.join("\n  ")}`);
    return true;
  }
  console.log(
    `✓ версия данных: устаревший пакет отвергнут (40001) и ничего не записал; ${ids.length} одновременные записи с двух серверов записаны все, повторов ${retries}`,
  );
  return false;
}

/* ---------- Замер ---------- */

async function timing(db: Driver) {
  const base = createDbRepositories({ driver: db, codec: fixtureCodec(), clock: stepClock() });
  const scope = { projectId: "p-korona" };
  const total = (await base.positions.facets(scope)).views.all;
  // Открытие реестра материалов: счётчики объекта и фильтра, первая страница — как на экране
  const open = () =>
    Promise.all([
      base.positions.facets(scope),
      base.positions.facets({ ...scope, view: "active" }),
      base.positions.list({ ...scope, limit: 40 }),
    ]);
  const measure = async (name: string, fn: () => Promise<unknown>, runs = 30) => {
    await fn();
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const started = performance.now();
      await fn();
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const p = (q: number) =>
      times[Math.min(times.length - 1, Math.floor(q * times.length))]!.toFixed(1);
    console.log(`  ${name}: медиана ${p(0.5)} мс, p95 ${p(0.95)} мс (${runs} замеров)`);
  };
  console.log(`Замер: реестр материалов объекта p-korona, позиций ${total}`);
  await measure("открытие реестра (2 счётчика + страница 40)", open);
  await measure("страница 40, сначала требующие разбора", () =>
    base.positions.list({ ...scope, order: "attention", cursor: "400", limit: 40 }),
  );
  await measure("выделение всех готовых к запросу", () =>
    base.positions.selection({ ...scope, readyForRequest: true }),
  );
  await measure("реестр объектов со сводкой", () => base.projects.list({}));
  await measure("карточка объекта", () => base.projects.card("p-korona"));
  await measure("чтение мостом: запросы объекта", () => base.procurement.requests("p-korona"), 10);
  await measure(
    "запись мостом: подтвердить позицию и отменить",
    async () => {
      const [id] = await firstIds(base, "pending", 1);
      await base.positions.confirm({ ids: [id!] }, actor);
      await base.positions.undoReview(
        { items: [{ id: id!, from: "confirmed", to: "pending" }] },
        actor,
      );
    },
    10,
  );
}

/* ---------- Запуск ---------- */

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
const [{ server_version: version }] = (await admin.query("show server_version")).rows;
console.log(
  `PostgreSQL ${version} на ${url.hostname || url.searchParams.get("host")}; база ${database}`,
);
await admin.query(`create database ${database}`);

let failed = false;
let driver: Driver | null = null;
try {
  migrate();
  driver = createDriver({ kind: "pg", url: checkUrl.toString() });
  failed = (await checkColumns(driver)) || failed;
  const seeded = performance.now();
  await seedDatabase(driver, fixtureCodec());
  console.log(`✓ сид из фикстур за ${Math.round(performance.now() - seeded)} мс`);
  failed = (await parity(driver)) || failed;
  // Замер последним: он делает записи и сдвинул бы данные под сравнением
  await timing(driver);
  failed = (await concurrency(driver)) || failed;
} catch (error) {
  failed = true;
  console.error("✗", error);
} finally {
  await driver?.close();
  await admin.query(`drop database if exists ${database} with (force)`);
  await admin.end();
}
if (failed) process.exit(1);
console.log("check:db: паритет с демо-адаптером подтверждён");
