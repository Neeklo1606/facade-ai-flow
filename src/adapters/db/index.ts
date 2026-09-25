import { ConflictError, listPositionsInput, positionFilter, type Repositories } from "@/ports";
import { registryColumns } from "@/domain/registry";
import { buildXlsx } from "@/adapters/export/xlsx";
import { createAgentPort } from "@/adapters/agent";
import {
  createDemoRepositories,
  runWithin,
  type ClockSource,
  type DemoState,
} from "@/adapters/demo";
import { buildSnapshot, snapshotTables } from "@/adapters/state/assemble";
import type { KeyCodec } from "./codec";
import { sqlState, type Driver } from "./driver";
import { positionFacetsSql, positionPage, positionSelectionSql, registrySql } from "./sql";
import { STALE_VERSION, diffStatements, loadTables, type LoadScope, type Loaded } from "./store";

export { createDriver, driverConfigFromEnv, type Driver, type DriverConfig } from "./driver";
export { fixtureCodec, seedDatabase } from "./fixtures";
export type { KeyCodec } from "./codec";

/**
 * Адаптер PostgreSQL (ADR-005). Страницы, счётчики, реестр, карточка объекта и права —
 * запросами SQL. Остальные чтения и все записи — мостом снимка: таблицы загружаются,
 * сборщик строит то же состояние, что у демо, выполняется тот же метод демо-адаптера,
 * разница пишется одним пакетом с проверкой версии. Правила домена не дублируются.
 */

export interface DbOptions {
  driver: Driver;
  codec: KeyCodec;
  /** Часы: в работе — настоящее время объекта (`wallClock`), в паритетном тесте — пошаговые */
  clock: ClockSource;
  /** Запись повторяется: данные изменил другой сервер между загрузкой и записью */
  onRetry?: (attempt: number) => void;
}

/** Повторов записи, если между загрузкой и записью данные успели измениться */
const WRITE_ATTEMPTS = 3;

/** Настоящее время «на стене» в поясе объекта — формат меток данных (ADR-005, п. 12) */
export function wallClock(timeZone: string): ClockSource {
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const now = () => format.format(new Date()).replace(" ", "T");
  return { tick: now, peek: now };
}

type Method = (...args: unknown[]) => Promise<unknown>;
type Bridge = <T>(call: (demo: Repositories) => Promise<T>) => Promise<T>;

