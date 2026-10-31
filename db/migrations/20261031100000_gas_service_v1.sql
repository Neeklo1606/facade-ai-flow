-- migrate:up
-- Модули сервиса v1 (ADR-060): учёт времени бригад, снабжение, исполнительная документация.
-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.

-- Откуда строка: выгрузка заказчика или демо-набор с меткой «Демо»
create type gas_source as enum ('fact-report', 'mock');
-- Роль пользователя модулей сервиса v1
create type gas_role as enum ('admin', 'manager', 'foreman', 'director', 'prorab', 'supply', 'pto');
-- Статус записи времени
create type gas_entry_status as enum ('draft', 'pending', 'confirmed', 'rejected', 'clarify');
-- Откуда пришла запись времени
create type gas_entry_channel as enum ('web', 'bot', 'manager', 'import');
-- Действие проверки записи времени
create type gas_review_action as enum ('confirm', 'reject', 'correct', 'clarify', 'answer');
-- Роль в составе бригады
create type gas_crew_role as enum ('lead', 'worker');
-- Статус заявки снабжения; переходы проверяет domain (canMove)
create type gas_supply_status as enum ('new', 'in-work', 'waiting-offers', 'ordered', 'in-transit', 'partial', 'delivered', 'closed', 'rejected');
-- Приоритет заявки
create type gas_supply_priority as enum ('normal', 'urgent');
-- Итог приёмки поставки
create type gas_receipt_result as enum ('accepted', 'accepted-with-discrepancy');
-- Сторона участника строительства в акте (приказ № 344/пр, черновик)
create type gas_participant_side as enum ('customer-control', 'builder', 'builder-control', 'designer', 'performer');
-- Тип акта: АОСР или АООК
create type gas_act_type as enum ('aosr', 'aook');
-- Статус документа ИД; «в реестре» ставит только закрытие реестра
create type gas_doc_status as enum ('draft', 'review', 'signing', 'signed', 'registry');
-- Вид файла основания документа
create type gas_file_kind as enum ('scheme', 'tests', 'certificate', 'authority', 'scan');

-- Подразделение в отчёте заказчика («1. Стальные»)
create table gas_groups (
  "id" text not null,
  "name" text not null,
  "code" text,
  "excel_row" integer,
  row_order double precision not null default 0,
  primary key ("id")
);

