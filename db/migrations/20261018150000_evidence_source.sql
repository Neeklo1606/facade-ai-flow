-- migrate:up
-- Материалы записи до отчёта (ADR-036, п. 1): фото во время записи приходит раньше, чем
-- появляется отчёт, а отчёт появляется только после подтверждения человеком. Поэтому материал
-- висит либо на отчёте, либо на источнике — ровно на одном из двух.
alter table evidence add column source_id uuid references sources (id) on delete cascade;
alter table evidence alter column report_id drop not null;
alter table evidence
  add constraint evidence_owner_check check ((report_id is null) <> (source_id is null));
create index evidence_source_idx on evidence (source_id, taken_at);

-- migrate:down
drop index evidence_source_idx;
alter table evidence drop constraint evidence_owner_check;
delete from evidence where report_id is null;
alter table evidence alter column report_id set not null;
alter table evidence drop column source_id;
