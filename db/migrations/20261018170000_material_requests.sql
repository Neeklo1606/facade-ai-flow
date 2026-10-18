-- migrate:up
-- Заявка на материал с площадки (ADR-037, сценарий 3). Прораб говорит, чего не хватает,
-- снабжение видит заявку и меняет статус руками: ничего не заказывается автоматически.
create type material_request_status as enum ('new', 'accepted', 'ordered', 'closed', 'declined');

create table material_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete restrict,
  source_id uuid references sources (id) on delete set null,
  name text not null,
  qty numeric(14,3) not null,
  unit text not null,
  needed_by date not null,
  status material_request_status not null,
  note text not null,
  author_id uuid not null references employees (id) on delete restrict,
  requested_at timestamptz not null,
  decided_by uuid references employees (id) on delete set null,
  decided_at timestamptz,
  decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references employees (id) on delete set null,
  row_order double precision not null default 0,
  constraint material_requests_qty_check check (qty > 0),
  constraint material_requests_decision_check check ((decided_by is null) = (decided_at is null))
);
create index material_requests_project_idx on material_requests (project_id, needed_by);
create index material_requests_queue_idx on material_requests (status, needed_by);
create index material_requests_author_idx on material_requests (author_id, requested_at desc);

-- migrate:down
drop table material_requests;
drop type material_request_status;