-- Бригада
create table gas_brigades (
  "id" text not null,
  "group_id" text not null,
  "name" text not null,
  "code" text not null,
  "excel_row" integer,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_brigades_group_id_name_idx on gas_brigades ("group_id", "name"); -- бригады группы в отчёте

-- Сотрудник бригады
create table gas_employees (
  "id" text not null,
  "brigade_id" text not null,
  "name" text not null,
  "is_lead" boolean not null,
  "max_id" text,
  "excel_row" integer,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_employees."max_id" is 'идентификатор MAX; канал не подключён';
create index gas_employees_brigade_id_idx on gas_employees ("brigade_id"); -- люди бригады

-- Объект работ: свой номер, адрес не единственный ключ
create table gas_objects (
  "id" text not null,
  "label" text not null,
  "settlement" text,
  "work_type" text,
  "code" text not null,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_objects_code_idx on gas_objects ("code"); -- поиск объекта по номеру

-- Пользователь модулей и его роль. Права проверяет порт, а не меню
create table gas_users (
  "id" text not null,
  "name" text not null,
  "role" gas_role not null,
  "brigade_id" text,
  "allowed_object_ids" text[],
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_users."allowed_object_ids" is 'объекты, по которым можно работать; null — все';
create index gas_users_role_idx on gas_users ("role"); -- пользователи роли
create index gas_users_brigade_id_idx on gas_users ("brigade_id"); -- внешний ключ: выборка по связи

-- Запись времени бригады по объекту за день
create table gas_time_entries (
  "id" text not null,
  "number" text not null,
  "day" date not null,
  "brigade_id" text not null,
  "employee_id" text,
  "object_id" text not null,
  "start_minutes" integer,
  "end_minutes" integer,
  "break_minutes" integer not null,
  "minutes" integer not null,
  "amount_rub" double precision,
  "status" gas_entry_status not null,
  "created_by" text not null,
  "created_at" timestamptz not null,
  "reviewed_by" text,
  "reviewed_at" timestamptz,
  "comment" text,
  "source" gas_source not null,
  "revenue_in_file" double precision,
  "excel_row" integer,
  "headcount" integer,
  "people" jsonb,
  "client_key" text,
  "channel" gas_entry_channel,
  "note" text,
  row_order double precision not null default 0,
  primary key ("id"),
  check (minutes >= 0),
  check (break_minutes >= 0)
);
comment on column gas_time_entries."amount_rub" is 'подтверждённое начисление, рубли';
create unique index gas_time_entries_number_key on gas_time_entries ("number"); -- номер «ГЗ-00042» в боте и поиске
create index gas_time_entries_day_status_idx on gas_time_entries ("day", "status"); -- очередь проверки и неделя
create index gas_time_entries_brigade_id_day_idx on gas_time_entries ("brigade_id", "day"); -- записи бригады за день, пересечения
create index gas_time_entries_object_id_day_idx on gas_time_entries ("object_id", "day"); -- записи объекта, отчёт
create unique index gas_time_entries_client_key_key on gas_time_entries ("client_key") where client_key is not null; -- ключ отправки с телефона: повтор не создаёт дубль
create index gas_time_entries_employee_id_idx on gas_time_entries ("employee_id"); -- внешний ключ: выборка по связи

-- Решение проверки по записи: подтвердил, исправил, вернул, ответ бригадира (журнал: только insert)
create table gas_reviews (
  "id" text not null,
  "entry_id" text not null,
  "action" gas_review_action not null,
  "actor" text not null,
  "at" timestamptz not null,
  "comment" text,
  "changes" jsonb not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_reviews_entry_id_at_idx on gas_reviews ("entry_id", "at"); -- история проверки записи

-- Состав бригады с периодом: кто и с какой даты в бригаде
create table gas_crew_members (
  "id" text not null,
  "brigade_id" text not null,
  "employee_id" text not null,
  "name" text not null,
  "role" gas_crew_role not null,
  "from" date,
  "to" date,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id"),
  check ("to" is null or "from" is null or "to" >= "from")
);
comment on column gas_crew_members."employee_id" is 'человек состава без внешнего ключа: демо-монтажники есть только в составе, со своим именем';
comment on column gas_crew_members."to" is 'последний день включительно; null — состоит сейчас';
create index gas_crew_members_brigade_id_from_idx on gas_crew_members ("brigade_id", "from"); -- состав бригады на дату

-- Ставка за час с периодом: на человека или на бригаду
create table gas_rates (
  "id" text not null,
  "employee_id" text,
  "brigade_id" text,
  "rub_per_hour" integer not null,
  "from" date not null,
  "to" date,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id"),
  check ((employee_id is null) <> (brigade_id is null)),
  check (rub_per_hour > 0)
);
comment on column gas_rates."employee_id" is 'человек состава (gas_crew_members.employee_id), без внешнего ключа';
create index gas_rates_employee_id_from_idx on gas_rates ("employee_id", "from"); -- ставка человека на дату
create index gas_rates_brigade_id_from_idx on gas_rates ("brigade_id", "from"); -- ставка бригады на дату

-- Версия закрытой недели: копия записей и итогов на момент закрытия
create table gas_period_versions (
  "id" text not null,
  "week_from" date not null,
  "week_to" date not null,
  "version" integer not null,
  "closed_at" timestamptz not null,
  "closed_by" text not null,
  "entries" jsonb not null,
  "totals" jsonb not null,
  "accepted" jsonb not null,
  "reopened_at" timestamptz,
  "reopened_by" text,
  "reopen_reason" text,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_period_versions."entries" is 'копия подтверждённых записей недели';
create unique index gas_period_versions_week_from_version_key on gas_period_versions ("week_from", "version"); -- v1, v2 недели

-- Журнал действий модулей: кто, когда, что (журнал: только insert)
create table gas_audit (
  "id" text not null,
  "at" timestamptz not null,
  "actor" text not null,
  "action" text not null,
  "entity_id" text not null,
  "detail" text not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_audit_at_idx on gas_audit ("at" desc); -- журнал действий, новые сверху
create index gas_audit_entity_id_idx on gas_audit ("entity_id"); -- история сущности

-- Состояние учёта времени до S4 одной строкой; ключ «main»
create table gas_state (
  "key" text not null,
  "state" jsonb not null,
  row_order double precision not null default 0,
  primary key ("key")
);

-- Позиция номенклатуры: название, единица, синонимы для разбора текста
create table gas_nomenclature (
  "id" text not null,
  "name" text not null,
  "unit" text not null,
  "category" text not null,
  "aliases" text[] not null,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_nomenclature_category_name_idx on gas_nomenclature ("category", "name"); -- выбор позиции по категории

-- Поставщик
create table gas_suppliers (
  "id" text not null,
  "name" text not null,
  "inn" text,
  "contact" text,
  "phone" text,
  "email" text,
  "categories" text[] not null,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id"),
  check (inn is null or inn ~ '^([0-9]{10}|[0-9]{12})$')
);
create index gas_suppliers_name_idx on gas_suppliers ("name"); -- справочник поставщиков
create unique index gas_suppliers_inn_key on gas_suppliers ("inn") where inn is not null; -- ИНН без дублей

-- Лимит материала по смете объекта
create table gas_material_limits (
  "object_id" text not null,
  "item_id" text not null,
  "qty" numeric(14,3) not null,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("object_id", "item_id"),
  check (qty > 0)
);
create index gas_material_limits_item_id_idx on gas_material_limits ("item_id"); -- внешний ключ: выборка по связи

-- Заявка снабжения с объекта
create table gas_supply_requests (
  "id" text not null,
  "number" text not null,
  "object_id" text not null,
  "need_by" date,
  "priority" gas_supply_priority not null,
  "photos" text[] not null,
  "author_id" text not null,
  "author_name" text not null,
  "client_key" text,
  "created_at" timestamptz not null,
  "status" gas_supply_status not null,
  "reject_reason" text,
  "chosen_offer_id" text,
  "eta" date,
  "history" jsonb not null,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_supply_requests."chosen_offer_id" is 'выбранное предложение gas_offers.id';
create unique index gas_supply_requests_number_key on gas_supply_requests ("number"); -- номер «ЗК-00001»
create index gas_supply_requests_status_need_by_idx on gas_supply_requests ("status", "need_by"); -- таблица снабженца по сроку
create index gas_supply_requests_object_id_created_at_idx on gas_supply_requests ("object_id", "created_at" desc); -- заявки объекта, лимит сметы
create unique index gas_supply_requests_client_key_key on gas_supply_requests ("client_key") where client_key is not null; -- ключ отправки с телефона: повтор не создаёт дубль

-- Позиция заявки: что и сколько
create table gas_supply_request_lines (
  "id" text not null,
  "request_id" text not null,
  "item_id" text not null,
  "qty" numeric(14,3) not null,
  row_order double precision not null default 0,
  primary key ("id"),
  check (qty > 0)
);
create index gas_supply_request_lines_request_id_idx on gas_supply_request_lines ("request_id"); -- позиции заявки
create index gas_supply_request_lines_item_id_idx on gas_supply_request_lines ("item_id"); -- заказано по позиции: лимит сметы

-- Предложение поставщика по заявке: цены строк, срок, доставка
create table gas_offers (
  "id" text not null,
  "request_id" text not null,
  "supplier_id" text not null,
  "lines" jsonb not null,
  "lead_days" integer not null,
  "delivery_kop" bigint not null,
  "terms" text,
  "file_name" text,
  "entered_by" text not null,
  "at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("id"),
  check (lead_days >= 0),
  check (delivery_kop >= 0)
);
comment on column gas_offers."delivery_kop" is 'копейки';
create index gas_offers_request_id_at_idx on gas_offers ("request_id", "at"); -- сравнение предложений заявки
create index gas_offers_supplier_id_idx on gas_offers ("supplier_id"); -- внешний ключ: выборка по связи

-- Приёмка поставки на объекте: количество, расхождение, сертификаты
create table gas_receipts (
  "id" text not null,
  "request_id" text not null,
  "lines" jsonb not null,
  "result" gas_receipt_result not null,
  "discrepancy" text,
  "invoice_photo" text,
  "certificates" jsonb not null,
  "accepted_by" text not null,
  "at" timestamptz not null,
  "client_key" text,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_receipts_request_id_at_idx on gas_receipts ("request_id", "at"); -- приёмки заявки
create unique index gas_receipts_client_key_key on gas_receipts ("client_key") where client_key is not null; -- повтор приёмки с телефона не принимает дважды

-- Участник строительства объекта и его представитель
create table gas_participants (
  "id" text not null,
  "object_id" text not null,
  "side" gas_participant_side not null,
  "org" text not null,
  "position" text not null,
  "person" text not null,
  "authority" jsonb,
  "nrs_id" text,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_participants."authority" is 'документ о представительстве';
comment on column gas_participants."nrs_id" is 'идентификационный номер в НРС';
create index gas_participants_object_id_side_idx on gas_participants ("object_id", "side"); -- участники объекта для акта

-- Проектная документация объекта: шифр, раздел, листы
create table gas_project_sheets (
  "id" text not null,
  "object_id" text not null,
  "cipher" text not null,
  "section" text not null,
  "sheets" text not null,
  "title" text not null,
  "author" text not null,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_project_sheets_object_id_idx on gas_project_sheets ("object_id"); -- проект объекта

-- Справочник «вид работы → какой акт» и что нужно акту
create table gas_work_kinds (
  "id" text not null,
  "name" text not null,
  "unit" text not null,
  "act" gas_act_type not null,
  "needs_scheme" boolean not null,
  "needs_tests" boolean not null,
  "next" text not null,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_work_kinds."next" is 'пункт 7 акта: последующие работы';

-- Запись объёма работ: вид, объём, даты, материалы. Основание акта
create table gas_work_records (
  "id" text not null,
  "number" text not null,
  "object_id" text not null,
  "zone" text,
  "kind_id" text not null,
  "volume" numeric(14,3) not null,
  "from" date not null,
  "to" date not null,
  "materials" jsonb not null,
  "sheet_ids" text[] not null,
  "reported_by" text not null,
  "volume_confirmed_by" text,
  "volume_confirmed_at" timestamptz,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id"),
  check ("to" >= "from"),
  check (volume > 0)
);
comment on column gas_work_records."zone" is 'захватка или место';
create unique index gas_work_records_number_key on gas_work_records ("number"); -- номер «РО-0001»
create index gas_work_records_object_id_from_idx on gas_work_records ("object_id", "from"); -- пакет актов за период
create index gas_work_records_kind_id_idx on gas_work_records ("kind_id"); -- внешний ключ: выборка по связи

-- Документ ИД (акт): статус, версия, исправления полей, замечания
create table gas_exec_docs (
  "id" text not null,
  "object_id" text not null,
  "type" gas_act_type not null,
  "number" integer not null,
  "work_id" text not null,
  "version" integer not null,
  "status" gas_doc_status not null,
  "overrides" jsonb not null,
  "remarks" jsonb not null,
  "history" jsonb not null,
  "scan" text,
  "signed_at" timestamptz,
  "created_at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("id"),
  check (version >= 1),
  check ((status in ('signed', 'registry')) = (scan is not null))
);
create unique index gas_exec_docs_object_id_type_number_key on gas_exec_docs ("object_id", "type", "number"); -- номер акта своего типа на объекте
create unique index gas_exec_docs_work_id_key on gas_exec_docs ("work_id"); -- по работе один акт
create index gas_exec_docs_status_idx on gas_exec_docs ("status"); -- показатели ПТО

-- Файл основания: схема, испытания, сертификат, приказ, скан. В демо только имя
create table gas_doc_files (
  "id" text not null,
  "object_id" text not null,
  "kind" gas_file_kind not null,
  "file_name" text not null,
  "work_id" text,
  "item_id" text,
  "participant_id" text,
  "doc_id" text,
  "by" text not null,
  "at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create index gas_doc_files_object_id_kind_idx on gas_doc_files ("object_id", "kind"); -- файлы объекта по виду
create index gas_doc_files_work_id_idx on gas_doc_files ("work_id"); -- схема и испытания работы
create index gas_doc_files_item_id_idx on gas_doc_files ("item_id"); -- внешний ключ: выборка по связи
create index gas_doc_files_participant_id_idx on gas_doc_files ("participant_id"); -- внешний ключ: выборка по связи
create index gas_doc_files_doc_id_idx on gas_doc_files ("doc_id"); -- внешний ключ: выборка по связи

-- Закрытая версия реестра ИД объекта: строки на момент закрытия
create table gas_registry_versions (
  "id" text not null,
  "object_id" text not null,
  "version" integer not null,
  "closed_at" timestamptz not null,
  "closed_by" text not null,
  "rows" jsonb not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create unique index gas_registry_versions_object_id_version_key on gas_registry_versions ("object_id", "version"); -- v1, v2 реестра

-- Принятая запись раздела 3 общего журнала работ
create table gas_journal_entries (
  "id" text not null,
  "object_id" text not null,
  "work_id" text not null,
  "dates" text not null,
  "conditions" text not null,
  "text" text not null,
  "representative" text not null,
  "accepted_by" text not null,
  "accepted_at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("id")
);
create unique index gas_journal_entries_work_id_key on gas_journal_entries ("work_id"); -- по работе одна запись
create index gas_journal_entries_object_id_accepted_at_idx on gas_journal_entries ("object_id", "accepted_at"); -- журнал объекта

-- Версия состояния модулей: каждая запись хранилища увеличивает её при совпадении прежней
-- (src/adapters/gas-ops/db-store.ts). Инфраструктура, а не данные домена: вне контрактов
create table gas_versions (
  key text primary key,
  version integer not null default 0
);
insert into gas_versions (key, version) values ('main', 0);

-- Внешние ключи
alter table gas_brigades add foreign key ("group_id") references gas_groups ("id") on delete restrict;
alter table gas_employees add foreign key ("brigade_id") references gas_brigades ("id") on delete restrict;
alter table gas_users add foreign key ("brigade_id") references gas_brigades ("id") on delete set null;
alter table gas_time_entries add foreign key ("brigade_id") references gas_brigades ("id") on delete restrict;
alter table gas_time_entries add foreign key ("employee_id") references gas_employees ("id") on delete set null;
alter table gas_time_entries add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_reviews add foreign key ("entry_id") references gas_time_entries ("id") on delete cascade;
alter table gas_crew_members add foreign key ("brigade_id") references gas_brigades ("id") on delete restrict;
alter table gas_rates add foreign key ("brigade_id") references gas_brigades ("id") on delete restrict;
alter table gas_material_limits add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_material_limits add foreign key ("item_id") references gas_nomenclature ("id") on delete restrict;
alter table gas_supply_requests add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_supply_request_lines add foreign key ("request_id") references gas_supply_requests ("id") on delete cascade;
alter table gas_supply_request_lines add foreign key ("item_id") references gas_nomenclature ("id") on delete restrict;
alter table gas_offers add foreign key ("request_id") references gas_supply_requests ("id") on delete cascade;
alter table gas_offers add foreign key ("supplier_id") references gas_suppliers ("id") on delete restrict;
alter table gas_receipts add foreign key ("request_id") references gas_supply_requests ("id") on delete restrict;
alter table gas_participants add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_project_sheets add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_work_records add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_work_records add foreign key ("kind_id") references gas_work_kinds ("id") on delete restrict;
alter table gas_exec_docs add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_exec_docs add foreign key ("work_id") references gas_work_records ("id") on delete restrict;
alter table gas_doc_files add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_doc_files add foreign key ("work_id") references gas_work_records ("id") on delete restrict;
alter table gas_doc_files add foreign key ("item_id") references gas_nomenclature ("id") on delete restrict;
alter table gas_doc_files add foreign key ("participant_id") references gas_participants ("id") on delete restrict;
alter table gas_doc_files add foreign key ("doc_id") references gas_exec_docs ("id") on delete restrict;
alter table gas_registry_versions add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_journal_entries add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_journal_entries add foreign key ("work_id") references gas_work_records ("id") on delete restrict;

-- Журналы: роль приложения может только добавлять строки (если роль заведена)
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    revoke update, delete on gas_reviews from app_user;
    revoke update, delete on gas_audit from app_user;
  end if;
end $$;

-- migrate:down
drop table if exists gas_versions;
drop table if exists gas_journal_entries cascade;
drop table if exists gas_registry_versions cascade;
drop table if exists gas_doc_files cascade;
drop table if exists gas_exec_docs cascade;
drop table if exists gas_work_records cascade;
drop table if exists gas_work_kinds cascade;
drop table if exists gas_project_sheets cascade;
drop table if exists gas_participants cascade;
drop table if exists gas_receipts cascade;
drop table if exists gas_offers cascade;
drop table if exists gas_supply_request_lines cascade;
drop table if exists gas_supply_requests cascade;
drop table if exists gas_material_limits cascade;
drop table if exists gas_suppliers cascade;
drop table if exists gas_nomenclature cascade;
drop table if exists gas_state cascade;
drop table if exists gas_audit cascade;
drop table if exists gas_period_versions cascade;
drop table if exists gas_rates cascade;
drop table if exists gas_crew_members cascade;
drop table if exists gas_reviews cascade;
drop table if exists gas_time_entries cascade;
drop table if exists gas_users cascade;
drop table if exists gas_objects cascade;
drop table if exists gas_employees cascade;
drop table if exists gas_brigades cascade;
drop table if exists gas_groups cascade;
drop type if exists gas_file_kind;
drop type if exists gas_doc_status;
drop type if exists gas_act_type;
drop type if exists gas_participant_side;
drop type if exists gas_receipt_result;
drop type if exists gas_supply_priority;
drop type if exists gas_supply_status;
drop type if exists gas_crew_role;
drop type if exists gas_review_action;
drop type if exists gas_entry_channel;
drop type if exists gas_entry_status;
drop type if exists gas_role;
drop type if exists gas_source;
