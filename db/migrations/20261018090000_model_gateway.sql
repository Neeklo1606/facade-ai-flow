-- migrate:up
-- Журнал обращений к модели (ADR-035, п. 3). Только добавление: это журнал работы шлюза,
-- а не состояние. Содержимого запроса здесь нет — ни текста сообщения, ни аудио.
create type ai_task as enum ('transcribe', 'extract', 'draft', 'answer');
create type ai_job_status as enum ('ok', 'invalid', 'failed');

create table processing_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects (id) on delete restrict,
  source_id uuid references sources (id) on delete cascade,
  task ai_task not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  status ai_job_status not null,
  started_at timestamptz not null,
  duration_ms integer not null,
  tokens_in integer,
  tokens_out integer,
  cost_kopecks bigint,
  refusal text,
  result jsonb,
  row_order double precision not null default 0,
  -- Результат есть ровно у успешной обработки, отказ обязан назвать причину
  constraint processing_jobs_duration_check check (duration_ms >= 0),
  constraint processing_jobs_result_check check ((status = 'ok') = (result is not null)),
  constraint processing_jobs_refusal_check check ((status = 'ok') or (refusal is not null))
);
create index processing_jobs_project_idx on processing_jobs (project_id, started_at desc);
create index processing_jobs_source_idx on processing_jobs (source_id);

-- migrate:down
drop table processing_jobs;
drop type ai_job_status;
drop type ai_task;
