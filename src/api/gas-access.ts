/**
 * Приглашения и доступ людей учёта времени (ADR-085): администратор на экране «Настройка»
 * заводит человека с ролью, выдаёт ссылку входа на 72 часа, отзывает доступ.
 *
 * GET `/api/gas/access` — люди и состояние входа; POST — действие `add`, `invite` или `revoke`.
 * Права проверяются здесь (ADR-012): только роль `admin` учёта времени. Записи в справочнике
 * входа делает `AccessDirectory`: на сервере PostgreSQL, в тестах память.
 */
import type { GasStore } from "@/adapters/gas-ops/store";
import {
  EMPLOYEE_ROLE_FOR,
  PILOT_ROLES,
  addGasUser,
  isPilotRole,
  type PilotRole,
} from "@/domain/gas-ops/pilot";

/** Состояние входа человека для экрана */
export type AccessState = "active" | "invited" | "never" | "revoked";

export interface AccessPerson {
  id: string;
  name: string;
  role: string;
  brigade: string | null;
  phone: string | null;
  state: AccessState;
  /** До какого момента действует живая ссылка, ISO */
  inviteUntil: string | null;
  /** Последний вход, ISO */
  lastSeen: string | null;
  self: boolean;
}

/** Строка справочника входа по сотруднику */
export interface DirectoryRow {
  id: string;
  phone: string | null;
  blocked: boolean;
  inviteUntil: string | null;
  lastSeen: string | null;
}

export interface AccessDirectory {
  rows(ids: string[]): Promise<DirectoryRow[]>;
  /** Имя сотрудника с этим телефоном или null */
  phoneOwner(phone: string): Promise<string | null>;
  createEmployee(input: { name: string; phone: string; role: PilotRole }): Promise<string>;
  /** Новая ссылка: прежняя живая гаснет, сотрудник снова активен. Возвращает токен */
  invite(input: { employeeId: string; createdBy: string; phone: string | null }): Promise<string>;
  /** Отозвать: сессии и живые ссылки гаснут, вход по коду закрыт */
  revoke(employeeId: string): Promise<void>;
}

export interface GasAccessDeps {
  store: GasStore | null;
  userId: string | null;
  directory: AccessDirectory | null;
  /** Адрес сервиса для ссылки: https://домен */
  origin: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** Телефон в один вид: тот же, что у входа по коду (auth-store) */
export function normalizeAccessPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const ten =
    digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))
      ? digits.slice(1)
      : digits;
  if (ten.length < 10) return null;
  return ten.length === 10 ? `+7${ten}` : `+${digits}`;
}

export function accessState(row: DirectoryRow | undefined): AccessState {
  if (!row) return "never";
  if (row.blocked) return "revoked";
  if (row.inviteUntil) return "invited";
  if (row.lastSeen) return "active";
  return "never";
}

export const inviteUrl = (origin: string, token: string) =>
  `${origin.replace(/\/+$/, "")}/login?invite=${token}&to=%2Fgas`;

export async function gasAccessResponse(request: Request, deps: GasAccessDeps): Promise<Response> {
  if (!deps.store || !deps.directory) {
    return json(501, { reason: "Рабочая база не подключена: доступ заводится только на сервере" });
  }
  if (!deps.userId) return json(401, { reason: "Войдите, чтобы продолжить" });
  const store = deps.store;
  const directory = deps.directory;
  const snapshot = await store.read();
  const me = snapshot.users.find((u) => u.id === deps.userId);
  if (!me) return json(403, { reason: "Вас нет среди пользователей учёта времени" });
  if (me.role !== "admin") return json(403, { reason: "Доступ людей меняет администратор" });

  if (request.method === "GET") {
    const ids = snapshot.users.map((u) => u.id);
    const rows = new Map((await directory.rows(ids)).map((r) => [r.id, r]));
    const people: AccessPerson[] = snapshot.users.map((u) => {
      const row = rows.get(u.id);
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        brigade: snapshot.brigades.find((b) => b.id === u.brigadeId)?.name ?? null,
        phone: row?.phone ?? null,
        state: accessState(row),
        inviteUntil: row?.inviteUntil ?? null,
        lastSeen: row?.lastSeen ?? null,
        self: u.id === me.id,
      };
    });
    return json(200, {
      people,
      roles: PILOT_ROLES,
      brigades: snapshot.brigades.map((b) => b.name),
    });
  }

  if (request.method !== "POST") return json(405, { reason: "Метод не поддерживается" });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { reason: "Нужны данные действия" });
  }
  const action = body["action"];
  const text = (key: string) => (typeof body[key] === "string" ? String(body[key]).trim() : "");

  if (action === "add") {
    const name = text("name");
    const role = text("role");
    const brigade = text("brigade") || null;
    const phone = normalizeAccessPhone(text("phone"));
    if (name.length < 3 || name.length > 120) return json(400, { reason: "Укажите имя и фамилию" });
    if (!phone) return json(400, { reason: "Телефон: код страны и десять цифр" });
    if (!isPilotRole(role)) return json(400, { reason: "Выберите роль" });
    if (role === "foreman" && !brigade) return json(400, { reason: "Бригадиру нужна бригада" });
    // Проверка правил до записи сотрудника: бригада из справочника, без следа в базе при отказе
    try {
      addGasUser(snapshot, { id: "check", name, role, brigadeName: brigade });
    } catch (error) {
      return json(422, { reason: error instanceof Error ? error.message : "Нельзя добавить" });
    }
    const owner = await directory.phoneOwner(phone);
    if (owner) return json(409, { reason: `Телефон уже у сотрудника «${owner}»` });
    const id = await directory.createEmployee({ name, phone, role });
    await store.update((s) => addGasUser(s, { id, name, role, brigadeName: brigade }));
    const token = await directory.invite({ employeeId: id, createdBy: me.id, phone });
    return json(200, { id, link: inviteUrl(deps.origin, token), hours: 72 });
  }

  if (action === "invite" || action === "revoke") {
    const id = text("id");
    const target = snapshot.users.find((u) => u.id === id);
    if (!target) return json(404, { reason: "Такого человека нет в учёте времени" });
    if (action === "revoke") {
      if (target.id === me.id) return json(422, { reason: "Свой доступ отозвать нельзя" });
      await directory.revoke(target.id);
      return json(200, { ok: true });
    }
    const row = (await directory.rows([target.id]))[0];
    const token = await directory.invite({
      employeeId: target.id,
      createdBy: me.id,
      phone: row?.phone ?? null,
    });
    return json(200, { id: target.id, link: inviteUrl(deps.origin, token), hours: 72 });
  }

  return json(400, { reason: "Неизвестное действие" });
}

