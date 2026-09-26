-- migrate:up
-- Вход сотрудника (ADR-021). Таблицы входа живут вне src/contracts: это инфраструктура
-- сервера, её нет в демо-контуре, она не участвует в паритете с демо-адаптером и не имеет
-- фикстур. Поэтому и схема здесь пишется руками, а не генерируется из контрактов.

-- Почта сотрудника: запасной способ входа и приглашение по ссылке. У прораба её часто нет,
-- поэтому колонка необязательная (ADR-021, п. 2).
alter table employees add column email text;

-- Код подтверждения. Хранится хэшем: журнал базы не должен давать вход.
create table auth_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts_left smallint not null default 3,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index auth_codes_phone_idx on auth_codes (phone, created_at desc);

-- Сессия. Кука хранит идентификатор этой строки, а не сотрудника: выход гасит строку,
-- и украденная кука перестаёт работать (ADR-021, п. 4).
create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);
create index auth_sessions_employee_idx on auth_sessions (employee_id) where revoked_at is null;

-- Приглашение: одноразовая ссылка на 72 часа. Живых приглашений на сотрудника не больше одного —
-- выдача нового гасит предыдущее (ADR-021, п. 8).
create table auth_invites (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  token_hash text not null,
  phone text,
  email text,
  created_by uuid not null references employees (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create unique index auth_invites_live_idx on auth_invites (employee_id)
  where accepted_at is null and revoked_at is null;

-- migrate:down
drop table auth_invites;
drop table auth_sessions;
drop table auth_codes;
alter table employees drop column email;
