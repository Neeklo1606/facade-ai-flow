-- migrate:up
-- Доля выполнения раздела и начисление (ADR-078): назначения, история доли, начисление записи.
-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.

alter table gas_time_entries add column "section_key" text;
comment on column gas_time_entries."section_key" is 'раздел сметы объекта (ADR-078)';
alter table gas_time_entries add column "section_done" boolean;
comment on column gas_time_entries."section_done" is 'ответ бригадира «работы по разделу закончены?»; null — пропущен';
alter table gas_time_entries add column "accrual" jsonb;
comment on column gas_time_entries."accrual" is 'начисление по доле раздела: доля до и после, СМР и опрессовка (ADR-078)';

-- Назначение раздела сметы объекта бригаде на период (ADR-078)
create table gas_section_assignments (
  "id" text not null,
  "object_id" text not null,
  "section_key" text not null,
  "title" text not null,
  "brigade_id" text not null,
  "from" date not null,
  "to" date,
  "by" text not null,
  "at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_section_assignments."section_key" is 'ключ раздела в gas_object_sections';
comment on column gas_section_assignments."title" is 'подпись раздела для бригадира, без сумм';
comment on column gas_section_assignments."to" is 'null — до отмены';
create index gas_section_assignments_brigade_id_from_idx on gas_section_assignments ("brigade_id", "from"); -- разделы бригады на день
create index gas_section_assignments_object_id_section_key_idx on gas_section_assignments ("object_id", "section_key"); -- бригады раздела

-- История доли выполнения раздела: кто, когда, было, стало, причина (ADR-078)
create table gas_section_progress (
  "id" text not null,
  "object_id" text not null,
  "section_key" text not null,
  "from_bp" integer not null,
  "to_bp" integer not null,
  "kind" text not null,
  "entry_ids" jsonb not null,
  "accrued_rub" integer not null,
  "reason" text,
  "by" text not null,
  "at" timestamptz not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_section_progress."from_bp" is 'доля до, базисные пункты: 10000 = 100 %';
comment on column gas_section_progress."to_bp" is 'доля после';
comment on column gas_section_progress."kind" is 'suggested | edited | completed | manual';
comment on column gas_section_progress."accrued_rub" is 'начислено этим шагом, рубли';
create index gas_section_progress_object_id_section_key_idx on gas_section_progress ("object_id", "section_key"); -- история раздела

-- Внешние ключи
alter table gas_section_assignments add foreign key ("object_id") references gas_objects ("id") on delete cascade;
alter table gas_section_assignments add foreign key ("brigade_id") references gas_brigades ("id") on delete cascade;
alter table gas_section_progress add foreign key ("object_id") references gas_objects ("id") on delete cascade;

-- migrate:down
drop table if exists gas_section_progress cascade;
drop table if exists gas_section_assignments cascade;
alter table gas_time_entries drop column if exists "section_key";
alter table gas_time_entries drop column if exists "section_done";
alter table gas_time_entries drop column if exists "accrual";