/** Справочник входа в PostgreSQL: таблицы `employees`, `auth_invites`, `auth_sessions` */
export async function pgAccessDirectory(): Promise<AccessDirectory | null> {
  const [{ gasServerDriver }, auth] = await Promise.all([
    import("./gas-server-store"),
    import("./auth-store"),
  ]);
  const db = await gasServerDriver();
  if (!db) return null;
  const POSITION: Record<PilotRole, string> = {
    admin: "Руководитель",
    manager: "Менеджер проверки",
    director: "Руководитель",
    foreman: "Бригадир",
  };
  const uuid = /^[0-9a-f-]{36}$/i;
  return {
    async rows(ids) {
      const keys = ids.filter((id) => uuid.test(id));
      if (keys.length === 0) return [];
      const rows = await db.query<{
        id: string;
        phone: string | null;
        status: string;
        invite_until: string | null;
        last_seen: string | null;
      }>(
        `select e.id::text as id, e.phone, e.status::text as status,
           (select to_char(max(i.expires_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from auth_invites i
             where i.employee_id = e.id and i.accepted_at is null and i.revoked_at is null
               and i.expires_at > now()) as invite_until,
           (select to_char(max(s.last_seen_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from auth_sessions s
             where s.employee_id = e.id) as last_seen
         from employees e where e.id = any($1::uuid[])`,
        [keys],
      );
      return rows.map((r) => ({
        id: r.id,
        phone: r.phone,
        blocked: r.status === "blocked",
        inviteUntil: r.invite_until,
        lastSeen: r.last_seen,
      }));
    },
    async phoneOwner(phone) {
      const [row] = await db.query<{ name: string }>(
        "select name from employees where phone = $1 limit 1",
        [phone],
      );
      return row?.name ?? null;
    },
    async createEmployee(input) {
      const [count] = await db.query<{ n: number }>("select count(*)::int as n from employees");
      const id = crypto.randomUUID();
      await db.query(
        `insert into employees (id, name, position, role, phone, email, telegram, status, row_order)
           values ($1::uuid, $2, $3, $4::employee_role, $5, null, null, 'active'::employee_status, $6)`,
        [
          id,
          input.name,
          POSITION[input.role],
          EMPLOYEE_ROLE_FOR[input.role],
          input.phone,
          (count?.n ?? 0) + 1,
        ],
      );
      return id;
    },
    async invite(input) {
      await db.query(
        `update employees set status = 'active'::employee_status where id = $1::uuid`,
        [input.employeeId],
      );
      return auth.createInvite({ ...input, email: null });
    },
    async revoke(employeeId) {
      await db.query(
        `update employees set status = 'blocked'::employee_status where id = $1::uuid`,
        [employeeId],
      );
      await db.query(
        `update auth_invites set revoked_at = now()
           where employee_id = $1::uuid and accepted_at is null and revoked_at is null`,
        [employeeId],
      );
      await auth.closeEmployeeSessions(employeeId);
    },
  };
}

/** Вход маршрута: база, сессия и адрес сервиса из запроса */
export async function gasAccessRequest(request: Request): Promise<Response> {
  const [{ gasServerStore }, { sessionActorId }] = await Promise.all([
    import("./gas-server-store"),
    import("./session"),
  ]);
  return gasAccessResponse(request, {
    store: await gasServerStore(),
    userId: await sessionActorId(),
    directory: await pgAccessDirectory(),
    origin: process.env["PUBLIC_URL"]?.trim() || new URL(request.url).origin,
  });
}
