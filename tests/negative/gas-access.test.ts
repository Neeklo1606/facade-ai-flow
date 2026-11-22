import { describe, expect, test } from "bun:test";
import type { GasStore } from "@/adapters/gas-ops/store";
import {
  gasAccessResponse,
  normalizeAccessPhone,
  type AccessDirectory,
  type DirectoryRow,
} from "@/api/gas-access";
import { addGasUser, emptyCompany } from "@/domain/gas-ops/pilot";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

/**
 * Приглашения и доступ людей (ADR-086): только администратор, ссылка на 72 часа, отзыв гасит
 * вход, свой доступ не отзывается, бригадиру нужна бригада, телефон не повторяется.
 */

const OWNER = "0a000000-0000-4000-8000-000000000001";
const MANAGER = "0a000000-0000-4000-8000-000000000002";

function memoryStore(state: GasOpsSnapshot): GasStore & { now(): GasOpsSnapshot } {
  return {
    read: async () => state,
    update: async (change) => (state = change(state)),
    now: () => state,
  };
}

function memoryDirectory() {
  const rows = new Map<string, DirectoryRow & { name: string }>();
  rows.set(OWNER, {
    id: OWNER,
    name: "Соколов Артём",
    phone: "+79210000000",
    blocked: false,
    inviteUntil: null,
    lastSeen: "2026-11-23T08:00:00Z",
  });
  rows.set(MANAGER, {
    id: MANAGER,
    name: "Иванова Ольга",
    phone: "+79210000001",
    blocked: false,
    inviteUntil: null,
    lastSeen: "2026-11-23T09:00:00Z",
  });
  let n = 0;
  const directory: AccessDirectory = {
    rows: async (ids) => ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : [])),
    phoneOwner: async (phone) => [...rows.values()].find((r) => r.phone === phone)?.name ?? null,
    createEmployee: async ({ name, phone }) => {
      const id = `0a000000-0000-4000-8000-0000000001${String(++n).padStart(2, "0")}`;
      rows.set(id, { id, name, phone, blocked: false, inviteUntil: null, lastSeen: null });
      return id;
    },
    invite: async ({ employeeId }) => {
      const row = rows.get(employeeId)!;
      row.blocked = false;
      row.inviteUntil = "2026-11-26T09:00:00Z";
      return `token${employeeId.slice(-3)}`;
    },
    revoke: async (id) => {
      const row = rows.get(id)!;
      row.blocked = true;
      row.inviteUntil = null;
    },
  };
  return { directory, rows };
}

function setup() {
  let snapshot = emptyCompany({
    today: "2026-11-23",
    groupName: "1. Стальные",
    owner: { id: OWNER, name: "Соколов Артём" },
  });
  snapshot = addGasUser(snapshot, { id: MANAGER, name: "Иванова Ольга", role: "manager" });
  snapshot = {
    ...snapshot,
    brigades: [
      ...snapshot.brigades,
      { id: "b1", groupId: snapshot.groups[0]!.id, name: "Бригада 1", code: "Б1", source: "mock" },
    ] as GasOpsSnapshot["brigades"],
  };
  const store = memoryStore(snapshot);
  const { directory, rows } = memoryDirectory();
  const call = (userId: string | null, body?: Record<string, string>) =>
    gasAccessResponse(
      new Request("https://gaika.test/api/gas/access", {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : null,
      }),
      { store, userId, directory, origin: "https://gaika.test" },
    );
  return { store, rows, call };
}

describe("приглашения и доступ людей учёта времени", () => {
  test("без базы 501, без входа 401, не администратор 403", async () => {
    const { call } = setup();
    expect(
      (
        await gasAccessResponse(new Request("https://x/api/gas/access"), {
          store: null,
          userId: OWNER,
          directory: null,
          origin: "https://x",
        })
      ).status,
    ).toBe(501);
    expect((await call(null)).status).toBe(401);
    expect((await call(MANAGER)).status).toBe(403);
    expect((await call(MANAGER, { action: "revoke", id: OWNER })).status).toBe(403);
  });

  test("администратор видит людей и состояние входа", async () => {
    const { call } = setup();
    const res = await call(OWNER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { people: { id: string; state: string; self: boolean }[] };
    expect(body.people.map((p) => [p.id, p.state, p.self])).toEqual([
      [OWNER, "active", true],
      [MANAGER, "active", false],
    ]);
  });

  test("добавить бригадира: нужна бригада из справочника, ссылка ведёт в /gas", async () => {
    const { call, store } = setup();
    const noBrigade = await call(OWNER, {
      action: "add",
      name: "Петров Илья",
      phone: "+7 921 000-00-03",
      role: "foreman",
      brigade: "Бригада 9",
    });
    expect(noBrigade.status).toBe(422);
    // Отказ без следа: пользователь не заведён
    expect(store.now().users).toHaveLength(2);
    const ok = await call(OWNER, {
      action: "add",
      name: "Петров Илья",
      phone: "+7 921 000-00-03",
      role: "foreman",
      brigade: "Бригада 1",
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { id: string; link: string; hours: number };
    expect(body.link).toMatch(/^https:\/\/gaika\.test\/login\?invite=\w+&to=%2Fgas$/);
    expect(body.hours).toBe(72);
    const user = store.now().users.find((u) => u.id === body.id)!;
    expect(user.role).toBe("foreman");
    expect(user.brigadeId).toBe("b1");
  });

  test("повтор телефона и неверные данные отклоняются", async () => {
    const { call } = setup();
    expect(
      (await call(OWNER, { action: "add", name: "Двойник", phone: "89210000001", role: "manager" }))
        .status,
    ).toBe(409);
    expect(
      (await call(OWNER, { action: "add", name: "Кто-то", phone: "123", role: "manager" })).status,
    ).toBe(400);
    expect(
      (await call(OWNER, { action: "add", name: "Кто-то", phone: "+79210000009", role: "root" }))
        .status,
    ).toBe(400);
    expect((await call(OWNER, { action: "drop" })).status).toBe(400);
  });

  test("отозвать доступ и выдать новую ссылку; свой доступ не отзывается", async () => {
    const { call, rows } = setup();
    expect((await call(OWNER, { action: "revoke", id: OWNER })).status).toBe(422);
    expect((await call(OWNER, { action: "revoke", id: MANAGER })).status).toBe(200);
    expect(rows.get(MANAGER)!.blocked).toBe(true);
    let people = (await (await call(OWNER)).json()) as { people: { id: string; state: string }[] };
    expect(people.people.find((p) => p.id === MANAGER)!.state).toBe("revoked");
    const again = await call(OWNER, { action: "invite", id: MANAGER });
    expect(again.status).toBe(200);
    people = (await (await call(OWNER)).json()) as { people: { id: string; state: string }[] };
    expect(people.people.find((p) => p.id === MANAGER)!.state).toBe("invited");
    expect((await call(OWNER, { action: "invite", id: "nobody" })).status).toBe(404);
  });

  test("телефон в один вид", () => {
    expect(normalizeAccessPhone("8 (921) 000-00-01")).toBe("+79210000001");
    expect(normalizeAccessPhone("+7 921 000 00 01")).toBe("+79210000001");
    expect(normalizeAccessPhone("12345")).toBeNull();
  });
});
