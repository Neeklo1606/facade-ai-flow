-- migrate:up
-- Табель T7 (ADR-061, 14): привязка MAX, диалоги бота, входящие события, уведомления, график.
-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.

-- Вид уведомления: нет записи, вопрос по записи, сводка дня
create type gas_notification_kind as enum ('missing', 'clarify', 'summary');
-- Итог отправки уведомления
create type gas_notification_status as enum ('sent', 'failed');
-- Вид входящего события канала: запуск бота, нажатие кнопки, текст
create type gas_inbound_kind as enum ('start', 'callback', 'text');

alter table gas_time_entries add column "flags" jsonb;
comment on column gas_time_entries."flags" is 'признаки записи на момент сохранения: считает сервер, в снимок не читаются';
alter table gas_time_entries add column "repeat_visit" boolean;
comment on column gas_time_entries."repeat_visit" is 'повторный выезд бригады на объект в тот же день; то же, что признак repeat-visit';

-- Привязка пользователя к MAX по одноразовому коду приглашения
create table gas_max_links (
  "id" text not null,
  "user_id" text not null,
  "invite_code" text not null,
  "created_by" text not null,
  "created_at" timestamptz not null,
  "expires_at" timestamptz not null,
  "max_user_id" text,
  "linked_at" timestamptz,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_max_links."max_user_id" is 'user_id в MAX после привязки';
create unique index gas_max_links_invite_code_key on gas_max_links ("invite_code"); -- код из ссылки на бота ищется при start
create unique index gas_max_links_max_user_id_key on gas_max_links ("max_user_id") where max_user_id is not null; -- один аккаунт MAX на одного пользователя
create index gas_max_links_user_id_idx on gas_max_links ("user_id"); -- приглашения пользователя

-- Состояние диалога бота с бригадиром: машина состояний T2 между событиями
create table gas_messenger_sessions (
  "max_user_id" text not null,
  "user_id" text not null,
  "chat_id" text,
  "state" jsonb not null,
  "updated_at" timestamptz not null,
  "expires_at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("max_user_id")
);
comment on column gas_messenger_sessions."state" is 'BotState из domain/gas-ops/bot-dialog';
create index gas_messenger_sessions_expires_at_idx on gas_messenger_sessions ("expires_at"); -- очистка устаревших диалогов
create index gas_messenger_sessions_user_id_idx on gas_messenger_sessions ("user_id"); -- внешний ключ: выборка по связи

-- Принятые события канала: повторная доставка с тем же внешним id не обрабатывается (журнал: только insert)
create table gas_inbound_events (
  "external_id" text not null,
  "channel" text not null,
  "kind" gas_inbound_kind not null,
  "max_user_id" text not null,
  "received_at" timestamptz not null,
  "entry_id" text,
  row_order double precision not null default 0,
  primary key ("external_id")
);
comment on column gas_inbound_events."channel" is 'канал: max';
comment on column gas_inbound_events."entry_id" is 'запись, созданная событием';
create index gas_inbound_events_received_at_idx on gas_inbound_events ("received_at"); -- журнал событий по времени

-- Журнал отправленных напоминаний и сводок: ключ день|вид|получатель не повторяется (журнал: только insert)
create table gas_notifications (
  "key" text not null,
  "day" date not null,
  "kind" gas_notification_kind not null,
  "user_id" text not null,
  "channel" text not null,
  "text" text not null,
  "status" gas_notification_status not null,
  "reason" text,
  "sent_at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("key")
);
comment on column gas_notifications."channel" is 'demo или max';
create index gas_notifications_user_id_day_idx on gas_notifications ("user_id", "day"); -- что получил пользователь за день

-- График: бригада × объект × дата, по нему считаются ожидаемые записи
create table gas_schedule_items (
  "id" text not null,
  "brigade_id" text not null,
  "object_id" text not null,
  "day" date not null,
  "source" text not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_schedule_items."source" is 'файл графика заказчика или назначение менеджера';
create unique index gas_schedule_items_brigade_id_object_id_day_key on gas_schedule_items ("brigade_id", "object_id", "day"); -- одна строка графика на бригаду, объект и день
create index gas_schedule_items_day_idx on gas_schedule_items ("day"); -- ожидаемые записи дня для напоминаний
create index gas_schedule_items_object_id_idx on gas_schedule_items ("object_id"); -- внешний ключ: выборка по связи

-- Внешние ключи
alter table gas_max_links add foreign key ("user_id") references gas_users ("id") on delete cascade;
alter table gas_messenger_sessions add foreign key ("user_id") references gas_users ("id") on delete cascade;
alter table gas_notifications add foreign key ("user_id") references gas_users ("id") on delete cascade;
alter table gas_schedule_items add foreign key ("brigade_id") references gas_brigades ("id") on delete cascade;
alter table gas_schedule_items add foreign key ("object_id") references gas_objects ("id") on delete cascade;

-- Журналы: роль приложения может только добавлять строки (если роль заведена)
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    revoke update, delete on gas_inbound_events from app_user;
    revoke update, delete on gas_notifications from app_user;
  end if;
end $$;

-- migrate:down
drop table if exists gas_schedule_items cascade;
drop table if exists gas_notifications cascade;
drop table if exists gas_inbound_events cascade;
drop table if exists gas_messenger_sessions cascade;
drop table if exists gas_max_links cascade;
alter table gas_time_entries drop column if exists "flags";
alter table gas_time_entries drop column if exists "repeat_visit";
drop type if exists gas_inbound_kind;
drop type if exists gas_notification_status;
drop type if exists gas_notification_kind;
