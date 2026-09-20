-- migrate:up
-- Смена показанного статуса действием пишется в историю объекта (ADR-015, п. 7):
-- статус объекта, выполненная контрольная точка, разобранное изменение документации.
-- Новые значения в транзакции миграции только добавляются; используются уже после неё.
alter type event_type add value if not exists 'project_status_changed';
alter type event_type add value if not exists 'milestone_done';
alter type event_type add value if not exists 'change_resolved';

-- migrate:down
-- PostgreSQL не удаляет значения перечисления. Откат оставляет их: значения без строк
-- ничему не мешают, а строки истории с ними удалять нельзя — журнал только пополняется.
select 1;
