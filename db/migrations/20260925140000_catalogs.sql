-- migrate:up
-- Журнал изменений справочников (ADR-023, п. 6): категории и поставщики. У материалов свой
-- журнал (material_changes, ADR-014) — он висит на карточке материала и уходит вместе с ним.
create type catalog_entity as enum ('category', 'supplier');

create table catalog_changes (
  id uuid primary key default gen_random_uuid(),
  entity catalog_entity not null,
  entity_id text not null,
  entity_name text not null,
  field text not null,
  before text,
  after text,
  at timestamptz not null default now(),
  by uuid not null references employees (id) on delete restrict,
  row_order double precision not null default 0
);
create index catalog_changes_entity_idx on catalog_changes (entity, at desc);

-- migrate:down
drop table catalog_changes;
drop type catalog_entity;
