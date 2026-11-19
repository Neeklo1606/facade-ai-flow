-- migrate:up
-- Папка смет на сервисе (ADR-077): сметы, версии, файлы и разделы объектов в таблицах.
-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.

alter table gas_objects add column "address" jsonb;
comment on column gas_objects."address" is 'адрес из шапки сметы: населённый пункт, улица, дом, квартира (ADR-077)';
alter table gas_objects add column "estimate_number" text;
comment on column gas_objects."estimate_number" is 'номер сметы или КП, из которой создан объект';
alter table gas_objects add column "source_file_id" text;
comment on column gas_objects."source_file_id" is 'исходный файл сметы gas_estimate_files';

-- Подтверждённая стоимость работ объекта без материалов: смета или ручная сумма
create table gas_estimates (
  "id" text not null,
  "object_id" text not null,
  "version" integer not null,
  "amount_rub" integer not null,
  "status" text not null,
  "origin" text not null,
  "confirmed_by" text,
  "confirmed_at" timestamptz,
  "note" text,
  "source" gas_source not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_estimates."amount_rub" is 'целые рубли';
comment on column gas_estimates."status" is 'confirmed | manual-pending | missing';
comment on column gas_estimates."origin" is 'estimate | manual | none';
create index gas_estimates_object_id_idx on gas_estimates ("object_id"); -- стоимость объекта

-- Версия сметы: одна загрузка файла, разбор с номерами строк
create table gas_estimate_versions (
  "id" text not null,
  "object_id" text,
  "version" integer not null,
  "file_name" text not null,
  "sheet" text,
  "uploaded_at" timestamptz not null,
  "uploaded_by" text not null,
  "format" text,
  "parse_status" text not null,
  "totals" jsonb not null,
  "vat_rate" double precision,
  "labor_hours" jsonb,
  "sections" jsonb not null,
  "extras" jsonb,
  "issues" jsonb not null,
  "header" jsonb,
  "issues_reviewed_by" text,
  "confirmed_by" text,
  "confirmed_at" timestamptz,
  "corrections" jsonb,
  "file_id" text,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_estimate_versions."format" is 'grand | resource';
comment on column gas_estimate_versions."header" is 'шапка сметы (ADR-077)';
comment on column gas_estimate_versions."file_id" is 'исходный файл gas_estimate_files';
create index gas_estimate_versions_object_id_version_idx on gas_estimate_versions ("object_id", "version"); -- версии объекта по порядку

-- Исходный файл сметы: опись, байты в хранилище тома сервера
create table gas_estimate_files (
  "id" text not null,
  "sha256" text not null,
  "name" text not null,
  "size" integer not null,
  "uploaded_by" text not null,
  "uploaded_at" timestamptz not null,
  "storage_path" text,
  "status" text not null,
  "reason" text,
  "version_id" text,
  "repeats" integer not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_estimate_files."sha256" is 'SHA-256 содержимого, hex';
comment on column gas_estimate_files."size" is 'байты';
comment on column gas_estimate_files."storage_path" is 'путь в хранилище; null — демо';
comment on column gas_estimate_files."status" is 'parsed | needs-review | unreadable';
create unique index gas_estimate_files_sha256_key on gas_estimate_files ("sha256"); -- одинаковый файл не создаёт новую версию

-- Раздел объекта из прикреплённой сметы: ключ стабилен между версиями
create table gas_object_sections (
  "id" text not null,
  "object_id" text not null,
  "version_id" text not null,
  "key" text not null,
  "number" text,
  "title" text not null,
  "total_kopecks" bigint not null,
  "materials_kopecks" bigint,
  "work_kopecks" bigint,
  "labor_hours" double precision,
  "pressure_kopecks" bigint,
  "removed" boolean not null,
  row_order double precision not null default 0,
  primary key ("id")
);
comment on column gas_object_sections."total_kopecks" is 'копейки';
comment on column gas_object_sections."materials_kopecks" is 'копейки';
comment on column gas_object_sections."work_kopecks" is 'копейки';
comment on column gas_object_sections."pressure_kopecks" is 'копейки';
create index gas_object_sections_object_id_idx on gas_object_sections ("object_id"); -- разделы объекта

-- Внешние ключи
alter table gas_estimates add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_estimate_versions add foreign key ("object_id") references gas_objects ("id") on delete restrict;
alter table gas_object_sections add foreign key ("object_id") references gas_objects ("id") on delete cascade;

-- Перенос из gas_state: порядок массива сохраняется в row_order
insert into gas_estimates (id, object_id, version, amount_rub, status, origin, confirmed_by, confirmed_at, note, source, row_order)
select e->>'id', e->>'objectId', (e->>'version')::int, (e->>'amountRub')::int, e->>'status', e->>'origin', e->>'confirmedBy', ((e->>'confirmedAt')::timestamp at time zone 'Europe/Moscow'), e->>'note', (e->>'source')::gas_source, t.ord - 1
from gas_state, jsonb_array_elements(coalesce(state->'estimates', '[]'::jsonb)) with ordinality as t(e, ord)
where key = 'main';

insert into gas_estimate_versions (id, object_id, version, file_name, sheet, uploaded_at, uploaded_by, format, parse_status, totals, vat_rate, labor_hours, sections, extras, issues, header, issues_reviewed_by, confirmed_by, confirmed_at, corrections, file_id, row_order)
select v->>'id', v->>'objectId', (v->>'version')::int, v->>'fileName', v->>'sheet', ((v->>'uploadedAt')::timestamp at time zone 'Europe/Moscow'), coalesce(v->>'uploadedBy', ''), v->>'format', v->>'parseStatus', coalesce(v->'totals', '{}'::jsonb), (v->>'vatRate')::float8, nullif(v->'laborHours', 'null'::jsonb), coalesce(v->'sections', '[]'::jsonb), nullif(v->'extras', 'null'::jsonb), coalesce(v->'issues', '[]'::jsonb), nullif(v->'header', 'null'::jsonb), v->>'issuesReviewedBy', v->>'confirmedBy', ((v->>'confirmedAt')::timestamp at time zone 'Europe/Moscow'), nullif(v->'corrections', 'null'::jsonb), v->>'fileId', t.ord - 1 - jsonb_array_length(coalesce(state->'estimateVersions', '[]'::jsonb))
from gas_state, jsonb_array_elements(coalesce(state->'estimateVersions', '[]'::jsonb)) with ordinality as t(v, ord)
where key = 'main';

update gas_state set state = state - 'estimates' - 'estimateVersions' where key = 'main';

-- migrate:down
-- Сметы и версии обратно в gas_state, затем таблицы удаляются
update gas_state set state = state
  || jsonb_build_object('estimates', coalesce((select jsonb_agg(to_jsonb(e) - 'row_order' order by e.row_order) from (
    select id, object_id as "objectId", version, amount_rub as "amountRub", status, origin, confirmed_by as "confirmedBy", to_char(confirmed_at at time zone 'Europe/Moscow', 'YYYY-MM-DD"T"HH24:MI:SS') as "confirmedAt", note, source::text as source, row_order from gas_estimates) e), '[]'::jsonb))
  || jsonb_build_object('estimateVersions', coalesce((select jsonb_agg(to_jsonb(v) - 'row_order' - (case when v."extras" is null then 'extras' else '' end) - (case when v."corrections" is null then 'corrections' else '' end) - (case when v."header" is null then 'header' else '' end) - (case when v."fileId" is null then 'fileId' else '' end) order by v.row_order) from (
    select id, object_id as "objectId", version, file_name as "fileName", sheet, to_char(uploaded_at at time zone 'Europe/Moscow', 'YYYY-MM-DD"T"HH24:MI:SS') as "uploadedAt", uploaded_by as "uploadedBy", format, parse_status as "parseStatus", totals, vat_rate as "vatRate", labor_hours as "laborHours", sections, extras, issues, header, issues_reviewed_by as "issuesReviewedBy", confirmed_by as "confirmedBy", to_char(confirmed_at at time zone 'Europe/Moscow', 'YYYY-MM-DD"T"HH24:MI:SS') as "confirmedAt", corrections, file_id as "fileId", row_order from gas_estimate_versions) v), '[]'::jsonb))
where key = 'main';
drop table if exists gas_object_sections cascade;
drop table if exists gas_estimate_files cascade;
drop table if exists gas_estimate_versions cascade;
drop table if exists gas_estimates cascade;
alter table gas_objects drop column if exists "address";
alter table gas_objects drop column if exists "estimate_number";
alter table gas_objects drop column if exists "source_file_id";
