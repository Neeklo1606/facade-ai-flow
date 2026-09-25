-- Сгенерировано scripts/db-schema.ts из src/contracts. Не редактировать вручную.
-- Задание на схему PostgreSQL: таблицы, перечисления, ключи, индексы, проверки.

create extension if not exists pgcrypto;

-- Роль сотрудника; от неё зависят доступные разделы и действия (фаза 4)
create type employee_role as enum ('manager', 'foreman', 'pto', 'supply', 'finance', 'worker', 'director');

-- Может ли сотрудник работать в системе
create type employee_status as enum ('active', 'vacation', 'blocked');

-- Роль контрагента по отношению к компании
create type counterparty_role as enum ('customer', 'supplier', 'subcontractor');

-- Свежесть контакта поставщика
create type contact_status as enum ('verified', 'needs_check', 'stale');

-- Состояние объекта для реестра
create type project_status as enum ('active', 'at_risk', 'paused', 'done');

-- Жизненный цикл договора
create type contract_status as enum ('draft', 'active', 'closed');

-- Состояние контрольной точки договора
create type milestone_status as enum ('planned', 'at_risk', 'done', 'overdue');

-- Уровень участка фасада
create type zone_level as enum ('building', 'section', 'floor', 'zone');

-- Формат загруженного файла
create type file_type as enum ('pdf', 'docx', 'xlsx');

-- Обработка ревизии: распознавание, извлечение позиций, проверка человеком
create type processing_status as enum ('uploaded', 'recognizing', 'extracted', 'review', 'verified');

-- Задача распознавания ревизии: очередь, распознавание, извлечение позиций, готово к проверке, ошибка
create type extraction_job_status as enum ('queued', 'recognizing', 'extracted', 'review', 'failed');

-- Разобрано ли изменение документации
create type change_status as enum ('open', 'resolved');

-- Решение человека по извлечённой позиции
create type position_review as enum ('pending', 'confirmed', 'corrected', 'excluded', 'merged', 'header');

-- Этап закупки позиции; меняется событиями закупки
create type purchase_status as enum ('none', 'requested', 'offers', 'supplier_selected', 'ordered', 'delivered');

-- Сопоставление позиции с материалом: нет, предложено системой, подтверждено человеком
create type match_status as enum ('none', 'suggested', 'confirmed');

-- Кто совершил действие: человек или обработка
create type actor_kind as enum ('user', 'system');

-- Решение по предложенной замене
create type replacement_status as enum ('proposed', 'agreed', 'rejected');

-- Хранимый жизненный цикл запроса. Статус на экране (ждём ответы, просрочен, готов) вычисляется
create type request_status as enum ('draft', 'sent', 'decided', 'ordered', 'cancelled');

-- Состояние поставки: создаётся решением по запросу, закрывается актом приёмки
create type delivery_status as enum ('expected', 'shipped', 'in_transit', 'arrived', 'accepted', 'accepted_with_remarks', 'rejected');

-- Вид замечания по поставке: недостача, излишек, непройденный пункт контроля, отклонение
create type delivery_remark_kind as enum ('shortage', 'surplus', 'checklist', 'rejected');

-- Состояние замечания
create type delivery_remark_status as enum ('open', 'resolved');

-- Вид зафиксированного решения
create type decision_kind as enum ('supplier', 'replacement', 'quantity');

-- Откуда пришёл первоисточник
create type source_kind as enum ('telegram', 'email', 'upload', 'call', 'manual');

-- Как прислан отчёт
create type report_kind as enum ('voice', 'text', 'photo');

-- Проверка отчёта руководителем или ПТО
create type report_status as enum ('review', 'accepted', 'returned');

-- Важность проблемы
create type issue_severity as enum ('blocker', 'warning');

-- Вид материала отчёта
create type evidence_kind as enum ('photo', 'audio', 'file');

-- Тип события в истории объекта. Решения живут в project_decisions и в ленту добавляются при чтении
create type event_type as enum ('version_uploaded', 'spec_extracted', 'qty_corrected', 'request_created', 'offer_received', 'replacement_proposed', 'replacement_agreed', 'material_ordered', 'delivery_moved', 'delivery_received', 'delivery_rejected', 'delivery_remark', 'report_added', 'project_status_changed', 'milestone_done', 'change_resolved');

