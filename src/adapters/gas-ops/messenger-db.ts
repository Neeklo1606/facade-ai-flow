/**
 * Состояние канала бота в PostgreSQL (B6; ADR-061, 14): привязки, диалоги и принятые события
 * в таблицах миграции T7 — `gas_max_links`, `gas_messenger_sessions`, `gas_inbound_events`.
 *
 * Эти таблицы не входят в снимок вкладки (`gasTabelTables`, src/contracts/gas.ts): хранилище
 * снимка их не читает и не пишет, поэтому здесь прямой SQL и спора за таблицы нет.
 * Таблицы общие для MAX и Telegram: id аккаунта Telegram с префиксом `tg:` (колонки
 * `max_user_id` хранят id аккаунта любого канала).
 *
 * Время привязок в домене — местное без пояса, в базе — `timestamptz`: перевод в поясе
 * `APP_TIME_ZONE`, как у хранилища снимка. Срок диалога и время приёма события — часы базы.
 */
import type { Driver } from "@/adapters/db/driver";
import type { BotState } from "@/domain/gas-ops/bot-dialog";
import type { MaxLink } from "@/domain/gas-ops/max-link";
import type { GasMessengerStore } from "@/ports/messenger";

/** Диалог без событий дольше двух суток начинается сначала: шаг недельной давности не продолжают */
export const SESSION_TTL_HOURS = 48;

export interface MessengerDbOptions {
  timeZone?: string;
}

/** Пояс подставляется в текст запроса: только имя вида `Europe/Moscow`, без кавычек */
function zoneOf(value: string | undefined): string {
  const zone = value?.trim() || "Europe/Moscow";
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(zone)) throw new Error(`Неверный пояс: ${zone}`);
  return zone;
}

const local = (column: string, zone: string, alias: string) =>
  `to_char(${column} at time zone '${zone}', 'YYYY-MM-DD"T"HH24:MI:SS') as "${alias}"`;

export function createMessengerDb(db: Driver, options: MessengerDbOptions = {}): GasMessengerStore {
  const zone = zoneOf(options.timeZone);
  const stamp = (index: number) => `($${index}::timestamp at time zone '${zone}')`;

  return {
    async links() {
      return db.query<MaxLink>(
        `select id, user_id as "userId", invite_code as "inviteCode", created_by as "createdBy",
           ${local("created_at", zone, "createdAt")}, ${local("expires_at", zone, "expiresAt")},
           max_user_id as "maxUserId", ${local("linked_at", zone, "linkedAt")}
         from gas_max_links order by row_order, created_at, id`,
      );
    },

    async saveLinks(links) {
      if (links.length === 0) return;
      const values: unknown[] = [];
      const rows = links.map((link, i) => {
        values.push(
          link.id,
          link.userId,
          link.inviteCode,
          link.createdBy,
          link.createdAt,
          link.expiresAt,
          link.maxUserId,
          link.linkedAt,
          i,
        );
        const n = i * 9;
        return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, ${stamp(n + 5)}, ${stamp(n + 6)}, $${n + 7}, ${stamp(n + 8)}, $${n + 9}::float8)`;
      });
      await db.batch([
        // Аккаунт может переехать на другую строку того же пользователя (новое приглашение):
        // уникальный индекс по max_user_id проверяется построчно, поэтому сначала снимаем
        {
          text: `update gas_max_links set max_user_id = null
                 where id = any($1::text[]) and max_user_id is not null`,
          values: [links.map((l) => l.id)],
        },
        {
          text: `insert into gas_max_links
                   (id, user_id, invite_code, created_by, created_at, expires_at, max_user_id, linked_at, row_order)
                 values ${rows.join(", ")}
                 on conflict (id) do update set
                   user_id = excluded.user_id, invite_code = excluded.invite_code,
                   created_by = excluded.created_by, created_at = excluded.created_at,
                   expires_at = excluded.expires_at, max_user_id = excluded.max_user_id,
                   linked_at = excluded.linked_at`,
          values,
        },
      ]);
    },

    async session(channelUserId) {
      const [row] = await db.query<{ state: unknown }>(
        `select state from gas_messenger_sessions
         where max_user_id = $1 and expires_at > now()`,
        [channelUserId],
      );
      if (!row) return null;
      // jsonb приходит объектом у pg и Neon; строкой — если драйвер не разобрал тип
      return (typeof row.state === "string" ? JSON.parse(row.state) : row.state) as BotState;
    },

    async saveSession({ channelUserId, userId, chatId, state }) {
      await db.query(
        `insert into gas_messenger_sessions (max_user_id, user_id, chat_id, state, updated_at, expires_at)
         values ($1, $2, $3, $4::jsonb, now(), now() + make_interval(hours => $5::int))
         on conflict (max_user_id) do update set
           user_id = excluded.user_id, chat_id = excluded.chat_id, state = excluded.state,
           updated_at = excluded.updated_at, expires_at = excluded.expires_at`,
        [channelUserId, userId, chatId, JSON.stringify(state), SESSION_TTL_HOURS],
      );
    },

    async claim(event) {
      if (event.externalId.trim() === "") return false;
      // Одна вставка: из двух одновременных доставок строку получает только одна
      const rows = await db.query(
        `insert into gas_inbound_events (external_id, channel, kind, max_user_id, received_at)
         values ($1, $2, $3::gas_inbound_kind, $4, now())
         on conflict (external_id) do nothing
         returning external_id`,
        [event.externalId, event.channel, event.kind, event.channelUserId],
      );
      return rows.length === 1;
    },

    async record(externalId, entryId) {
      await db.query(`update gas_inbound_events set entry_id = $2 where external_id = $1`, [
        externalId,
        entryId,
      ]);
    },
  };
}
