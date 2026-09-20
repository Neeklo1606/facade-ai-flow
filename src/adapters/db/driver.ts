/**
 * Драйвер PostgreSQL (ADR-005, п. 1). Выше этого файла не знают, какой драйвер работает:
 * `pg` для Node на сервере заказчика или HTTP-драйвер Neon для Workers. Интерфейс — запрос
 * с параметрами и атомарный пакет запросов. Интерактивных транзакций нет: HTTP их не держит.
 */

export interface Statement {
  text: string;
  values?: unknown[];
}

export interface BatchOptions {
  /** Только чтение с согласованным снимком (`repeatable read`): загрузка всех таблиц моста */
  readOnly?: boolean;
}

export interface Driver {
  kind: DriverKind;
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
  /** Все запросы в одной транзакции: либо выполнены все, либо ни один */
  batch(statements: Statement[], options?: BatchOptions): Promise<Record<string, unknown>[][]>;
  close(): Promise<void>;
}

export const driverKinds = ["pg", "neon"] as const;
export type DriverKind = (typeof driverKinds)[number];

export interface DriverConfig {
  kind: DriverKind;
  url: string;
}

/** Настройки из окружения: `DATABASE_URL` и `DATABASE_DRIVER` (по умолчанию `pg`) */
export function driverConfigFromEnv(env: Record<string, string | undefined>): DriverConfig | null {
  const url = env["DATABASE_URL"]?.trim();
  if (!url) return null;
  const kind = (env["DATABASE_DRIVER"]?.trim() || "pg") as DriverKind;
  if (!driverKinds.includes(kind)) {
    throw new Error(`DATABASE_DRIVER=${kind}: допустимы ${driverKinds.join(", ")}`);
  }
  return { kind, url };
}

/** Драйвер создаётся сразу, а модуль `pg` или Neon загружается при первом запросе */
export function createDriver(config: DriverConfig): Driver {
  return config.kind === "neon" ? neonDriver(config.url) : pgDriver(config.url);
}

function pgDriver(url: string): Driver {
  let pool: Promise<import("pg").Pool> | null = null;
  const connect = () =>
    (pool ??= import("pg").then(
      ({ default: pg }) => new pg.Pool({ connectionString: url, max: 10 }),
    ));
  return {
    kind: "pg",
    async query(text, values = []) {
      const result = await (await connect()).query(text, values);
      return result.rows;
    },
    async batch(statements, options = {}) {
      const client = await (await connect()).connect();
      try {
        await client.query(
          options.readOnly ? "begin isolation level repeatable read read only" : "begin",
        );
        const results: Record<string, unknown>[][] = [];
        for (const statement of statements) {
          results.push((await client.query(statement.text, statement.values ?? [])).rows);
        }
        await client.query("commit");
        return results;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => {
      if (pool) await (await pool).end();
    },
  };
}

function neonDriver(url: string): Driver {
  let client: Promise<import("@neondatabase/serverless").NeonQueryFunction<false, false>> | null =
    null;
  const connect = () =>
    (client ??= import("@neondatabase/serverless").then(({ neon }) => neon(url)));
  return {
    kind: "neon",
    async query(text, values = []) {
      return (await (await connect()).query(text, values)) as never;
    },
    async batch(statements, options = {}) {
      const sql = await connect();
      return (await sql.transaction(
        statements.map((statement) => sql.query(statement.text, statement.values ?? [])),
        options.readOnly ? { isolationLevel: "RepeatableRead", readOnly: true } : {},
      )) as Record<string, unknown>[][];
    },
    close: async () => undefined,
  };
}

/** Код ошибки PostgreSQL: у обоих драйверов он лежит в `code` */
export function sqlState(error: unknown): string | null {
  return typeof error === "object" && error && "code" in error ? String(error.code) : null;
}