export function createDbRepositories({ driver, codec, clock, onRetry }: DbOptions): Repositories {
  const demo = createDemoRepositories({ persist: false, simulate: false });
  const newId = () => crypto.randomUUID();
  const stateOf = (loaded: Loaded): DemoState => ({
    version: 0,
    jobs: [],
    ...buildSnapshot(loaded.tables),
  });
  const within = <T>(state: DemoState, call: (demo: Repositories) => Promise<T>) =>
    runWithin({ state, clock, newId }, () => call(demo));

  /** Чтение мостом: состояние из таблиц (всех или части), метод демо на нём */
  const readFrom =
    (scope?: LoadScope): Bridge =>
    async (call) =>
      within(stateOf(await loadTables(driver, codec, scope)), call).result;
  const read = readFrom();

  /**
   * Записи одного процесса идут по очереди: друг другу они не мешают, и повтор нужен только
   * при записи с другого сервера. Очередь — цепочка промисов; ошибка записи её не рвёт
   */
  let queue: Promise<unknown> = Promise.resolve();
  const serial: Bridge = (call) => {
    const run = queue.then(() => attemptWrite(call));
    queue = run.catch(() => undefined);
    return run;
  };

  /** Запись мостом: действие демо, разница — одним пакетом; устаревшая версия — повтор */
  const attemptWrite: Bridge = async (call) => {
    for (let attempt = 1; ; attempt++) {
      const loaded = await loadTables(driver, codec);
      const { result, state } = within(stateOf(loaded), call);
      const value = await result;
      const statements = diffStatements(loaded, snapshotTables(state), codec);
      if (!statements.length) return value;
      try {
        await driver.batch(statements);
        return value;
      } catch (error) {
        if (sqlState(error) !== STALE_VERSION) throw error;
        if (attempt >= WRITE_ATTEMPTS) {
          throw new ConflictError(
            "Данные одновременно меняли другие сотрудники. Обновите экран и повторите действие.",
          );
        }
        onRetry?.(attempt);
        // Пауза со случайной долей: два сервера не повторяют в один и тот же миг
        await new Promise((resolve) => setTimeout(resolve, attempt * (10 + Math.random() * 30)));
      }
    }
  };
  const write = serial;

  /** Порт целиком через мост; `writes` — методы, которые меняют данные */
  function bridged<K extends keyof Repositories>(
    port: K,
    writes: readonly string[] = [],
  ): Repositories[K] {
    const methods = demo[port] as unknown as Record<string, Method>;
    return Object.fromEntries(
      Object.keys(methods).map((name) => [
        name,
        (...args: unknown[]) =>
          (writes.includes(name) ? write : read)((repositories) =>
            (repositories[port] as unknown as Record<string, Method>)[name]!(...args),
          ),
      ]),
    ) as unknown as Repositories[K];
  }

  const one = (id: string) => [codec.encode(id)];
  /** Сотрудники с их объектами — для справочника и имён в выгрузке */
  const staff = readFrom({ where: { employees: "true", project_members: "true" }, values: [] });

  const registry = async (input: Parameters<Repositories["projects"]["list"]>[0]) =>
    registrySql(driver, codec, input ?? {}, clock.peek());

  const repositories: Repositories = {
    clock: { now: async () => clock.peek() },

    directory: {
      employees: () => staff((r) => r.directory.employees()),
      counterparties: () =>
        readFrom({ where: { counterparties: "true" }, values: [] })((r) =>
          r.directory.counterparties(),
        ),
    },

    projects: {
      ...bridged("projects", ["create", "setStatus", "completeMilestone"]),
      list: registry,
      exportRegistry: async (input) => {
        const [rows, employees] = await Promise.all([
          registry(input),
          staff((r) => r.directory.employees()),
        ]);
        const names = new Map(employees.map((item) => [item.id, item.name]));
        return buildXlsx(
          registryColumns((id) => names.get(id) ?? "—"),
          rows,
        );
      },
      // Состав карточки — строки этого объекта; сводка — тем же запросом, что реестр
      card: async (projectId) => {
        const values = one(projectId);
        const card = await readFrom({
          where: {
            projects: "t.id = $1",
            counterparties: "t.id = (select customer_id from projects where id = $1)",
            contracts: "t.project_id = $1",
            milestones: "t.contract_id in (select id from contracts where project_id = $1)",
            work_zones: "t.project_id = $1",
            crews: "t.project_id = $1",
            crew_members: "t.crew_id in (select id from crews where project_id = $1)",
            employees: "t.id in (select employee_id from project_members where project_id = $1)",
            project_members:
              "t.employee_id in (select employee_id from project_members where project_id = $1)",
          },
          values,
        })((r) => r.projects.card(projectId));
        if (!card) return null;
        const [row] = await registrySql(driver, codec, { projectId }, clock.peek());
        return row ? { ...card, overview: row.overview } : null;
      },
    },

    documents: bridged("documents", ["upload", "resolveChange"]),

    positions: {
      ...bridged("positions", [
        "confirm",
        "confirmAutoVerified",
        "correct",
        "exclude",
        "markHeader",
        "reopen",
        "undoReview",
        "merge",
        "split",
        "handOver",
        "confirmMatch",
      ]),
      list: (input) => positionPage(driver, codec, listPositionsInput.parse(input)),
      facets: (input) => positionFacetsSql(driver, codec, positionFilter.parse(input)),
      selection: (input) => positionSelectionSql(driver, codec, positionFilter.parse(input)),
    },

    procurement: bridged("procurement", [
      "verifyContact",
      "createRequest",
      "remind",
      "chooseSupplier",
      "moveDelivery",
      "acceptDelivery",
      "resolveRemark",
    ]),
    reports: bridged("reports", ["create", "review"]),
    timeline: bridged("timeline"),
    catalog: bridged("catalog", ["saveMaterial"]),

    // Права проверяются на каждом запросе: объекты сотрудника и объект записи — запросами SQL
    scope: {
      projectsOf: async (employeeId) => {
        const [member, foreman] = await driver.batch(
          [
            {
              text: "select project_id::text as id from project_members where employee_id = $1 order by row_order, project_id",
              values: one(employeeId),
            },
            {
              text: "select project_id::text as id from crews where foreman_id = $1 order by row_order, id",
              values: one(employeeId),
            },
          ],
          { readOnly: true },
        );
        const ids = [...member!, ...foreman!].map((row) => codec.decode(String(row["id"])));
        return [...new Set(ids)];
      },
      projectOf: async (kind, id) => {
        const lookup: Record<typeof kind, string> = {
          report: "select project_id::text as id from field_reports where id = $1",
          source: "select project_id::text as id from sources where id = $1",
          position: "select project_id::text as id from positions where id = $1",
          revision:
            "select d.project_id::text as id from document_revisions r join documents d on d.id = r.document_id where r.id = $1",
          document: "select project_id::text as id from documents where id = $1",
          request: "select project_id::text as id from supply_requests where id = $1",
          delivery: "select project_id::text as id from deliveries where id = $1",
          remark:
            "select d.project_id::text as id from delivery_remarks r join deliveries d on d.id = r.delivery_id where r.id = $1",
        };
        const [row] = await driver.query<{ id: string | null }>(lookup[kind], one(id));
        return row?.id ? codec.decode(row.id) : null;
      },
    },

    // Ассистент собирает ответы из портов этого адаптера, а не из состояния (ADR-006)
    agent: { ask: (input) => createAgentPort(repositories).ask(input) },
  };
  return repositories;
}
