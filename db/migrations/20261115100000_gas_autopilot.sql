-- migrate:up
-- Автопилот проверки (ADR-070): решение автопилота в записи времени.
-- Сгенерировано scripts/gas-schema.ts из src/contracts/gas.ts. Не редактировать вручную.

alter table gas_time_entries add column "auto_decision" jsonb;
comment on column gas_time_entries."auto_decision" is 'решение автопилота при отправке: правило, версия, причины, выборка (ADR-070)';

-- migrate:down
alter table gas_time_entries drop column if exists "auto_decision";