-- Сотрудники и пользователи системы
create table employees (
  id uuid not null default gen_random_uuid(),
  name text not null,
  position text not null,
  role employee_role not null,
  phone text not null,
  email text,
  telegram text,
  status employee_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column employees.position is 'должность словами';
create unique index employees_phone_key on employees (phone); -- вход по телефону, привязка Telegram
create index employees_role_status_idx on employees (role, status); -- выбор согласующих, прорабов и снабженцев

-- Кто из сотрудников работает на объекте
create table project_members (
  project_id uuid not null,
  employee_id uuid not null,
  row_order double precision not null default 0,
  primary key (project_id, employee_id)
);
create index project_members_employee_id_idx on project_members (employee_id); -- объекты сотрудника в выборе объекта

-- Заказчики, поставщики и субподрядчики
create table counterparties (
  id uuid not null default gen_random_uuid(),
  name text not null,
  role counterparty_role not null,
  inn text,
  contact_name text not null,
  email text not null,
  phone text not null,
  avg_reply_hours smallint not null,
  rating numeric(2,1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column counterparties.inn is '10 или 12 цифр; null — контрагент ещё не проверен';
comment on column counterparties.avg_reply_hours is 'средний срок ответа на запрос, ч';
comment on column counterparties.rating is 'оценка 0…5';
create unique index counterparties_inn_key on counterparties (inn) where inn is not null; -- поиск и защита от дублей по ИНН
create index counterparties_role_name_idx on counterparties (role, name); -- списки заказчиков и поставщиков по алфавиту

-- Профиль поставщика для подбора в запрос: регион, категории материалов, контакт
create table supplier_profiles (
  supplier_id uuid not null,
  region text not null,
  categories text[] not null,
  contact_name text not null,
  phone text not null,
  email text not null,
  contact_source text not null,
  contact_checked_at date not null,
  contact_status contact_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (supplier_id)
);
comment on column supplier_profiles.categories is 'категории материалов верхнего уровня: material_categories.id (ADR-014)';
comment on column supplier_profiles.contact_source is 'откуда взят контакт';
create index supplier_profiles_region_idx on supplier_profiles (region); -- подбор поставщиков по региону объекта
create index supplier_profiles_categories_idx on supplier_profiles using gin (categories); -- подбор по категориям материалов

-- Бригады на объекте
create table crews (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  name text not null,
  foreman_id uuid not null,
  headcount smallint not null,
  specialization text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (headcount >= 0)
);
create index crews_project_id_idx on crews (project_id); -- команда объекта, отсутствующие отчёты
create index crews_foreman_id_idx on crews (foreman_id); -- внешний ключ: выборка по связи

-- Состав бригады из сотрудников системы
create table crew_members (
  crew_id uuid not null,
  employee_id uuid not null,
  row_order double precision not null default 0,
  primary key (crew_id, employee_id)
);
create index crew_members_employee_id_idx on crew_members (employee_id); -- в какой бригаде сотрудник

-- Строительный объект
create table projects (
  id uuid not null default gen_random_uuid(),
  name text not null,
  code text not null,
  customer_id uuid not null,
  region text not null,
  stage text not null,
  status project_status not null,
  manager_id uuid not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (end_date >= start_date)
);
comment on column projects.stage is 'стадия работ словами: «Монтаж фасада, этап 1»';
create unique index projects_code_key on projects (code); -- короткий код объекта в реестре и поиске
create index projects_status_name_idx on projects (status, name); -- реестр: фильтр по статусу, сортировка по названию
create index projects_manager_id_idx on projects (manager_id); -- реестр: фильтр по ответственному
create index projects_region_idx on projects (region); -- реестр: фильтр по региону
create index projects_customer_id_idx on projects (customer_id); -- внешний ключ: выборка по связи

-- Договор с заказчиком по объекту
create table contracts (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  customer_id uuid not null,
  number text not null,
  signed_at date not null,
  start_date date not null,
  end_date date not null,
  amount bigint not null,
  advance bigint not null,
  retention_pct numeric(5,2) not null,
  payment_term_days smallint not null,
  status contract_status not null,
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (amount >= 0),
  check (advance between 0 and amount),
  check (end_date >= start_date)
);
comment on column contracts.amount is 'копейки';
comment on column contracts.advance is 'копейки';
comment on column contracts.retention_pct is 'гарантийное удержание, %';
create unique index contracts_number_key on contracts (number); -- номер договора в шапке объекта и поиске
create index contracts_project_id_signed_at_idx on contracts (project_id, signed_at desc); -- действующий договор объекта
create index contracts_customer_id_idx on contracts (customer_id); -- внешний ключ: выборка по связи
create index contracts_source_id_idx on contracts (source_id); -- внешний ключ: выборка по связи

-- Контрольная точка договора: этап, требование, срок
create table milestones (
  id uuid not null default gen_random_uuid(),
  contract_id uuid not null,
  name text not null,
  due_date date not null,
  requirement text not null,
  status milestone_status not null,
  source_id uuid,
  location text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column milestones.location is 'где в договоре: страница, пункт';
create index milestones_contract_id_due_date_idx on milestones (contract_id, due_date); -- контрольные точки на вкладке «Ход работ»
create index milestones_source_id_idx on milestones (source_id); -- внешний ключ: выборка по связи

-- Участок фасада: здание, секция, этаж, захватка
create table work_zones (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  parent_id uuid,
  level zone_level not null,
  name text not null,
  axes text,
  floors text,
  plan_qty numeric(14,3) not null,
  baseline_fact_qty numeric(14,3) not null,
  unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (plan_qty >= 0),
  check (baseline_fact_qty >= 0)
);
comment on column work_zones.baseline_fact_qty is 'выполнено до начала учёта отчётами; факт = это значение + принятые объёмы (R15)';
create index work_zones_project_id_name_idx on work_zones (project_id, name); -- захватки объекта в фильтрах и «Ходе работ»
create index work_zones_parent_id_idx on work_zones (parent_id); -- дерево участков

-- Документ проекта независимо от ревизии
create table documents (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  section text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column documents.section is 'раздел проекта: НВФ, АР, КМ';
create index documents_project_id_section_idx on documents (project_id, section); -- документация объекта по разделам

-- Загруженная ревизия документа. На экранах «документ» — это ревизия
create table document_revisions (
  id uuid not null default gen_random_uuid(),
  document_id uuid not null,
  revision smallint not null,
  label text not null,
  file_name text not null,
  file_type file_type not null,
  size_kb integer not null,
  uploaded_at timestamptz not null,
  uploaded_by uuid not null,
  sheet_count smallint not null,
  status processing_status not null,
  source_id uuid,
  positions_total integer,
  positions_verified integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (revision > 0),
  check (positions_verified is null or positions_verified <= positions_total)
);
comment on column document_revisions.label is 'как ревизию называют в документе: «Рев. 3»';
comment on column document_revisions.positions_total is 'счётчик, пока позиции ревизии не загружены в систему (R20); null — считать по positions';
create unique index document_revisions_document_id_revision_key on document_revisions (document_id, revision); -- ревизия уникальна в документе
create index document_revisions_document_id_uploaded_at_idx on document_revisions (document_id, uploaded_at desc); -- список документации, последние сверху
create index document_revisions_status_idx on document_revisions (status) where status <> 'verified'; -- очередь обработки и проверки
create index document_revisions_uploaded_by_idx on document_revisions (uploaded_by); -- внешний ключ: выборка по связи
create index document_revisions_source_id_idx on document_revisions (source_id); -- внешний ключ: выборка по связи

-- Задача распознавания и извлечения позиций ревизии. Выполняет обработчик на сервере, интерфейс опрашивает статус (P3-4)
create table extraction_jobs (
  id uuid not null default gen_random_uuid(),
  revision_id uuid not null,
  status extraction_job_status not null,
  stage smallint not null,
  queued_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  row_order double precision not null default 0,
  primary key (id),
  check (stage between 0 and 4),
  check ((status in ('review', 'failed')) = (finished_at is not null)),
  check ((status = 'failed') = (error is not null))
);
comment on column extraction_jobs.stage is 'пройденная стадия: 0 загружен, 1 распознан текст, 2 найдены таблицы, 3 извлечены позиции, 4 готов к проверке';
comment on column extraction_jobs.error is 'почему не удалось обработать файл';
create index extraction_jobs_revision_id_queued_at_idx on extraction_jobs (revision_id, queued_at desc); -- последняя задача ревизии
create index extraction_jobs_status_queued_at_idx on extraction_jobs (status, queued_at) where status in ('queued', 'recognizing', 'extracted'); -- очередь обработчика

-- Лист ревизии в дереве структуры документа
create table document_sheets (
  id uuid not null default gen_random_uuid(),
  revision_id uuid not null,
  number smallint not null,
  title text not null,
  group_name text not null,
  row_order double precision not null default 0,
  primary key (id),
  check (number > 0)
);
comment on column document_sheets.group_name is 'раздел спецификации: Подконструкция, Облицовка…';
create unique index document_sheets_revision_id_number_key on document_sheets (revision_id, number); -- дерево листов по порядку

-- Расхождение в ревизии документа, которое нужно разобрать: с прошлой ревизией или с другим разделом
create table revision_changes (
  id uuid not null default gen_random_uuid(),
  document_id uuid not null,
  from_revision_id uuid,
  to_revision_id uuid not null,
  description text not null,
  status change_status not null,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (from_revision_id is null or from_revision_id <> to_revision_id),
  check ((status = 'resolved') = (resolved_at is not null))
);
comment on column revision_changes.from_revision_id is 'null — расхождение с другим разделом, а не с прошлой ревизией';
create index revision_changes_document_id_status_idx on revision_changes (document_id, status); -- открытые изменения в реестре и карточке объекта
create index revision_changes_from_revision_id_idx on revision_changes (from_revision_id); -- внешний ключ: выборка по связи
create index revision_changes_to_revision_id_idx on revision_changes (to_revision_id); -- внешний ключ: выборка по связи
create index revision_changes_resolved_by_idx on revision_changes (resolved_by); -- внешний ключ: выборка по связи

-- Дерево категорий материалов; категория верхнего уровня решает, кому уходит запрос
create table material_categories (
  id uuid not null default gen_random_uuid(),
  parent_id uuid,
  name text not null,
  rules text[] not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column material_categories.parent_id is 'null — категория верхнего уровня';
comment on column material_categories.rules is 'правила соответствия: основы слов в наименовании («кронштейн», «анкер»)';
comment on column material_categories.sort_order is 'порядок в дереве';
create index material_categories_parent_id_idx on material_categories (parent_id); -- дочерние категории
create unique index material_categories_name_key on material_categories (name); -- название категории уникально

-- Справочник номенклатуры: нормализованные наименования материалов
create table materials (
  id uuid not null default gen_random_uuid(),
  family text not null,
  name text not null,
  unit text not null,
  category_id uuid not null,
  characteristics jsonb not null,
  synonyms text[] not null,
  spellings text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column materials.family is 'семейство: bracket, rail, tile…';
comment on column materials.synonyms is 'другие названия того же материала';
comment on column materials.spellings is 'типичные написания в проектной документации';
create unique index materials_name_unit_key on materials (name, unit); -- один материал — одна строка справочника
create index materials_family_idx on materials (family); -- подбор замен и нормализация по семейству
create index materials_category_id_idx on materials (category_id); -- номенклатура по категории, подбор поставщиков

-- История изменений номенклатуры: кто, когда, какое поле, было и стало
create table material_changes (
  id uuid not null default gen_random_uuid(),
  material_id uuid not null,
  at timestamptz not null,
  actor_id uuid not null,
  field text not null,
  before text,
  after text,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column material_changes.field is 'что изменено: «наименование», «синонимы»… или «создан»';
create index material_changes_material_id_at_idx on material_changes (material_id, at desc); -- история материала
create index material_changes_actor_id_idx on material_changes (actor_id); -- внешний ключ: выборка по связи

-- Позиция спецификации, извлечённая из листа ревизии. Единственная сущность «что купить»
create table positions (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  revision_id uuid not null,
  sheet_id uuid not null,
  position text not null,
  family text not null,
  project_name text not null,
  material_id uuid,
  match_status match_status not null,
  matched_by uuid,
  matched_at timestamptz,
  characteristics jsonb not null,
  qty numeric(14,3) not null,
  unit text not null,
  confidence numeric(5,4) not null,
  region jsonb not null,
  review position_review not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  note text,
  handed_over_at timestamptz,
  purchase purchase_status not null,
  delivered_qty numeric(14,3),
  merged_into uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check ((reviewed_at is null) = (reviewed_by is null)),
  check (handed_over_at is null or review in ('confirmed', 'corrected')),
  check (purchase = 'none' or handed_over_at is not null),
  check ((review = 'merged') = (merged_into is not null)),
  check ((match_status = 'none') = (material_id is null)),
  check ((match_status = 'confirmed') = (matched_by is not null)),
  check ((matched_at is null) = (matched_by is null))
);
comment on column positions.project_id is 'денормализовано из ревизии для сводки';
comment on column positions.position is 'номер в таблице документа: «1.12»';
comment on column positions.family is 'семейство по распознаванию, до нормализации';
comment on column positions.project_name is 'наименование как в проекте';
comment on column positions.material_id is 'материал справочника: предложенный или подтверждённый; null — не сопоставлено';
comment on column positions.matched_by is 'кто подтвердил сопоставление';
comment on column positions.note is 'почему распознавание не уверено';
comment on column positions.handed_over_at is 'передана в закупку';
comment on column positions.delivered_qty is 'поставлено по актам приёмки; null — поставок не было (ADR-011)';
create unique index positions_revision_id_position_key on positions (revision_id, position); -- номер позиции уникален в ревизии документа
create index positions_revision_id_sheet_id_position_idx on positions (revision_id, sheet_id, position); -- экран проверки: позиции листа по порядку
create index positions_project_id_review_idx on positions (project_id, review); -- сводка: всего и непроверено; фильтр проверки в материалах
create index positions_project_id_purchase_idx on positions (project_id, purchase) where handed_over_at is not null; -- материалы: плитки этапов закупки, «готовы к запросу»
create index positions_material_id_idx on positions (material_id); -- потребность в материале, подбор строк запроса
create index positions_merged_into_idx on positions (merged_into) where merged_into is not null; -- история объединений
create index positions_sheet_id_idx on positions (sheet_id); -- внешний ключ: выборка по связи
create index positions_matched_by_idx on positions (matched_by); -- внешний ключ: выборка по связи
create index positions_reviewed_by_idx on positions (reviewed_by); -- внешний ключ: выборка по связи

-- Журнал изменений позиции: извлечено, подтверждено, исправлено (журнал: только insert)
create table position_changes (
  id uuid not null default gen_random_uuid(),
  position_id uuid not null,
  at timestamptz not null,
  actor_kind actor_kind not null,
  actor_id uuid,
  action text not null,
  before text,
  after text,
  row_order double precision not null default 0,
  primary key (id),
  check ((actor_kind = 'user') = (actor_id is not null))
);
create index position_changes_position_id_at_idx on position_changes (position_id, at desc); -- история позиции в карточке материала
create index position_changes_actor_id_idx on position_changes (actor_id); -- внешний ключ: выборка по связи

-- Аналог материала с причиной и разницей в цене
create table replacement_suggestions (
  id uuid not null default gen_random_uuid(),
  family text not null,
  name text not null,
  reason text not null,
  price_delta_pct numeric(5,2) not null,
  status replacement_status not null,
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check ((status = 'proposed') = (decided_by is null))
);
comment on column replacement_suggestions.price_delta_pct is 'разница в цене за единицу, %';
create index replacement_suggestions_family_status_idx on replacement_suggestions (family, status); -- замены в карточке материала и «Ждут решения»
create index replacement_suggestions_decided_by_idx on replacement_suggestions (decided_by); -- внешний ключ: выборка по связи

-- Шаблон письма запроса цены с подстановками {объект}, {контакт}, {срок}…
create table email_templates (
  id uuid not null default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id)
);
create unique index email_templates_name_key on email_templates (name); -- выбор шаблона в мастере запроса

-- Запрос цены поставщикам по материалам объекта
create table supply_requests (
  id uuid not null default gen_random_uuid(),
  number text not null,
  project_id uuid not null,
  zone_id uuid,
  author_id uuid not null,
  created_at timestamptz not null,
  sent_at timestamptz,
  reply_due_at timestamptz,
  template_id uuid,
  status request_status not null,
  source_id uuid,
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check ((status = 'draft') = (sent_at is null)),
  check (reply_due_at is null or sent_at is null or reply_due_at > sent_at)
);
comment on column supply_requests.reply_due_at is 'до какого момента ждём ответы';
create unique index supply_requests_number_key on supply_requests (number); -- номер «З-2026/318» уникален; год входит в номер, счётчик — последовательность на год
create index supply_requests_project_id_status_reply_due_at_idx on supply_requests (project_id, status, reply_due_at); -- закупки объекта: ждём ответы, просроченные; счётчики реестра
create index supply_requests_project_id_created_at_idx on supply_requests (project_id, created_at desc); -- список запросов объекта, новые сверху
create index supply_requests_zone_id_idx on supply_requests (zone_id); -- внешний ключ: выборка по связи
create index supply_requests_author_id_idx on supply_requests (author_id); -- внешний ключ: выборка по связи
create index supply_requests_template_id_idx on supply_requests (template_id); -- внешний ключ: выборка по связи
create index supply_requests_source_id_idx on supply_requests (source_id); -- внешний ключ: выборка по связи

-- Материал в запросе с суммарным количеством по позициям
create table supply_request_lines (
  id uuid not null default gen_random_uuid(),
  request_id uuid not null,
  material_id uuid,
  name text not null,
  qty numeric(14,3) not null,
  unit text not null,
  row_order double precision not null default 0,
  primary key (id),
  check (qty > 0)
);
comment on column supply_request_lines.name is 'наименование в письме поставщику';
create unique index supply_request_lines_request_id_material_id_key on supply_request_lines (request_id, material_id) where material_id is not null; -- одинаковые материалы уходят поставщику одной строкой
create index supply_request_lines_material_id_idx on supply_request_lines (material_id); -- внешний ключ: выборка по связи

-- Позиции спецификации, из которых собрана строка запроса
create table supply_request_positions (
  request_line_id uuid not null,
  position_id uuid not null,
  row_order double precision not null default 0,
  primary key (request_line_id, position_id)
);
create index supply_request_positions_position_id_idx on supply_request_positions (position_id); -- запросы позиции в карточке материала

-- Кому отправлен запрос и когда напоминали
create table supply_request_recipients (
  request_id uuid not null,
  supplier_id uuid not null,
  reminded_at timestamptz,
  row_order double precision not null default 0,
  primary key (request_id, supplier_id)
);
create index supply_request_recipients_supplier_id_idx on supply_request_recipients (supplier_id); -- история запросов поставщику

-- Ответ поставщика на запрос: условия всего предложения. Итог не хранится (R3)
create table supplier_offers (
  id uuid not null default gen_random_uuid(),
  request_id uuid not null,
  supplier_id uuid not null,
  received_at timestamptz not null,
  delivery_cost bigint not null,
  vat_pct smallint not null,
  valid_until date,
  confidence numeric(5,4) not null,
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (delivery_cost >= 0),
  check (vat_pct between 0 and 100)
);
comment on column supplier_offers.delivery_cost is 'копейки';
comment on column supplier_offers.vat_pct is 'ставка НДС, %';
comment on column supplier_offers.confidence is 'уверенность распознавания письма';
create unique index supplier_offers_request_id_supplier_id_key on supplier_offers (request_id, supplier_id); -- одно действующее предложение поставщика на запрос; колонки сравнения
create index supplier_offers_supplier_id_received_at_idx on supplier_offers (supplier_id, received_at desc); -- история предложений поставщика
create index supplier_offers_source_id_idx on supplier_offers (source_id); -- внешний ключ: выборка по связи

-- Цена поставщика по строке запроса
create table supplier_offer_lines (
  id uuid not null default gen_random_uuid(),
  offer_id uuid not null,
  request_line_id uuid not null,
  name text not null,
  price bigint not null,
  available_qty numeric(14,3) not null,
  lead_time_days smallint not null,
  deviation text,
  source_id uuid,
  location text not null,
  row_order double precision not null default 0,
  primary key (id),
  check (price >= 0),
  check (available_qty >= 0),
  check (lead_time_days >= 0)
);
comment on column supplier_offer_lines.name is 'как назвал поставщик';
comment on column supplier_offer_lines.price is 'цена за единицу без НДС, копейки';
comment on column supplier_offer_lines.deviation is 'отклонение от требования спецификации';
comment on column supplier_offer_lines.location is 'где в письме указана цена';
create unique index supplier_offer_lines_offer_id_request_line_id_key on supplier_offer_lines (offer_id, request_line_id); -- ячейки таблицы сравнения
create index supplier_offer_lines_request_line_id_idx on supplier_offer_lines (request_line_id); -- лучшая цена по материалу
create index supplier_offer_lines_source_id_idx on supplier_offer_lines (source_id); -- внешний ключ: выборка по связи

-- Поставка по запросу от выбранного поставщика; создаётся решением (ADR-011)
create table deliveries (
  id uuid not null default gen_random_uuid(),
  request_id uuid not null,
  project_id uuid not null,
  zone_id uuid,
  supplier_id uuid not null,
  decision_id uuid,
  expected_at date not null,
  received_at date,
  status delivery_status not null,
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check ((status in ('accepted', 'accepted_with_remarks')) = (received_at is not null))
);
comment on column deliveries.zone_id is 'захватка из запроса';
comment on column deliveries.decision_id is 'решение, которым создана поставка';
create index deliveries_project_id_expected_at_idx on deliveries (project_id, expected_at); -- поставки объекта по дате
create index deliveries_request_id_idx on deliveries (request_id); -- поставки по запросу
create index deliveries_project_id_status_idx on deliveries (project_id, status); -- экран поставок: к приёмке, в пути, приняты
create index deliveries_zone_id_idx on deliveries (zone_id); -- внешний ключ: выборка по связи
create index deliveries_supplier_id_idx on deliveries (supplier_id); -- внешний ключ: выборка по связи
create index deliveries_decision_id_idx on deliveries (decision_id); -- внешний ключ: выборка по связи
create index deliveries_source_id_idx on deliveries (source_id); -- внешний ключ: выборка по связи

-- Что везут в поставке и сколько принято
create table delivery_lines (
  id uuid not null default gen_random_uuid(),
  delivery_id uuid not null,
  request_line_id uuid not null,
  qty numeric(14,3) not null,
  price bigint,
  accepted_qty numeric(14,3),
  remark text,
  row_order double precision not null default 0,
  primary key (id),
  check (qty > 0),
  check (accepted_qty is null or accepted_qty >= 0)
);
comment on column delivery_lines.qty is 'заявлено поставщиком';
comment on column delivery_lines.price is 'цена из предложения, копейки за единицу';
comment on column delivery_lines.accepted_qty is 'принято по акту; null — ещё не принималось';
comment on column delivery_lines.remark is 'замечание по строке при приёмке';
create index delivery_lines_delivery_id_idx on delivery_lines (delivery_id); -- состав поставки
create index delivery_lines_request_line_id_idx on delivery_lines (request_line_id); -- внешний ключ: выборка по связи

-- Движение поставки: кто и когда перевёл статус (журнал: только insert)
create table delivery_status_changes (
  id uuid not null default gen_random_uuid(),
  delivery_id uuid not null,
  status delivery_status not null,
  at timestamptz not null,
  actor_kind actor_kind not null,
  actor_id uuid,
  note text,
  row_order double precision not null default 0,
  primary key (id),
  check ((actor_kind = 'user') = (actor_id is not null))
);
create index delivery_status_changes_delivery_id_at_idx on delivery_status_changes (delivery_id, at); -- движение поставки по времени
create index delivery_status_changes_actor_id_idx on delivery_status_changes (actor_id); -- внешний ключ: выборка по связи

-- Акт приёмки поставки: результат, чек-лист, подтверждение принявшего (журнал: только insert)
create table delivery_acceptances (
  id uuid not null default gen_random_uuid(),
  delivery_id uuid not null,
  accepted_at timestamptz not null,
  accepted_by uuid not null,
  result delivery_status not null,
  reason text,
  checklist jsonb not null,
  row_order double precision not null default 0,
  primary key (id),
  check (result <> 'rejected' or reason is not null)
);
comment on column delivery_acceptances.accepted_by is 'подтверждение приёмки сотрудником сессии; электронной подписи нет';
comment on column delivery_acceptances.reason is 'причина отклонения';
create unique index delivery_acceptances_delivery_id_key on delivery_acceptances (delivery_id); -- одна поставка — один акт
create index delivery_acceptances_accepted_by_idx on delivery_acceptances (accepted_by); -- внешний ключ: выборка по связи

-- Фотофиксация при приёмке; в демо — уменьшенная копия в состоянии вкладки
create table delivery_photos (
  id uuid not null default gen_random_uuid(),
  delivery_id uuid not null,
  acceptance_id uuid not null,
  taken_at timestamptz not null,
  taken_by uuid not null,
  data_url text not null,
  caption text,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column delivery_photos.data_url is 'JPEG data URL до ~120 КБ; с адаптером БД — ключ хранилища';
create index delivery_photos_delivery_id_idx on delivery_photos (delivery_id); -- фото поставки
create index delivery_photos_acceptance_id_idx on delivery_photos (acceptance_id); -- внешний ключ: выборка по связи
create index delivery_photos_taken_by_idx on delivery_photos (taken_by); -- внешний ключ: выборка по связи

-- Замечание по поставке для снабжения; попадает в очередь «Требует решения»
create table delivery_remarks (
  id uuid not null default gen_random_uuid(),
  delivery_id uuid not null,
  project_id uuid not null,
  line_id uuid,
  kind delivery_remark_kind not null,
  text text not null,
  created_at timestamptz not null,
  created_by uuid not null,
  status delivery_remark_status not null,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column delivery_remarks.resolution is 'чем закрыто: допоставка, скидка, возврат';
create index delivery_remarks_delivery_id_idx on delivery_remarks (delivery_id); -- замечания поставки
create index delivery_remarks_status_created_at_idx on delivery_remarks (status, created_at); -- открытые замечания на дашборде
create index delivery_remarks_project_id_idx on delivery_remarks (project_id); -- внешний ключ: выборка по связи
create index delivery_remarks_line_id_idx on delivery_remarks (line_id); -- внешний ключ: выборка по связи
create index delivery_remarks_created_by_idx on delivery_remarks (created_by); -- внешний ключ: выборка по связи
create index delivery_remarks_resolved_by_idx on delivery_remarks (resolved_by); -- внешний ключ: выборка по связи

-- Зафиксированное решение с требованием, вариантами, выбором и основанием (журнал: только insert)
create table project_decisions (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  kind decision_kind not null,
  request_id uuid,
  supplier_id uuid,
  report_id uuid,
  material_family text,
  title text not null,
  requirement text not null,
  problem text not null,
  options text[] not null,
  choice text not null,
  reason text not null,
  approved_by uuid not null,
  approved_at timestamptz not null,
  basis_label text not null,
  basis_source_id uuid,
  row_order double precision not null default 0,
  primary key (id),
  check (kind <> 'supplier' or (request_id is not null and supplier_id is not null)),
  check (cardinality(options) >= 1)
);
comment on column project_decisions.material_family is 'семейство для решений о замене';
comment on column project_decisions.basis_label is 'основание словами: «Счёт № 1184»';
create index project_decisions_project_id_approved_at_idx on project_decisions (project_id, approved_at desc); -- решения в истории объекта
create unique index project_decisions_request_id_key on project_decisions (request_id) where request_id is not null; -- решение по запросу одно
create index project_decisions_supplier_id_idx on project_decisions (supplier_id); -- внешний ключ: выборка по связи
create index project_decisions_report_id_idx on project_decisions (report_id); -- внешний ключ: выборка по связи
create index project_decisions_approved_by_idx on project_decisions (approved_by); -- внешний ключ: выборка по связи
create index project_decisions_basis_source_id_idx on project_decisions (basis_source_id); -- внешний ключ: выборка по связи

-- Первоисточник: сообщение, письмо, файл, звонок, ручной ввод (журнал: только insert)
create table sources (
  id uuid not null default gen_random_uuid(),
  kind source_kind not null,
  title text not null,
  author text not null,
  received_at timestamptz not null,
  project_id uuid,
  location text not null,
  excerpt text not null,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column sources.author is 'кто или что породило источник: ФИО, адрес письма';
comment on column sources.location is 'место внутри источника: страница, таймкод, абзац';
create index sources_project_id_received_at_idx on sources (project_id, received_at desc); -- источники объекта, панель «Источник»

-- Поле, распознанное в источнике, с уверенностью и цитатой (журнал: только insert)
create table extractions (
  id uuid not null default gen_random_uuid(),
  source_id uuid not null,
  label text not null,
  value text not null,
  confidence numeric(5,4) not null,
  quote text not null,
  location text not null,
  applied_entity text,
  applied_id text,
  row_order double precision not null default 0,
  primary key (id),
  check ((applied_entity is null) = (applied_id is null))
);
comment on column extractions.applied_entity is 'таблица, куда легло значение после подтверждения';
comment on column extractions.applied_id is 'id строки в applied_entity';
create index extractions_source_id_idx on extractions (source_id); -- распознанные поля в панели источника и в отчёте
create index extractions_applied_entity_applied_id_idx on extractions (applied_entity, applied_id) where applied_id is not null; -- откуда взялось значение сущности

-- Отчёт прораба из Telegram: объём по захватке, фото, проблемы
create table field_reports (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  zone_id uuid not null,
  author_id uuid not null,
  crew_id uuid,
  report_date date not null,
  sent_at timestamptz not null,
  kind report_kind not null,
  work_type text not null,
  status report_status not null,
  summary text not null,
  declared_qty numeric(14,3) not null,
  unit text not null,
  accepted_qty numeric(14,3),
  headcount smallint not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  row_order double precision not null default 0,
  primary key (id),
  check ((status = 'accepted') = (accepted_qty is not null)),
  check (declared_qty >= 0),
  check (headcount >= 0)
);
create index field_reports_project_id_report_date_idx on field_reports (project_id, report_date desc); -- лента отчётов объекта по дням
create index field_reports_project_id_status_idx on field_reports (project_id, status); -- фильтр «На проверке», счётчики
create index field_reports_zone_id_status_idx on field_reports (zone_id, status); -- фильтр по захватке, факт захватки по принятым
create index field_reports_crew_id_report_date_idx on field_reports (crew_id, report_date desc); -- отсутствующие отчёты бригад
create index field_reports_author_id_idx on field_reports (author_id); -- внешний ключ: выборка по связи
create index field_reports_source_id_idx on field_reports (source_id); -- внешний ключ: выборка по связи

-- Проблема, найденная в отчёте
create table field_report_issues (
  id uuid not null default gen_random_uuid(),
  report_id uuid not null,
  text text not null,
  severity issue_severity not null,
  row_order double precision not null default 0,
  primary key (id)
);
create index field_report_issues_report_id_idx on field_report_issues (report_id); -- проблемы в карточке отчёта

-- Фото, аудио или файл отчёта с площадки
create table evidence (
  id uuid not null default gen_random_uuid(),
  report_id uuid not null,
  kind evidence_kind not null,
  caption text not null,
  taken_at timestamptz not null,
  location text not null,
  row_order double precision not null default 0,
  primary key (id)
);
comment on column evidence.location is 'таймкод, номер фото';
create index evidence_report_id_taken_at_idx on evidence (report_id, taken_at); -- галерея отчёта по времени съёмки

-- Журнал истории объекта. Пишется действиями и обработкой, не редактируется (журнал: только insert)
create table project_events (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  occurred_at timestamptz not null,
  type event_type not null,
  title text not null,
  details text,
  actor_kind actor_kind not null,
  actor_id uuid,
  source_id uuid,
  request_id uuid,
  revision_id uuid,
  position_id uuid,
  report_id uuid,
  delivery_id uuid,
  row_order double precision not null default 0,
  primary key (id),
  check ((actor_kind = 'user') = (actor_id is not null))
);
create index project_events_project_id_occurred_at_idx on project_events (project_id, occurred_at desc); -- лента «История и решения», сводка
create index project_events_project_id_type_occurred_at_idx on project_events (project_id, type, occurred_at desc); -- фильтр ленты по типу события
create index project_events_actor_id_idx on project_events (actor_id); -- внешний ключ: выборка по связи
create index project_events_source_id_idx on project_events (source_id); -- внешний ключ: выборка по связи
create index project_events_request_id_idx on project_events (request_id); -- внешний ключ: выборка по связи
create index project_events_revision_id_idx on project_events (revision_id); -- внешний ключ: выборка по связи
create index project_events_position_id_idx on project_events (position_id); -- внешний ключ: выборка по связи
create index project_events_report_id_idx on project_events (report_id); -- внешний ключ: выборка по связи
create index project_events_delivery_id_idx on project_events (delivery_id); -- внешний ключ: выборка по связи

-- Внешние ключи отдельно: между таблицами есть взаимные ссылки
alter table employees add foreign key (created_by) references employees (id) on delete restrict;
alter table project_members add foreign key (project_id) references projects (id) on delete cascade;
alter table project_members add foreign key (employee_id) references employees (id) on delete restrict;
alter table counterparties add foreign key (created_by) references employees (id) on delete restrict;
alter table supplier_profiles add foreign key (supplier_id) references counterparties (id) on delete cascade;
alter table supplier_profiles add foreign key (created_by) references employees (id) on delete restrict;
alter table crews add foreign key (project_id) references projects (id) on delete cascade;
alter table crews add foreign key (foreman_id) references employees (id) on delete restrict;
alter table crews add foreign key (created_by) references employees (id) on delete restrict;
alter table crew_members add foreign key (crew_id) references crews (id) on delete cascade;
alter table crew_members add foreign key (employee_id) references employees (id) on delete restrict;
alter table projects add foreign key (customer_id) references counterparties (id) on delete restrict;
alter table projects add foreign key (manager_id) references employees (id) on delete restrict;
alter table projects add foreign key (created_by) references employees (id) on delete restrict;
alter table contracts add foreign key (project_id) references projects (id) on delete restrict;
alter table contracts add foreign key (customer_id) references counterparties (id) on delete restrict;
alter table contracts add foreign key (source_id) references sources (id) on delete set null;
alter table contracts add foreign key (created_by) references employees (id) on delete restrict;
alter table milestones add foreign key (contract_id) references contracts (id) on delete cascade;
alter table milestones add foreign key (source_id) references sources (id) on delete set null;
alter table milestones add foreign key (created_by) references employees (id) on delete restrict;
alter table work_zones add foreign key (project_id) references projects (id) on delete cascade;
alter table work_zones add foreign key (parent_id) references work_zones (id) on delete cascade;
alter table work_zones add foreign key (created_by) references employees (id) on delete restrict;
alter table documents add foreign key (project_id) references projects (id) on delete restrict;
alter table documents add foreign key (created_by) references employees (id) on delete restrict;
alter table document_revisions add foreign key (document_id) references documents (id) on delete restrict;
alter table document_revisions add foreign key (uploaded_by) references employees (id) on delete restrict;
alter table document_revisions add foreign key (source_id) references sources (id) on delete set null;
alter table document_revisions add foreign key (created_by) references employees (id) on delete restrict;
alter table extraction_jobs add foreign key (revision_id) references document_revisions (id) on delete cascade;
alter table document_sheets add foreign key (revision_id) references document_revisions (id) on delete cascade;
alter table revision_changes add foreign key (document_id) references documents (id) on delete cascade;
alter table revision_changes add foreign key (from_revision_id) references document_revisions (id) on delete restrict;
alter table revision_changes add foreign key (to_revision_id) references document_revisions (id) on delete restrict;
alter table revision_changes add foreign key (resolved_by) references employees (id) on delete restrict;
alter table revision_changes add foreign key (created_by) references employees (id) on delete restrict;
alter table material_categories add foreign key (parent_id) references material_categories (id) on delete restrict;
alter table material_categories add foreign key (created_by) references employees (id) on delete restrict;
alter table materials add foreign key (category_id) references material_categories (id) on delete restrict;
alter table materials add foreign key (created_by) references employees (id) on delete restrict;
alter table material_changes add foreign key (material_id) references materials (id) on delete cascade;
alter table material_changes add foreign key (actor_id) references employees (id) on delete restrict;
alter table positions add foreign key (project_id) references projects (id) on delete restrict;
alter table positions add foreign key (revision_id) references document_revisions (id) on delete restrict;
alter table positions add foreign key (sheet_id) references document_sheets (id) on delete restrict;
alter table positions add foreign key (material_id) references materials (id) on delete restrict;
alter table positions add foreign key (matched_by) references employees (id) on delete restrict;
alter table positions add foreign key (reviewed_by) references employees (id) on delete restrict;
alter table positions add foreign key (merged_into) references positions (id) on delete restrict;
alter table positions add foreign key (created_by) references employees (id) on delete restrict;
alter table position_changes add foreign key (position_id) references positions (id) on delete restrict;
alter table position_changes add foreign key (actor_id) references employees (id) on delete restrict;
alter table replacement_suggestions add foreign key (decided_by) references employees (id) on delete restrict;
alter table replacement_suggestions add foreign key (created_by) references employees (id) on delete restrict;
alter table email_templates add foreign key (created_by) references employees (id) on delete restrict;
alter table supply_requests add foreign key (project_id) references projects (id) on delete restrict;
alter table supply_requests add foreign key (zone_id) references work_zones (id) on delete set null;
alter table supply_requests add foreign key (author_id) references employees (id) on delete restrict;
alter table supply_requests add foreign key (template_id) references email_templates (id) on delete set null;
alter table supply_requests add foreign key (source_id) references sources (id) on delete set null;
alter table supply_requests add foreign key (created_by) references employees (id) on delete restrict;
alter table supply_request_lines add foreign key (request_id) references supply_requests (id) on delete cascade;
alter table supply_request_lines add foreign key (material_id) references materials (id) on delete restrict;
alter table supply_request_positions add foreign key (request_line_id) references supply_request_lines (id) on delete cascade;
alter table supply_request_positions add foreign key (position_id) references positions (id) on delete restrict;
alter table supply_request_recipients add foreign key (request_id) references supply_requests (id) on delete cascade;
alter table supply_request_recipients add foreign key (supplier_id) references counterparties (id) on delete restrict;
alter table supplier_offers add foreign key (request_id) references supply_requests (id) on delete restrict;
alter table supplier_offers add foreign key (supplier_id) references counterparties (id) on delete restrict;
alter table supplier_offers add foreign key (source_id) references sources (id) on delete set null;
alter table supplier_offers add foreign key (created_by) references employees (id) on delete restrict;
alter table supplier_offer_lines add foreign key (offer_id) references supplier_offers (id) on delete cascade;
alter table supplier_offer_lines add foreign key (request_line_id) references supply_request_lines (id) on delete restrict;
alter table supplier_offer_lines add foreign key (source_id) references sources (id) on delete set null;
alter table deliveries add foreign key (request_id) references supply_requests (id) on delete restrict;
alter table deliveries add foreign key (project_id) references projects (id) on delete restrict;
alter table deliveries add foreign key (zone_id) references work_zones (id) on delete set null;
alter table deliveries add foreign key (supplier_id) references counterparties (id) on delete restrict;
alter table deliveries add foreign key (decision_id) references project_decisions (id) on delete restrict;
alter table deliveries add foreign key (source_id) references sources (id) on delete set null;
alter table deliveries add foreign key (created_by) references employees (id) on delete restrict;
alter table delivery_lines add foreign key (delivery_id) references deliveries (id) on delete cascade;
alter table delivery_lines add foreign key (request_line_id) references supply_request_lines (id) on delete restrict;
alter table delivery_status_changes add foreign key (delivery_id) references deliveries (id) on delete cascade;
alter table delivery_status_changes add foreign key (actor_id) references employees (id) on delete restrict;
alter table delivery_acceptances add foreign key (delivery_id) references deliveries (id) on delete cascade;
alter table delivery_acceptances add foreign key (accepted_by) references employees (id) on delete restrict;
alter table delivery_photos add foreign key (delivery_id) references deliveries (id) on delete cascade;
alter table delivery_photos add foreign key (acceptance_id) references delivery_acceptances (id) on delete cascade;
alter table delivery_photos add foreign key (taken_by) references employees (id) on delete restrict;
alter table delivery_remarks add foreign key (delivery_id) references deliveries (id) on delete cascade;
alter table delivery_remarks add foreign key (project_id) references projects (id) on delete restrict;
alter table delivery_remarks add foreign key (line_id) references delivery_lines (id) on delete cascade;
alter table delivery_remarks add foreign key (created_by) references employees (id) on delete restrict;
alter table delivery_remarks add foreign key (resolved_by) references employees (id) on delete restrict;
alter table project_decisions add foreign key (project_id) references projects (id) on delete restrict;
alter table project_decisions add foreign key (request_id) references supply_requests (id) on delete restrict;
alter table project_decisions add foreign key (supplier_id) references counterparties (id) on delete restrict;
alter table project_decisions add foreign key (report_id) references field_reports (id) on delete restrict;
alter table project_decisions add foreign key (approved_by) references employees (id) on delete restrict;
alter table project_decisions add foreign key (basis_source_id) references sources (id) on delete set null;
alter table sources add foreign key (project_id) references projects (id) on delete restrict;
alter table extractions add foreign key (source_id) references sources (id) on delete cascade;
alter table field_reports add foreign key (project_id) references projects (id) on delete restrict;
alter table field_reports add foreign key (zone_id) references work_zones (id) on delete restrict;
alter table field_reports add foreign key (author_id) references employees (id) on delete restrict;
alter table field_reports add foreign key (crew_id) references crews (id) on delete set null;
alter table field_reports add foreign key (source_id) references sources (id) on delete restrict;
alter table field_reports add foreign key (created_by) references employees (id) on delete restrict;
alter table field_report_issues add foreign key (report_id) references field_reports (id) on delete cascade;
alter table evidence add foreign key (report_id) references field_reports (id) on delete cascade;
alter table project_events add foreign key (project_id) references projects (id) on delete restrict;
alter table project_events add foreign key (actor_id) references employees (id) on delete restrict;
alter table project_events add foreign key (source_id) references sources (id) on delete set null;
alter table project_events add foreign key (request_id) references supply_requests (id) on delete restrict;
alter table project_events add foreign key (revision_id) references document_revisions (id) on delete restrict;
alter table project_events add foreign key (position_id) references positions (id) on delete restrict;
alter table project_events add foreign key (report_id) references field_reports (id) on delete restrict;
alter table project_events add foreign key (delivery_id) references deliveries (id) on delete restrict;

-- Журналы: роль приложения может только добавлять строки
revoke update, delete on position_changes from app_user;
revoke update, delete on delivery_status_changes from app_user;
revoke update, delete on delivery_acceptances from app_user;
revoke update, delete on project_decisions from app_user;
revoke update, delete on sources from app_user;
revoke update, delete on extractions from app_user;
revoke update, delete on project_events from app_user;
