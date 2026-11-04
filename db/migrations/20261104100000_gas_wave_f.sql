-- migrate:up
-- Волна F (ADR-062): телефон бригады из импорта справочников.
-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.

alter table gas_brigades add column "phone" text;
comment on column gas_brigades."phone" is 'телефон бригады из справочника; null — не указан';

-- migrate:down
alter table gas_brigades drop column if exists "phone";
