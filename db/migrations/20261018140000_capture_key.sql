-- migrate:up
-- Ключ идемпотентности отправки (ADR-036, п. 4): повтор с тем же ключом возвращает тот же
-- источник. Ключ создаёт клиент и хранит рядом с черновиком, поэтому обрыв сети на отправке
-- не оставляет дублей — ни при повторе кнопкой, ни после перезагрузки вкладки.
alter table sources add column capture_key text;
create unique index sources_capture_key_idx on sources (capture_key) where capture_key is not null;

-- migrate:down
drop index sources_capture_key_idx;
alter table sources drop column capture_key;
